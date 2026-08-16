import type { Node } from "@xyflow/react";

export type TriggerData = {
  label: string;
  triggerType: "FIRST_MESSAGE" | "KEYWORD";
  keyword?: string;
};

export type AiResponseData = {
  label: string;
  useGlobalPrompt: boolean;
  customPrompt?: string;
};

export type StaticMessageData = {
  label: string;
  message: string;
  buttons: string[];
};

export type ConditionData = {
  label: string;
  variable: string;
  operator: "CONTAINS" | "EQUALS" | "STARTS_WITH";
  value: string;
};

export type AlertNotificationData = {
  label: string;
  /** Número de WhatsApp do destinatário (ex: recepcionista), com DDI/DDD */
  recipientPhone: string;
  /** Mensagem de alerta — aceita variáveis capturadas no fluxo, ex: {{nome}}, {{data}}, {{servico}} */
  message: string;
};

export type TriggerNode = Node<TriggerData, "trigger">;
export type AiResponseNode = Node<AiResponseData, "aiResponse">;
export type StaticMessageNode = Node<StaticMessageData, "staticMessage">;
export type ConditionNode = Node<ConditionData, "condition">;
export type AlertNotificationNode = Node<AlertNotificationData, "alertNotification">;

export type FlowNode =
  | TriggerNode
  | AiResponseNode
  | StaticMessageNode
  | ConditionNode
  | AlertNotificationNode;

/** Extrai os nomes de variáveis {{assim}} usados em um texto (sem duplicatas). */
export function extractVariableNames(text: string): string[] {
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
  const names = matches.map((m) => m.replace(/[{}]/g, "").trim());
  return Array.from(new Set(names));
}
