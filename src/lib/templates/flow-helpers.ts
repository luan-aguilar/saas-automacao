/**
 * Helpers compartilhados entre os templates pré-definidos do Construtor de
 * Fluxos (ver `beauty-salon-template.ts` para o primeiro uso destes) —
 * extraídos aqui quando um segundo template passou a precisar exatamente das
 * mesmas peças (nodes de condição, mensagem estática em texto puro, arestas,
 * numeração em emoji).
 */

import type { Node, Edge } from "@xyflow/react";

export const KEYCAP_DIGITS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

/**
 * Converte um número inteiro positivo numa sequência de emojis de "keycap"
 * (ex: 7 -> "7️⃣", 23 -> "2️⃣3️⃣"). Não existe um emoji nativo para números de
 * dois dígitos, então a convenção usada (a mesma que as IAs dos templates
 * recebem instrução de seguir nos prompts) é encadear um emoji por dígito,
 * sem espaço entre eles.
 */
export function emojiNumber(n: number): string {
  return String(n)
    .split("")
    .map((digit) => KEYCAP_DIGITS[Number(digit)])
    .join("");
}

export function conditionNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  value: string,
  operator: "CONTAINS" | "EQUALS" | "STARTS_WITH" = "CONTAINS",
  variable = "ultima_resposta"
): Node {
  return {
    id,
    type: "condition",
    position,
    data: { label, variable, operator, value },
  };
}

/** Node de mensagem estática em texto puro (sem botões/lista). */
export function plainTextNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  message: string,
  waitForReply = false,
  disablesAiForChat = false,
  extra?: { setVariables?: Record<string, string>; captureLastReplyInto?: string }
): Node {
  return {
    id,
    type: "staticMessage",
    position,
    data: { label, message, buttons: [], waitForReply, disablesAiForChat, ...extra },
  };
}

export function edge(id: string, source: string, target: string, sourceHandle?: "yes" | "no"): Edge {
  return {
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    type: "deletable",
    animated: true,
  };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KEYCAP_ALTERNATION = KEYCAP_DIGITS.map(escapeRegex).join("|");
const LEADING_NUMBER_RE = new RegExp(`^((?:${KEYCAP_ALTERNATION})+)\\s*(.+)$`);
const SINGLE_KEYCAP_RE = new RegExp(KEYCAP_ALTERNATION, "g");

/** Converte uma sequência de emojis "keycap" (ex: "1️⃣0️⃣") de volta pro número que representa (ex: "10"). */
function emojiSequenceToNumber(sequence: string): string {
  const matches = sequence.match(SINGLE_KEYCAP_RE) ?? [];
  return matches.map((emoji) => String(KEYCAP_DIGITS.indexOf(emoji))).join("");
}

/**
 * Divide um texto de histórico (formato usado em `_ai_history`: linhas
 * "Cliente: "/"Assistente: " intercaladas, cada mensagem podendo ocupar
 * várias linhas) em turnos — linhas que não começam com um desses prefixos
 * são continuação do turno anterior (ex: uma lista numerada de várias
 * linhas dentro de uma única mensagem do assistente).
 */
export function splitHistoryTurns(history: string): { speaker: "Cliente" | "Assistente"; text: string }[] {
  const lines = history.split("\n");
  const turns: { speaker: "Cliente" | "Assistente"; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^(Cliente|Assistente): (.*)$/);
    if (match) {
      turns.push({ speaker: match[1] as "Cliente" | "Assistente", text: match[2] });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += "\n" + line;
    }
  }
  return turns;
}

