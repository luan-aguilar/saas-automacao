/**
 * Motor de execução dos fluxos (boilerplate).
 *
 * Este arquivo é o ponto de partida do "motor" que interpreta os blocos
 * desenhados no Construtor de Fluxos (`Flow.nodes` / `Flow.edges`) a cada
 * mensagem recebida de um contato no WhatsApp. Hoje ele implementa por
 * completo apenas o bloco de "Notificação / Alerta" (o mais simples e
 * autocontido); os demais blocos (Trigger, Resposta IA, Mensagem Estática,
 * Condição) têm assinatura pronta mas ainda precisam ser conectados ao fluxo
 * de mensagens recebidas do WhatsApp — veja os TODOs abaixo.
 *
 * Fluxo esperado quando o webhook de mensagens recebidas existir:
 *   1. Serviço externo do WhatsApp recebe uma mensagem do contato e chama um
 *      webhook desta aplicação (ex: POST /api/whatsapp/webhook — a criar).
 *   2. Esse webhook carrega o `Flow` ativo do usuário e localiza o node atual
 *      da conversa (persistido, por exemplo, em `Chat` ou em uma tabela de
 *      "sessão de fluxo" dedicada).
 *   3. Para cada node percorrido, chama `executeFlowNode(node, context)`.
 *   4. O `context.variables` acumula os dados capturados durante a conversa
 *      (ex: nome, data, serviço) para alimentar variáveis {{assim}}.
 */

import type { FlowNode, AlertNotificationData } from "@/components/flows/nodes/types";
import { sendWhatsappMessage } from "@/lib/whatsapp-service";

export type FlowContext = {
  /** ID do usuário (tenant) dono do fluxo — usado para saber qual sessão do WhatsApp usar */
  userId: string;
  /** Variáveis capturadas até este ponto da conversa (ex: { nome: "Maria", data: "20/08" }) */
  variables: Record<string, string>;
};

/**
 * Substitui variáveis no formato {{nome}} pelo valor correspondente em
 * `variables`. Variáveis sem valor definido são mantidas como "—" para não
 * quebrar a mensagem enviada ao destinatário.
 */
export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value !== undefined && value !== "" ? value : "—";
  });
}

/**
 * Executa o bloco "Notificação / Alerta": interpola as variáveis da conversa
 * na mensagem configurada e dispara via API do WhatsApp para o número do
 * destinatário (ex: recepcionista) configurado no bloco.
 */
export async function executeAlertNotificationNode(
  data: AlertNotificationData,
  context: FlowContext
) {
  if (!data.recipientPhone) {
    console.warn("[flow-engine] Bloco de notificação sem número de destinatário configurado — ignorado.");
    return { ok: false as const, error: "Número do destinatário não configurado." };
  }

  const formattedMessage = interpolateVariables(data.message, context.variables);

  const result = await sendWhatsappMessage(context.userId, data.recipientPhone, formattedMessage);

  if (!result.ok) {
    console.error("[flow-engine] Falha ao enviar notificação de alerta:", result.error);
  }

  return result;
}

/**
 * Dispatcher central do motor de fluxo. Recebe um node (já no formato salvo
 * em `Flow.nodes`) e o contexto atual da conversa, e executa a ação
 * correspondente ao tipo do bloco.
 *
 * Apenas o bloco `alertNotification` está implementado de ponta a ponta neste
 * boilerplate. Os demais têm um `TODO` indicando onde plugar a lógica real.
 */
export async function executeFlowNode(node: FlowNode, context: FlowContext) {
  switch (node.type) {
    case "alertNotification":
      return executeAlertNotificationNode(node.data, context);

    case "trigger":
      // TODO: usado apenas para decidir o ponto de entrada do fluxo
      // (primeira mensagem ou palavra-chave) — não dispara ação própria.
      return { ok: true as const };

    case "aiResponse":
      // TODO: chamar a OpenAI usando `Config.systemPrompt` (ou o prompt
      // específico do bloco) + histórico da conversa, e enviar a resposta
      // via `sendWhatsappMessage`.
      console.warn("[flow-engine] Execução do bloco 'Resposta IA' ainda não implementada.");
      return { ok: true as const };

    case "staticMessage":
      // TODO: enviar `data.message` (com botões, se houver) via
      // `sendWhatsappMessage` / API de mensagens interativas do WhatsApp.
      console.warn("[flow-engine] Execução do bloco 'Mensagem Estática' ainda não implementada.");
      return { ok: true as const };

    case "condition":
      // TODO: avaliar `data.operator`/`data.value` contra a última resposta
      // do contato (`context.variables[data.variable]`) e escolher a aresta
      // "yes"/"no" a seguir.
      console.warn("[flow-engine] Execução do bloco 'Condição' ainda não implementada.");
      return { ok: true as const };

    default:
      return { ok: true as const };
  }
}
