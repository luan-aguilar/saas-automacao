/**
 * Motor de execução dos fluxos.
 *
 * Percorre os blocos desenhados no Construtor de Fluxos (`Flow.nodes` /
 * `Flow.edges`) a cada mensagem recebida de um contato no WhatsApp, mantendo
 * a posição de cada contato no grafo em `FlowSession` (node atual + variáveis
 * já coletadas).
 *
 * Fluxo real (ver `POST /api/webhooks/whatsapp`):
 *   1. A Evolution API recebe uma mensagem do contato e chama o webhook desta
 *      aplicação (evento `MESSAGES_UPSERT`).
 *   2. O webhook identifica o tenant dono da instância, carrega o `Flow`
 *      ativo dele e chama `processIncomingMessage(...)` abaixo.
 *   3. `processIncomingMessage` localiza (ou cria) a `FlowSession` do
 *      contato e anda pelo grafo a partir do node atual, executando cada
 *      node via `executeFlowNode` até encontrar um ponto que precisa esperar
 *      a próxima resposta do contato (`WAITING_INPUT`) ou o fim do fluxo
 *      (`COMPLETED`).
 */

import OpenAI from "openai";
import type { FlowSessionStatus } from "@prisma/client";
import type {
  FlowNode,
  AlertNotificationData,
  AiResponseData,
  StaticMessageData,
  ConditionData,
} from "@/components/flows/nodes/types";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { sendWhatsappMessage, sendWhatsappButtons, sendWhatsappList } from "@/lib/whatsapp-service";

