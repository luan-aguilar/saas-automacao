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
