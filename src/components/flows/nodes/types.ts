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
  /**
   * Se a resposta do contato CONTIVER uma dessas palavras-chave (comparação
   * sem diferenciar maiúsculas/minúsculas) enquanto o fluxo estiver pausado
   * neste bloco aguardando resposta, o motor entrega o controle direto para
   * `exitTargetNodeId` SEM chamar a IA. Útil para ações que precisam de
   * formatação 100% consistente (ex: "Menu" reapresentando a lista de
   * categorias) — um bloco de Mensagem Estática sempre formata igual; a IA,
   * por ser probabilística, às vezes ignora instruções de formatação do
   * prompt mesmo quando pedidas explicitamente.
   */
  exitKeywords?: string[];
  /** Node para onde o fluxo vai quando uma das `exitKeywords` é detectada (ver acima). */
  exitTargetNodeId?: string;
};

/** Tipo de mensagem interativa: botões simples (até 3) ou lista (até 10 itens). */
export type StaticMessageInteractiveType = "buttons" | "list";

export type StaticMessageListItem = {
  /** Identificador curto do item (ex: "cabelo") — usado para reconhecer a escolha do contato. */
  id: string;
  /** Título do item, exibido na lista (ex: "Cabelo"). */
  title: string;
  /** Descrição opcional, exibida abaixo do título na lista (ex: "Mechas, Corte, Progressiva..."). */
  description?: string;
};

export type StaticMessageData = {
  label: string;
  message: string;
  /** "buttons" (padrão, retrocompatível) ou "list" (mensagem de lista do WhatsApp). */
  interactiveType?: StaticMessageInteractiveType;
  /** Usado quando interactiveType === "buttons" (até 3 opções). */
  buttons: string[];
  /** Usado quando interactiveType === "list": título do botão que abre a lista (ex: "Ver Opções de Serviços"). */
  listButtonText?: string;
  /** Usado quando interactiveType === "list": itens da lista (até 10). */
  listItems?: StaticMessageListItem[];
  /**
   * Quando true, mesmo uma mensagem em TEXTO PURO (sem botões/lista) pausa o
   * fluxo e espera a próxima resposta do contato, em vez de seguir
   * automaticamente para o próximo node. Útil quando mensagens interativas
   * (botões/lista) não são confiáveis — a Evolution API/Baileys tem bugs
   * conhecidos de renderização e até de entrega de mensagens de botão (ficam
   * presas em "SERVER_ACK" e nunca chegam ao destinatário) — permitindo
   * simular um "menu" perguntado por texto simples (ex: "responda com 1, 2
   * ou 3") sem depender desses recursos frágeis.
   */
  waitForReply?: boolean;
  /**
   * Quando true, ao enviar esta mensagem o motor também desliga a IA para
   * esta conversa (`Chat.aiEnabled = false`) — usado para o bloco de
   * "encaminhar para atendimento humano": a partir daí novas mensagens do
   * contato só ficam registradas na Central de Atendimento, sem resposta
   * automática, até um operador reativar manualmente pelo toggle.
   */
  disablesAiForChat?: boolean;
  /**
   * Quando definido, ao alcançar este node o motor também grava estas
   * variáveis com valores FIXOS (ex: `{ servico_categoria: "Cabelo" }`) —
   * útil para registrar deterministicamente informações que o fluxo já sabe
   * de antemão (por ter chegado até aqui via uma condição específica), sem
   * depender de um bloco de IA lembrar de "adivinhar" isso da conversa.
   */
  setVariables?: Record<string, string>;
  /**
   * Quando definido, ao alcançar este node o motor copia o valor atual de
   * `ultima_resposta` (a última resposta do contato, tipicamente o que
   * disparou a condição que trouxe o fluxo até aqui) para o nome de variável
   * indicado — ex: `"servico_subtipo"` registra automaticamente qual opção
   * exata o contato escolheu num ponto de desvio condicional.
   */
  captureLastReplyInto?: string;
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