export type FlowContext = {
  /** ID do usuário (tenant) dono do fluxo — usado para saber qual sessão do WhatsApp usar */
  userId: string;
  /** Número do contato com quem a conversa está acontecendo (com DDI) */
  contactPhone: string;
  /** Variáveis capturadas até este ponto da conversa (ex: { nome: "Maria", data: "20/08" }) — mutado in-place pelos executores */
  variables: Record<string, string>;
  /** Texto da mensagem que o contato acabou de enviar (turno atual) */
  incomingText?: string;
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

/** Resultado da execução de um node: diz ao orquestrador como continuar o passeio pelo grafo. */
export type StepResult =
  | { ok: true; next: "continue" } // segue pela única aresta de saída do node
  | { ok: true; next: "wait" } // pausa aqui — espera a próxima mensagem do contato
  | { ok: true; next: "branch"; handle: "yes" | "no" } // node de condição — escolhe a aresta correspondente
  | { ok: false; error: string };

/**
 * Executa o bloco "Notificação / Alerta": interpola as variáveis da conversa
 * na mensagem configurada e dispara via API do WhatsApp para o número do
 * destinatário (ex: recepcionista/dono do salão) configurado no bloco.
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
 * Envia a mensagem do bloco "Mensagem Estática" no formato configurado
 * (texto puro, botões ou lista). Mensagens interativas (botões/lista) pausam
 * o fluxo — a resposta do contato é capturada como `ultima_resposta` pelo
 * orquestrador na próxima mensagem recebida.
 */
async function executeStaticMessageNode(data: StaticMessageData, context: FlowContext): Promise<StepResult> {
  const text = interpolateVariables(data.message, context.variables);
  const interactiveType = data.interactiveType ?? "buttons";

  if (interactiveType === "list" && data.listItems && data.listItems.length > 0) {
    const result = await sendWhatsappList(
      context.userId,
      context.contactPhone,
      text,
      data.listButtonText || "Ver opções",
      data.listItems
    );
    return result.ok ? { ok: true, next: "wait" } : { ok: false, error: result.error };
  }

  if (interactiveType === "buttons" && data.buttons && data.buttons.length > 0) {
    const result = await sendWhatsappButtons(context.userId, context.contactPhone, text, data.buttons);
    return result.ok ? { ok: true, next: "wait" } : { ok: false, error: result.error };
  }

  // Sem botões/lista configurados — texto puro, segue automaticamente para o próximo node.
  const result = await sendWhatsappMessage(context.userId, context.contactPhone, text);
  return result.ok ? { ok: true, next: "continue" } : { ok: false, error: result.error };
}

/**
 * Avalia a condição do bloco (`operator`/`value`) contra a variável indicada
 * e escolhe a aresta "yes"/"no" a seguir. Comparação sem diferenciar
 * maiúsculas/minúsculas nem espaços nas pontas.
 */
async function executeConditionNode(data: ConditionData, context: FlowContext): Promise<StepResult> {
  const rawValue = context.variables[data.variable] ?? "";
  const actual = rawValue.toLowerCase().trim();
  const expected = (data.value ?? "").toLowerCase().trim();

  let matches: boolean;
  switch (data.operator) {
    case "EQUALS":
      matches = actual === expected;
      break;
    case "STARTS_WITH":
      matches = actual.startsWith(expected);
      break;
    case "CONTAINS":
    default:
      matches = actual.includes(expected);
      break;
  }

  return { ok: true, next: "branch", handle: matches ? "yes" : "no" };
}

/**
 * Instrução de formato fixada ao final do prompt de sistema do bloco de IA —
 * força o modelo a responder em JSON para que o motor consiga separar o
 * texto a enviar ao contato, as variáveis extraídas e o sinal de que a
 * coleta terminou (`done`), sem precisar de function calling.
 */
const AI_JSON_CONTRACT = `Responda SEMPRE em um único objeto JSON válido, sem nenhum texto fora dele, no formato:
{"reply": "mensagem a enviar ao cliente pelo WhatsApp", "done": false, "variables": {"chave": "valor"}}

- "reply": a mensagem a enviar agora ao cliente — curta, natural, adequada para WhatsApp.
- "done": true SOMENTE quando você já coletou todas as informações necessárias e o cliente confirmou explicitamente os dados. Caso contrário, false.
- "variables": todos os dados já coletados nesta conversa até agora (não apenas o que mudou agora), como texto simples.`;

type AiJsonResponse = { reply?: string; done?: boolean; variables?: Record<string, string> };

/**
 * Executa o bloco "Resposta IA": chama a OpenAI com o prompt configurado
 * (global ou específico do bloco) + um pequeno histórico da conversa mantido
 * em `variables._ai_history`, envia a resposta ao contato e extrai variáveis
 * estruturadas para a `FlowSession`. Enquanto a IA não sinalizar `done`, o
 * fluxo permanece pausado neste node aguardando a próxima mensagem.
 */
async function executeAiResponseNode(data: AiResponseData, context: FlowContext): Promise<StepResult> {
  const config = await prisma.config.findUnique({ where: { userId: context.userId } });

  if (!config?.openaiApiKeyEncrypted) {
    console.warn("[flow-engine] Bloco 'Resposta IA' sem chave da OpenAI configurada para o tenant:", context.userId);
    return { ok: false, error: "Chave da OpenAI não configurada para este tenant." };
  }

  let apiKey: string;
  try {
    apiKey = decrypt(config.openaiApiKeyEncrypted);
  } catch (error) {
    console.error("[flow-engine] Falha ao descriptografar a chave da OpenAI:", error);
    return { ok: false, error: "Falha ao descriptografar a chave da OpenAI." };
  }

  const basePrompt = !data.useGlobalPrompt && data.customPrompt ? data.customPrompt : config.systemPrompt;
  const systemPrompt = `${basePrompt}\n\n${AI_JSON_CONTRACT}`;

  const priorHistory = context.variables._ai_history ?? "";
  const currentTurn = context.incomingText ?? "";
  const userContent = priorHistory
    ? `Histórico da conversa até agora:\n${priorHistory}\n\nNova mensagem do cliente: ${currentTurn}`
    : `Mensagem do cliente: ${currentTurn}`;

  const client = new OpenAI({ apiKey });

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch (error) {
    console.error("[flow-engine] Erro ao chamar a OpenAI:", error);
    return { ok: false, error: "Erro ao chamar a OpenAI." };
  }

  let parsed: AiJsonResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Modelo não respeitou o contrato JSON — envia o texto cru mesmo assim, sem marcar como concluído.
    parsed = { reply: raw, done: false, variables: {} };
  }

  if (parsed.variables) {
    for (const [key, value] of Object.entries(parsed.variables)) {
      if (typeof value === "string" && value.trim() !== "") {
        context.variables[key] = value;
      }
    }
  }

  // Histórico curto (só os últimos ~4000 caracteres) — memória de curto prazo para o próximo turno.
  const updatedHistory = `${priorHistory}\nCliente: ${currentTurn}\nAssistente: ${parsed.reply ?? ""}`.trim();
  context.variables._ai_history = updatedHistory.slice(-4000);

  const reply = parsed.reply?.trim() || "Desculpe, não consegui processar sua mensagem. Pode repetir, por favor?";
  const sendResult = await sendWhatsappMessage(context.userId, context.contactPhone, reply);
  if (!sendResult.ok) return { ok: false, error: sendResult.error };

  return { ok: true, next: parsed.done ? "continue" : "wait" };
}

/**
 * Dispatcher central do motor de fluxo. Recebe um node (já no formato salvo
 * em `Flow.nodes`) e o contexto atual da conversa, executa a ação
 * correspondente ao tipo do bloco e devolve como o orquestrador deve
 * continuar o passeio pelo grafo.
 */