/**
 * Se a ÚLTIMA mensagem do assistente no histórico continha uma lista
 * numerada (convenção de emoji "keycap" usada em todo o app — ver
 * `emojiNumber`) e a resposta mais recente do cliente for só um número
 * puro, devolve o texto EXATO do item correspondente daquela lista.
 *
 * Isso existe porque pedir pra um modelo de IA "contar" a posição certa
 * numa lista de até 20+ itens é pouco confiável — em teste ao vivo, um
 * cliente respondeu "5" pro catálogo de Unhas e a IA confirmou o item 6
 * ("Manutenção acima de 30 dias" em vez de "Manutenção 15 a 20 dias").
 * Resolver isso por código (contagem exata, sem chance de erro) e entregar
 * o resultado já pronto pro prompt da IA elimina essa classe de erro
 * inteira — a IA só precisa decidir EM QUE VARIÁVEL guardar o valor
 * (ela sabe o contexto semântico), não mais CONTAR a posição.
 *
 * Devolve null se não houver lista numerada recente ou a resposta não bater
 * com nenhum item dela (nesse caso, a IA volta a interpretar normalmente).
 */
export function resolveNumberedListChoice(history: string, incomingText: string): string | null {
  const choice = incomingText.trim();
  if (!/^\d+$/.test(choice)) return null;

  const turns = splitHistoryTurns(history);
  const lastAssistantTurn = [...turns].reverse().find((t) => t.speaker === "Assistente");
  if (!lastAssistantTurn) return null;

  for (const line of lastAssistantTurn.text.split("\n")) {
    const match = line.match(LEADING_NUMBER_RE);
    if (!match) continue;
    if (emojiSequenceToNumber(match[1]) === choice) {
      return match[2].trim();
    }
  }
  return null;
}

const WEEKDAY_PATTERNS: { regex: RegExp; dow: number }[] = [
  { regex: /domingo/i, dow: 0 },
  { regex: /segunda(-feira)?/i, dow: 1 },
  { regex: /ter[çc]a(-feira)?/i, dow: 2 },
  { regex: /quarta(-feira)?/i, dow: 3 },
  { regex: /quinta(-feira)?/i, dow: 4 },
  { regex: /sexta(-feira)?/i, dow: 5 },
  { regex: /s[áa]bado/i, dow: 6 },
];

function parseBrazilianDate(value: string): Date | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrazilianDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

const WEEKDAY_LABELS_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const EXPLICIT_DATE_RE = /\bdia\s+(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?)?\b|\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i;

export type DateReference =
  | { kind: "weekday"; date: Date; formatted: string; weekday: string }
  | { kind: "explicit"; date: Date; formatted: string; weekday: string; alreadyPassed: boolean };

/**
 * Analisa o texto do cliente em busca de uma referência de dia (explícita,
 * tipo "dia 25", "25/08"/"25/08/2026" — ou por nome de dia da semana, tipo
 * "Terça") e resolve por CÓDIGO, sem depender da IA "calcular" nada:
 *
 * - Data explícita: calcula se já passou ou não comparando com
 *   `dataAtualDDMMYYYY` (nunca deixe a IA comparar dia-a-dia sozinha — é
 *   aritmética de calendário, o mesmo tipo de erro de "contagem" já visto em
 *   listas numeradas, ver `resolveNumberedListChoice`).
 * - Dia da semana citado sem data explícita: calcula a data exata da PRÓXIMA
 *   ocorrência daquele dia (a partir de amanhã — nunca hoje, mesmo que hoje
 *   já seja esse dia da semana, é ambíguo demais assumir "hoje").
 *
 * Em ambos os casos devolve também o nome do dia da semana (para a resposta
 * poder confirmar de volta pra cliente, ex: "Terça-feira, dia 25/08") — ver
 * uso em `flow-engine.ts` (`executeAiResponseNode`), que injeta o resultado
 * como uma dica pronta no prompt, a mesma técnica já usada pra listas
 * numeradas.
 *
 * Devolve null se não houver nenhuma referência de dia reconhecível no texto
 * (ex: só um horário solto, ou um termo relativo como "amanhã"/"sábado que
 * vem" — esses continuam por conta da IA, são sempre futuros por definição)
 * ou se `dataAtualDDMMYYYY` não estiver num formato reconhecível.
 */
