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
