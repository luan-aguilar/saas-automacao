import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint chamado pelo bloco "Webhook / Automação Externa" do fluxo de
 * estúdio de tatuagem (ver `src/lib/templates/klan-tattoo-template.ts`) —
 * calcula o valor da tatuagem a partir do que a IA já coletou na conversa
 * (referência, tamanho em cm, região do corpo, se é só preto/só contorno).
 *
 * Valores e regras confirmados com a Klan Tattoo em 2026-09-04:
 *   - Flash Tattoo (até 6cm, só preto, só contorno/sem sombreamento) tem
 *     preço FIXO — R$92 em promoção (ativa hoje) ou R$120 fora dela.
 *   - Fora dessa definição, o preço é uma FAIXA estimada (fórmula abaixo) —
 *     nunca um valor fechado, a avaliação final é sempre do tatuador,
 *     presencial ou pelo decalque.
 */

const BASE_PRICE = 150; // preço mínimo de qualquer tatuagem, por menor que seja
const PRICE_PER_CM = 25; // acréscimo por cm (na maior dimensão informada)

// ---------------------------------------------------------------------------
// FLASH TATTOO — preço fixo
// ---------------------------------------------------------------------------
const FLASH_MAX_SIZE_CM = 6;
/** Trocar manualmente pra `false` quando a promoção da Klan acabar (volta a cobrar R$120). */
const FLASH_PROMO_ACTIVE = true;
const FLASH_PRICE_PROMO = 92;
const FLASH_PRICE_REGULAR = 120;

/** Multiplicador por nível de complexidade (1 = traço simples, 5 = realismo/muito detalhe). */
const COMPLEXITY_MULTIPLIER: Record<string, number> = {
  "1": 1.0,
  "2": 1.2,
  "3": 1.5,
  "4": 1.9,
  "5": 2.4,
};

// ---------------------------------------------------------------------------
// REGIÃO DO CORPO — 5 níveis de dificuldade/dor, definidos pela Klan Tattoo
// (2026-09-04). O multiplicador é aplicado só na PARTE do preço que já
// escala com o tamanho (tamanho_cm * preço-por-cm), nunca na taxa base fixa
// — assim uma tatuagem pequena e simples numa região difícil (ex: um nome
// pequeno na costela) não "explode" de preço proporcionalmente igual a uma
// tatuagem grande na mesma região, o que faria o cliente desistir à toa.
// ---------------------------------------------------------------------------
type RegionLevel = 1 | 2 | 3 | 4 | 5;

const REGION_LEVEL_MULTIPLIER: Record<RegionLevel, number> = {
  1: 1.0,
  2: 1.15,
  3: 1.3,
  4: 1.5,
  5: 1.75,
};

/**
 * Ordem importa: frases mais específicas (ex: "coxa interna") são testadas
 * ANTES das genéricas (ex: "coxa" sozinha) — senão a genérica "ganharia"
 * primeiro e a variante interna/externa nunca seria distinguida. Por isso a
 * lista percorre do nível 5 pro 1 (não por importância, só porque as frases
 * mais específicas calharam de ser as dos níveis mais altos).
 */
const REGION_TIERS: Array<{ level: RegionLevel; keywords: string[] }> = [
  {
    level: 5,
    keywords: [
      "virilha",
      "nadega",
      "nadegas",
      "cabeca",
      "estomago",
      "barriga",
      "abdomen",
      "costela",
      "costelas",
      "coxa interna",
      "interna da coxa",
      "parte interna da coxa",
    ],
  },
  {
    level: 4,
    keywords: ["panturrilha interna", "interna da panturrilha", "parte interna da panturrilha", "pe", "pes", "peito", "orelha", "orelhas"],
  },
  {
    level: 3,
    keywords: [
      "pulso",
      "mao",
      "maos",
      "dedo",
      "dedos",
      "costas",
      "cotovelo",
      "braco interno",
      "interno do braco",
      "parte interna do braco",
      "panturrilha atras",
      "atras da panturrilha",
      "panturrilha de tras",
    ],
  },
  {
    level: 2,
    keywords: ["perna", "panturrilha externa", "externa da panturrilha", "coxa externa", "externa da coxa", "panturrilha", "coxa"],
  },
  {
    level: 1,
    keywords: ["antebraco", "braco"],
  },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Match de palavra/frase inteira (com \b), não substring solta — evita falso positivo tipo "pe" batendo dentro de "perna". */
function hasPhrase(normalized: string, phrase: string): boolean {
  const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`);
  return pattern.test(normalized);
}

/** Região não reconhecida cai no nível 1 (sem penalidade) — o tatuador confirma o valor final de qualquer forma. */
function resolveRegionLevel(regiao: string | undefined): RegionLevel {
  if (!regiao) return 1;
  const normalized = normalize(regiao);
  for (const tier of REGION_TIERS) {
    if (tier.keywords.some((k) => hasPhrase(normalized, k))) return tier.level;
  }
  return 1;
}

function parseSizeCm(raw: string | undefined): number {
  if (!raw) return 10; // sem informação, assume um tamanho pequeno-médio conservador
  const match = raw.replace(",", ".").match(/\d+(\.\d+)?/);
  const value = match ? parseFloat(match[0]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = normalize(raw).trim();
  return normalized === "sim" || normalized === "true" || normalized === "yes";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const sizeCm = parseSizeCm(body.tamanho_cm);
  const apenasPreto = parseBooleanFlag(body.apenas_preto);
  const apenasContorno = parseBooleanFlag(body.apenas_contorno);

  const isFlashTattoo = sizeCm <= FLASH_MAX_SIZE_CM && apenasPreto && apenasContorno;
  if (isFlashTattoo) {
    const price = FLASH_PROMO_ACTIVE ? FLASH_PRICE_PROMO : FLASH_PRICE_REGULAR;
    return NextResponse.json({
      preco_min: String(price),
      preco_max: String(price),
      preco_estimado: `R$ ${price} (Flash Tattoo${FLASH_PROMO_ACTIVE ? " em promoção" : ""})`,
    });
  }

  const complexityKey = String(body.complexidade_estimada ?? "3").trim();
  const complexityMultiplier = COMPLEXITY_MULTIPLIER[complexityKey] ?? COMPLEXITY_MULTIPLIER["3"];
  const regionMultiplier = REGION_LEVEL_MULTIPLIER[resolveRegionLevel(body.regiao_corpo)];

  const rawEstimate = (BASE_PRICE + sizeCm * PRICE_PER_CM * regionMultiplier) * complexityMultiplier;

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