export function analyzeDateReference(text: string, dataAtualDDMMYYYY: string): DateReference | null {
  const today = parseBrazilianDate(dataAtualDDMMYYYY);
  if (!today) return null;

  const explicitMatch = text.match(EXPLICIT_DATE_RE);
  if (explicitMatch) {
    const day = Number(explicitMatch[1] ?? explicitMatch[4]);
    const monthRaw = explicitMatch[2] ?? explicitMatch[5];
    const yearRaw = explicitMatch[3] ?? explicitMatch[6];
    const month = monthRaw ? Number(monthRaw) : today.getMonth() + 1;
    const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : today.getFullYear();

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return {
          kind: "explicit",
          date,
          formatted: formatBrazilianDate(date),
          weekday: WEEKDAY_LABELS_PT[date.getDay()],
          alreadyPassed: date.getTime() < todayMidnight.getTime(),
        };
      }
    }
  }

  for (const { regex, dow } of WEEKDAY_PATTERNS) {
    if (!regex.test(text)) continue;
    let diff = (dow - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);
    return { kind: "weekday", date, formatted: formatBrazilianDate(date), weekday: WEEKDAY_LABELS_PT[dow] };
  }

  return null;
}

const BIRTHDAY_LINE_RE = /^\d{1,2}\s*(\/|de)\s*[\p{L}\d]+(\s*(\/|de)\s*\d{2,4})?$/iu;

/**
 * Se o texto for EXATAMENTE duas linhas — uma parecendo um nome (sem
 * dígitos) e outra parecendo uma data curta de aniversário (ex: "10/02" ou
 * "10 de fevereiro", sem exigir o ano) — resolve por código qual linha é
 * qual e devolve os dois já separados.
 *
 * Existe porque, em teste ao vivo, o node dedicado de nome+aniversário
 * (`bs-ai-nome-aniversario`) errou essa extração na maioria das tentativas
 * assim que o prompt passou a incluir OUTRAS variáveis já confirmadas
 * (`servico_categoria`/`servico_subtipo`) no bloco "DADOS JÁ CONFIRMADOS" —
 * a presença de dados irrelevantes pro que está sendo pedido parece
 * "distrair" o modelo o suficiente pra ele hesitar e pedir confirmação em
 * vez de extrair direto, mesmo com os dois valores corretos já visíveis na
 * própria mensagem da cliente. Resolver esse formato específico (o mais
 * comum, cliente manda as duas linhas juntas) por código e entregar pronto
 * pro prompt elimina essa fonte de hesitação — mesmo princípio já usado pra
 * listas numeradas e datas.
 *
 * Devolve null se o texto não tiver exatamente esse formato de duas linhas
 * claramente distintas (nesse caso a IA continua responsável por
 * interpretar normalmente — ex: as duas informações vindo em mensagens
 * separadas, ou um formato mais livre).
 */
export function resolveNomeAniversarioPair(text: string): { nome: string; aniversario: string } | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length !== 2) return null;

  const [first, second] = lines;
  const firstIsBirthday = BIRTHDAY_LINE_RE.test(first);
  const secondIsBirthday = BIRTHDAY_LINE_RE.test(second);

  if (firstIsBirthday && !secondIsBirthday && !/\d/.test(second)) {
    return { nome: second, aniversario: first };
  }
  if (secondIsBirthday && !firstIsBirthday && !/\d/.test(first)) {
    return { nome: first, aniversario: second };
  }
  return null;
}

const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "Confraternização Universal" },
  { month: 4, day: 21, name: "Tiradentes" },
  { month: 5, day: 1, name: "Dia do Trabalho" },
  { month: 9, day: 7, name: "Independência do Brasil" },
  { month: 10, day: 12, name: "Nossa Senhora Aparecida" },
  { month: 11, day: 2, name: "Finados" },
  { month: 11, day: 15, name: "Proclamação da República" },
  { month: 11, day: 20, name: "Consciência Negra" },
  { month: 12, day: 25, name: "Natal" },
];

/** Domingo de Páscoa daquele ano (algoritmo de Gauss/Computus, calendário gregoriano) — usado só pra derivar os feriados móveis abaixo. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameCalendarDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Nome do feriado nacional que cai numa data, ou null se não for feriado.
 * Cobre os fixos (mesma data todo ano) e os móveis calculados a partir da
 * Páscoa daquele ano (Carnaval, Sexta-feira Santa, Corpus Christi) — nunca
 * precisa de atualização manual ano a ano.
 */