export async function executeFlowNode(node: FlowNode, context: FlowContext): Promise<StepResult> {
  switch (node.type) {
    case "trigger":
      // Apenas marca o ponto de entrada do fluxo — não dispara ação própria.
      return { ok: true, next: "continue" };

    case "staticMessage":
      return executeStaticMessageNode(node.data, context);

    case "condition":
      return executeConditionNode(node.data, context);

    case "aiResponse":
      return executeAiResponseNode(node.data, context);

    case "alertNotification": {
      const result = await executeAlertNotificationNode(node.data, context);
      return result.ok ? { ok: true, next: "continue" } : { ok: false, error: result.error };
    }

    default:
      return { ok: true, next: "continue" };
  }
}

type FlowGraphEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

/** Limite de passos automáticos por mensagem recebida — protege contra loops em fluxos malformados. */
const MAX_STEPS = 25;

/**
 * Ponto de entrada do motor: recebe uma mensagem recebida de um contato,
 * localiza (ou cria) a `FlowSession` correspondente e anda pelo grafo do
 * `Flow` ativo a partir do node atual, executando cada node até pausar
 * (`WAITING_INPUT`) ou terminar o fluxo (`COMPLETED`).
 */
export async function processIncomingMessage(params: {
  userId: string;
  flow: { id: string; nodes: unknown; edges: unknown };
  contactPhone: string;
  messageText: string;
}): Promise<void> {
  const { userId, flow, contactPhone, messageText } = params;
  const nodes = (flow.nodes as FlowNode[]) ?? [];
  const edges = (flow.edges as FlowGraphEdge[]) ?? [];

  let session = await prisma.flowSession.findUnique({
    where: { userId_contactPhone: { userId, contactPhone } },
  });

  // Sessão inexistente, apontando para um fluxo que não é mais o ativo, ou já concluída: recomeça do zero.
  if (!session || session.flowId !== flow.id || session.status === "COMPLETED") {
    session = await prisma.flowSession.upsert({
      where: { userId_contactPhone: { userId, contactPhone } },
      create: { userId, contactPhone, flowId: flow.id, currentNodeId: null, variables: {}, status: "ACTIVE" },
      update: { flowId: flow.id, currentNodeId: null, variables: {}, status: "ACTIVE" },
    });
  }

  const variables: Record<string, string> = { ...((session.variables as Record<string, string>) ?? {}) };
  const effectiveText = messageText || "[mensagem sem texto reconhecível]";

  let currentId: string | null = session.currentNodeId;

  if (!currentId) {
    const trigger = nodes.find((n) => n.type === "trigger");
    if (!trigger) {
      console.warn("[flow-engine] Fluxo ativo sem node 'trigger' — nada a fazer:", flow.id);
      return;
    }
    currentId = trigger.id;
  } else {
    const waitingNode = nodes.find((n) => n.id === currentId);
    if (waitingNode && waitingNode.type !== "aiResponse") {
      // Estava esperando resposta a uma mensagem estática interativa (botões/lista):
      // captura a escolha do contato e avança direto para o node seguinte.
      variables.ultima_resposta = effectiveText;
      currentId = edges.find((e) => e.source === waitingNode.id)?.target ?? null;
    }
    // Se for 'aiResponse', continua no mesmo node — o executor decide se avança.
  }

  let status: FlowSessionStatus = "COMPLETED";
  let finalNodeId: string | null = currentId;
  let steps = 0;

  while (currentId && steps++ < MAX_STEPS) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) {
      console.warn("[flow-engine] Node não encontrado no fluxo (removido do Construtor?):", currentId);
      status = "COMPLETED";
      finalNodeId = null;
      break;
    }

    const context: FlowContext = { userId, contactPhone, variables, incomingText: effectiveText };
    const result = await executeFlowNode(node, context);

    if (!result.ok) {
      console.error(`[flow-engine] Falha ao executar o node '${node.id}' (${node.type}):`, result.error);
      status = "WAITING_INPUT";
      finalNodeId = node.id;
      break;
    }

    if (result.next === "wait") {
      status = "WAITING_INPUT";
      finalNodeId = node.id;
      break;
    }

    const targetId =
      result.next === "branch"
        ? edges.find((e) => e.source === node.id && e.sourceHandle === result.handle)?.target ?? null
        : edges.find((e) => e.source === node.id)?.target ?? null;

    if (!targetId) {
      status = "COMPLETED";
      finalNodeId = node.id;
      break;
    }

    currentId = targetId;
    finalNodeId = targetId;
    status = "ACTIVE";
  }

  if (steps >= MAX_STEPS) {
    console.warn("[flow-engine] Limite de passos automáticos atingido — possível loop no fluxo:", flow.id);
    status = "WAITING_INPUT";
  }

  await prisma.flowSession.update({
    where: { id: session.id },
    data: { currentNodeId: finalNodeId, variables, status },
  });
}
