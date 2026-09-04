import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint chamado pelo bloco "Webhook / Automação Externa" do fluxo de
 * estúdio de tatuagem (ver `src/lib/templates/tattoo-studio-template.ts`) —
 * calcula uma FAIXA de preço estimado a partir do que a IA já coletou na
 * conversa (complexidade da referência, tamanho em cm, região do corpo).
 *
 * ---------------------------------------------------------------------------
 * PLACEHOLDER — os valores abaixo (preço base, preço por cm, multiplicadores)
 * são só um ponto de partida razoável, NÃO os preços reais da Klan Tattoo.
 * O Luan (ou o próprio estúdio) precisa ajustar essas constantes pra
 * refletir a tabela de preço real deles antes de usar isso com cliente de
 * verdade. Tudo centralizado aqui, só editar este arquivo.
 * ---------------------------------------------------------------------------
 */

const BASE_PRICE = 150; // preço mínimo de qualquer tatuagem, por menor que seja
const PRICE_PER_CM = 25; // acréscimo por cm (na maior dimensão informada)

/** Multiplicador por nível de complexidade (1 = traço simples, 5 = realismo/muito detalhe). */
const COMPLEXITY_MULTIPLIER: Record<string, number> = {
  "1": 1.0,
  "2": 1.2,
  "3": 1.5,
  "4": 1.9,
  "5": 2.4,
};

/**
 * Multiplicador por região do corpo — regiões mais doloridas/difíceis de
 * tatuar costumam custar mais. Comparação por palavra-chave (sem acento,
 * minúsculo) no texto que a IA capturou em `regiao_corpo`.
 */
const REGION_MULTIPLIER: Array<{ keywords: string[]; multiplier: number }> = [
  { keywords: ["costela", "costelas"], multiplier: 1.4 },
  { keywords: ["pescoco"], multiplier: 1.3 },
  { keywords: ["mao", "maos", "dedo", "dedos"], multiplier: 1.3 },
  { keywords: ["pe", "pes"], multiplier: 1.3 },
  { keywords: ["estomago", "barriga", "abdomen"], multiplier: 1.2 },
  { keywords: ["antebraco", "braco", "panturrilha", "coxa", "perna", "costas", "peito"], multiplier: 1.0 },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function resolveRegionMultiplier(regiao: string | undefined): number {
  if (!regiao) return 1.0;
  const normalized = normalize(regiao);
  for (const entry of REGION_MULTIPLIER) {
    if (entry.keywords.some((k) => normalized.includes(k))) return entry.multiplier;
  }
  return 1.0; // região não reconhecida — sem ajuste, não penaliza nem favorece
}

function parseSizeCm(raw: string | undefined): number {
  if (!raw) return 10; // sem informação, assume um tamanho pequeno-médio conservador
  const match = raw.replace(",", ".").match(/\d+(\.\d+)?/);
  const value = match ? parseFloat(match[0]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const sizeCm = parseSizeCm(body.tamanho_cm);
  const complexityKey = String(body.complexidade_estimada ?? "3").trim();
  const complexityMultiplier = COMPLEXITY_MULTIPLIER[complexityKey] ?? COMPLEXITY_MULTIPLIER["3"];
  const regionMultiplier = resolveRegionMultiplier(body.regiao_corpo);

  const rawEstimate = (BASE_PRICE + sizeCm * PRICE_PER_CM) * complexityMultiplier * regionMultiplier;

  // Faixa de +-15% em volta da estimativa central — comunica que é uma
  // aproximação, nunca um preço fechado (avaliação final é sempre do
  // tatuador, presencial ou pelo decalque).
  const min = Math.round((rawEstimate * 0.85) / 10) * 10;
  const max = Math.round((rawEstimate * 1.15) / 10) * 10;

  return NextResponse.json({
    preco_min: String(min),
    preco_max: String(max),
    preco_estimado: `R$ ${min} a R$ ${max}`,
  });
}