export function holidayName(date: Date): string | null {
  for (const holiday of FIXED_HOLIDAYS) {
    if (date.getMonth() + 1 === holiday.month && date.getDate() === holiday.day) return holiday.name;
  }
  const easter = easterSunday(date.getFullYear());
  const movable: { offsetDays: number; name: string }[] = [
    { offsetDays: -47, name: "Carnaval" },
    { offsetDays: -2, name: "Sexta-feira Santa" },
    { offsetDays: 60, name: "Corpus Christi" },
  ];
  for (const holiday of movable) {
    if (isSameCalendarDate(date, addDays(easter, holiday.offsetDays))) return holiday.name;
  }
  return null;
}

const TIME_RE = /\b(?:às|as)\s*(\d{1,2})(?::(\d{2}))?\s*h?(?:oras|rs)?\b|\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*h(?:oras|rs)?\b/i;

/** Extrai um horário (ex: "às 8", "20h", "9:30", "8 hrs") do texto — devolve null se nenhum padrão reconhecível de horário aparecer. */
export function extractTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(TIME_RE);
  if (!match) return null;
  const hour = Number(match[1] ?? match[3] ?? match[5]);
  const minute = Number(match[2] ?? match[4] ?? 0);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  if (Number.isNaN(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export type ScheduleCheckResult =
  | { valid: true }
  | { valid: false; reason: "date_passed"; formatted: string; weekday: string }
  | { valid: false; reason: "closed_weekday"; formatted: string; weekday: string }
  | { valid: false; reason: "holiday"; formatted: string; weekday: string; holiday: string }
  | { valid: false; reason: "outside_hours"; hour: number; minute: number };

/**
 * Validação completa de um pedido de agendamento (dia + horário), por
 * código — nunca deixe a IA julgar sozinha se uma data/horário é válido:
 * já vimos ela errar tanto aritmética de calendário simples (ex: achar que
 * uma data futura "já passou") quanto, de forma mais grave, RE-validar e
 * rejeitar por conta própria um valor que já tinha sido aceito e
 * confirmado num passo anterior do fluxo — mesmo com instrução explícita
 * pra só copiar dados já confirmados sem recalcular.
 *
 * Verifica, nesta ordem: (1) se a data já passou, (2) se o dia da semana
 * está fora do funcionamento, (3) se a data é feriado, (4) se o horário
 * mencionado está fora do expediente. Devolve o PRIMEIRO problema
 * encontrado, ou `{valid: true}` se não achou nenhum. Devolve `null` se o
 * texto não tiver nenhuma referência de dia OU horário reconhecível (nesse
 * caso não há nada pra validar ainda — ex: cliente só disse "amanhã de
 * manhã", sem dia da semana nem horário explícitos).
 */
export function checkScheduleRequest(
  text: string,
  dataAtualDDMMYYYY: string,
  hours: { openDays: number[]; openHour: number; closeHour: number }
): ScheduleCheckResult | null {
  const dateRef = analyzeDateReference(text, dataAtualDDMMYYYY);

  if (dateRef) {
    if (dateRef.kind === "explicit" && dateRef.alreadyPassed) {
      return { valid: false, reason: "date_passed", formatted: dateRef.formatted, weekday: dateRef.weekday };
    }
    if (!hours.openDays.includes(dateRef.date.getDay())) {
      return { valid: false, reason: "closed_weekday", formatted: dateRef.formatted, weekday: dateRef.weekday };
    }
    const holiday = holidayName(dateRef.date);
    if (holiday) {
      return { valid: false, reason: "holiday", formatted: dateRef.formatted, weekday: dateRef.weekday, holiday };
    }
  }

  const time = extractTime(text);
  if (time && (time.hour < hours.openHour || time.hour > hours.closeHour || (time.hour === hours.closeHour && time.minute > 0))) {
    return { valid: false, reason: "outside_hours", hour: time.hour, minute: time.minute };
  }

  if (dateRef || time) return { valid: true };
  return null;
}
