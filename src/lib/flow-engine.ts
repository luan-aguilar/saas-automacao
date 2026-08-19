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
  // segue pela única aresta de saída do node; `sentText`, se houver, é registrado como mensagem OUTBOUND no histórico do Chat.
  // `externalId` (ID da mensagem devolvido pela Evolution API) é salvo junto, pra o webhook reconhecer
  // o eco dessa mesma mensagem (evento `fromMe`) e não duplicá-la no histórico — ver `resolveOutboundFromMeMessage`.
  | { ok: true; next: "continue"; sentText?: string; externalId?: string }
  | { ok: true; next: "wait"; sentText?: string; externalId?: string } // pausa aqui — espera a próxima mensagem do contato
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
 * (texto puro, botões ou lista). Mensagens interativas (botões/lista) sempre
 * pausam o fluxo; texto puro só pausa se `data.waitForReply` estiver
 * marcado. Em qualquer um desses casos de pausa, a resposta do contato é
 * capturada como `ultima_resposta` pelo orquestrador na próxima mensagem.
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
    return result.ok ? { ok: true, next: "wait", sentText: text } : { ok: false, error: result.error };
  }

  if (interactiveType === "buttons" && data.buttons && data.buttons.length > 0) {
    const result = await sendWhatsappButtons(context.userId, context.contactPhone, text, data.buttons);
    return result.ok ? { ok: true, next: "wait", sentText: text } : { ok: false, error: result.error };
  }

  // Sem botões/lista configurados — texto puro. Por padrão segue automaticamente
  // para o próximo node; se `waitForReply` estiver marcado, pausa aqui e espera
  // a próxima resposta do contato (útil como "menu por texto" quando mensagens
  // interativas não são confiáveis — ver comentário no tipo `StaticMessageData`).
  const result = await sendWhatsappMessage(context.userId, context.contactPhone, text);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, next: data.waitForReply ? "wait" : "continue", sentText: text, externalId: result.externalId };
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
{"reply": "mensagem a enviar ao cliente pelo WhatsApp", "done": false, "needsHuman": false, "variables": {"chave": "valor"}}

- "reply": a mensagem a enviar agora ao cliente — curta, natural, adequada para WhatsApp.
- "done": true SOMENTE quando você já coletou todas as informações necessárias e o cliente confirmou explicitamente os dados. Caso contrário, false.
- "needsHuman": true quando a cliente pedir ou perguntar algo que você não sabe/não deve responder sozinha (fora do que está parametrizado para você, um pedido incomum, ou você não conseguir entender o que ela quer mesmo depois de tentar esclarecer) — nesse caso o sistema encaminha automaticamente para um atendente humano logo em seguida, então "reply" pode ser só um reconhecimento breve. Caso contrário, false.
- "variables": todos os dados já coletados nesta conversa até agora (não apenas o que mudou agora), como texto simples.`;

type AiJsonResponse = { reply?: string; done?: boolean; needsHuman?: boolean; variables?: Record<string, string> };

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

  // `_ai_history` é mantido pelo ORQUESTRADOR (ver `processIncomingMessage`),
  // não aqui — ele registra toda mensagem trocada com o contato, inclusive
  // as enviadas por nodes estáticos (ex: catálogo de sub-serviços) antes de
  // chegar até a IA. Isso é essencial: sem isso, uma resposta curta como "7"
  // (o número de um item do catálogo mostrado por um node estático)
  // chegaria à IA sem contexto nenhum sobre a que catálogo ela se refere.
  const history = context.variables._ai_history?.trim() || `Cliente: ${context.incomingText ?? ""}`;
  const userContent = `Histórico da conversa até agora (linhas "Cliente:" são mensagens do contato, linhas "Assistente:" são mensagens já enviadas a ele — inclusive por blocos estáticos do fluxo, não só por você):\n${history}`;

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

  const reply = parsed.reply?.trim() || "Desculpe, não consegui processar sua mensagem. Pode repetir, por favor?";
  const sendResult = await sendWhatsappMessage(context.userId, context.contactPhone, reply);
  if (!sendResult.ok) return { ok: false, error: sendResult.error };

  // `needsHuman` funciona como um "done" antecipado: avança para o próximo
  // node (tipicamente o bloco de encaminhamento humano) mesmo sem a coleta
  // ter sido concluída normalmente — ver `AI_JSON_CONTRACT`.
  const finished = parsed.done === true || parsed.needsHuman === true;
  return { ok: true, next: finished ? "continue" : "wait", sentText: reply, externalId: sendResult.externalId };
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
 * Localiza (ou cria) a conversa do contato na Central de Atendimento e
 * registra a mensagem recebida no histórico — independente de a IA estar
 * ativa ou não, o operador precisa ver tudo que o contato escreveu.
 *
 * `defaultAiEnabledForNewChat` só é usado quando a conversa é criada agora
 * (contato nunca escreveu antes) — é aí que a chave geral de IA
 * (`Config.aiGloballyEnabled`) entra em ação: se estiver desligada, o
 * contato novo já nasce com a IA pausada por padrão. Uma conversa já
 * existente NUNCA tem seu `aiEnabled` mexido aqui — o que o operador
 * configurou manualmente para ela (via o toggle individual) é sempre
 * respeitado, mesmo que a chave geral seja ligada/desligada depois.
 */
async function logInboundMessageAndGetChat(
  userId: string,
  contactPhone: string,
  contactName: string | undefined,
  content: string,
  defaultAiEnabledForNewChat: boolean
) {
  const existing = await prisma.chat.findUnique({ where: { userId_contactPhone: { userId, contactPhone } } });

  const chat = existing
    ? await prisma.chat.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: content.slice(0, 120),
          unreadCount: { increment: 1 },
          ...(contactName && contactName !== existing.contactName ? { contactName } : {}),
        },
      })
    : await prisma.chat.create({
        data: {
          userId,
          contactPhone,
          contactName: contactName || contactPhone,
          lastMessagePreview: content.slice(0, 120),
          unreadCount: 1,
          aiEnabled: defaultAiEnabledForNewChat,
        },
      });

  await prisma.message.create({
    data: { chatId: chat.id, direction: "INBOUND", sender: "CONTACT", content },
  });

  return chat;
}

/**
 * Ponto de entrada do motor: recebe uma mensagem recebida de um contato,
 * localiza (ou cria) a `FlowSession` correspondente e anda pelo grafo do
 * `Flow` ativo a partir do node atual, executando cada node até pausar
 * (`WAITING_INPUT`) ou terminar o fluxo (`COMPLETED`).
 *
 * Antes de tudo — SEMPRE, independente de o tenant ter um fluxo ativo ou
 * não — registra a mensagem recebida na Central de Atendimento
 * (`Chat`/`Message`), para ela nunca deixar de aparecer em `/chat`. Só depois
 * disso passa por dois portões:
 *   1. `flow: null` — tenant sem fluxo ativo configurado.
 *   2. `Chat.aiEnabled` — controla a automação desta conversa específica.
 *      `Config.aiGloballyEnabled` (a "chave geral") não é um bloqueio
 *      universal por cima disso — ela só define o VALOR PADRÃO de
 *      `aiEnabled` quando uma conversa nova é criada (contato que nunca
 *      escreveu antes). Ou seja: desligar a chave geral faz contatos novos
 *      nascerem com a IA pausada, mas conversas que o operador já ativou
 *      manualmente continuam respondendo normalmente — é assim que dá pra
 *      manter a IA ligada só para uma conversa específica mesmo com a chave
 *      geral desligada.
 * Em qualquer um desses casos a mensagem já está salva no histórico, só a
 * automação é que não roda.
 */
export async function processIncomingMessage(params: {
  userId: string;
  flow: { id: string; nodes: unknown; edges: unknown } | null;
  contactPhone: string;
  contactName?: string;
  messageText: string;
}): Promise<void> {
  const { userId, flow, contactPhone, contactName, messageText } = params;

  const effectiveText = messageText || "[mensagem sem texto reconhecível]";

  const config = await prisma.config.findUnique({ where: { userId }, select: { aiGloballyEnabled: true } });
  let chat = await logInboundMessageAndGetChat(
    userId,
    contactPhone,
    contactName,
    effectiveText,
    config?.aiGloballyEnabled !== false
  );

  // Cliente recorrente: se este contato já tinha concluído o funil antes
  // (coluna "Agendamento Concluído" no Kanban de /pipeline) e escreveu de
  // novo, isso é um NOVO ciclo de atendimento — precisa acontecer ANTES do
  // gate de `aiEnabled` logo abaixo, porque a IA sempre é desligada para
  // essa conversa no momento do handoff (ver `disablesAiForChat`) e, sem
  // reativar aqui, a mensagem seria descartada silenciosamente pelo gate e
  // a cliente nunca receberia resposta nenhuma. Move o card pra "Cliente
  // Recorrente" e reativa a IA (respeitando a chave geral: se o tenant
  // desligou o atendimento automático pra todo mundo, um recorrente não
  // furar essa regra).
  if (chat.pipelineStage === "AGENDAMENTO_CONCLUIDO") {
    chat = await prisma.chat.update({
      where: { id: chat.id },
      data: {
        pipelineStage: "CLIENTE_RECORRENTE",
        ...(config?.aiGloballyEnabled !== false ? { aiEnabled: true } : {}),
      },
    });
  }

  if (!flow) {
    console.log(
      "[flow-engine] Tenant sem fluxo ativo — mensagem registrada na Central de Atendimento, sem automação:",
      { userId, contactPhone }
    );
    return;
  }

  if (!chat.aiEnabled) {
    console.log(
      "[flow-engine] IA pausada para este contato (intervenção manual) — mensagem registrada, sem resposta automática:",
      { userId, contactPhone }
    );
    return;
  }

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

  // Variáveis "de sistema": preenchidas aqui a cada mensagem, nunca
  // dependendo da IA acertar o nome da chave ou "saber" a data de hoje —
  // usadas por blocos de notificação (ex: alerta de lead qualificado, que
  // referencia {{lead_phone}}/{{data_atual}}). `lead_nome` só recebe o nome
  // de perfil do WhatsApp como valor inicial (pode ser substituído depois
  // pelo nome real que a IA coletar da cliente, se for diferente).
  variables.lead_phone = contactPhone;
  variables.data_atual = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (!variables.lead_nome && contactName) {
    variables.lead_nome = contactName;
  }

  // `_ai_history` é a memória de curto prazo que o node de IA usa como
  // contexto — mantida aqui, no orquestrador, para registrar TODA mensagem
  // trocada com o contato nesta sessão, não só as que passaram pela IA.
  // Sem isso, um node estático (ex: catálogo de sub-serviços) que manda uma
  // lista e pausa esperando resposta faria a IA receber a próxima mensagem
  // do contato (ex: só "7") sem nenhuma pista de a que lista aquele número
  // se refere. Cada mensagem enviada por QUALQUER node (loop abaixo) também
  // é somada aqui como "Assistente: ...".
  variables._ai_history = `${variables._ai_history ?? ""}\nCliente: ${effectiveText}`.trim().slice(-4000);

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
      // captura a escolha do contato e avança direto para o node seguinte —
      // que pode ser o próprio node de IA (ex: catálogo de sub-serviços ->
      // agente de coleta). A checagem de `exitKeywords` para esse caso
      // acontece de forma genérica no início do loop principal abaixo, não
      // aqui, já que só quando sabemos que o próximo node É de fato uma IA é
      // que faz sentido aplicá-la.
      variables.ultima_resposta = effectiveText;
      currentId = edges.find((e) => e.source === waitingNode.id)?.target ?? null;
    }
    // Se o node de espera já for do tipo aiResponse, `currentId` permanece o
    // mesmo — a IA decide se avança (via `done`) ou continua esperando.
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

    // Checagem GENÉRICA de `exitKeywords`: roda toda vez que o próximo node a
    // executar é uma IA, não importa se a sessão já estava pausada nela
    // (retomada) ou se acabou de chegar através de outro node (ex: acabou de
    // capturar a resposta de um catálogo estático de sub-serviços e o
    // próximo node na aresta já é a IA, no mesmo turno). Sem essa checagem
    // aqui, uma mensagem como "Menu" digitada logo após um catálogo de
    // sub-serviços seria repassada pra IA como se fosse a escolha do
    // serviço, e ela tentaria (sem sucesso garantido) reformatar o menu
    // sozinha — foi exatamente o bug relatado, mesmo já existindo a
    // checagem no ponto de retomada.
    if (node.type === "aiResponse" && node.data.exitKeywords?.length) {
      const normalizedText = effectiveText.toLowerCase().trim();
      const matchedKeyword = node.data.exitKeywords.find((keyword) =>
        normalizedText.includes(keyword.toLowerCase().trim())
      );
      if (matchedKeyword && node.data.exitTargetNodeId) {
        console.log(
          `[flow-engine] Palavra-chave de saída '${matchedKeyword}' detectada no node '${node.id}' — devolvendo controle para '${node.data.exitTargetNodeId}' sem chamar a IA.`
        );
        currentId = node.data.exitTargetNodeId;
        finalNodeId = currentId;
        continue;
      }
    }

    // Captura determinística de variáveis (ver `StaticMessageData.setVariables`
    // / `captureLastReplyInto`) — roda ANTES do envio, então acontece mesmo
    // que o envio da mensagem falhe: são valores que o fluxo já sabe de
    // antemão por ter chegado até aqui (ex: qual sub-serviço disparou um
    // desvio condicional), não dependem de uma IA "lembrar" de registrar
    // isso depois de várias mensagens de distância.
    if (node.type === "staticMessage") {
      if (node.data.setVariables) {
        Object.assign(variables, node.data.setVariables);
      }
      if (node.data.captureLastReplyInto && variables.ultima_resposta) {
        variables[node.data.captureLastReplyInto] = variables.ultima_resposta;
      }
    }

    const context: FlowContext = { userId, contactPhone, variables, incomingText: effectiveText };
    const result = await executeFlowNode(node, context);

    if (!result.ok) {
      console.error(`[flow-engine] Falha ao executar o node '${node.id}' (${node.type}):`, result.error);
      status = "WAITING_INPUT";
      finalNodeId = node.id;
      break;
    }

    if (result.next !== "branch" && result.sentText) {
      await prisma.message.create({
        data: {
          chatId: chat.id,
          direction: "OUTBOUND",
          sender: "AI",
          content: result.sentText,
          externalId: result.externalId,
        },
      });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { lastMessageAt: new Date(), lastMessagePreview: result.sentText.slice(0, 120) },
      });
      // Ver comentário acima de `_ai_history`: toda mensagem enviada entra na
      // memória de curto prazo, não só as da IA — garante que quando a
      // próxima resposta do contato cair no node de IA, ela tenha o contexto
      // completo (inclusive do que um node estático acabou de mostrar).
      variables._ai_history = `${variables._ai_history}\nAssistente: ${result.sentText}`.trim().slice(-4000);
    }

    // Bloco de "encaminhar para atendimento humano" (ver `StaticMessageData.disablesAiForChat`):
    // desliga a IA para esta conversa assim que a mensagem de handoff é
    // enviada — a partir daqui, novas mensagens deste contato só ficam
    // registradas na Central de Atendimento, sem resposta automática, até um
    // operador reativar manualmente pelo toggle. Também move o card do
    // contato para a coluna "Aguardando Humano" no Kanban de /pipeline —
    // ver `PipelineStage`.
    if (node.type === "staticMessage" && node.data.disablesAiForChat) {
      await prisma.chat.update({
        where: { id: chat.id },
        data: { aiEnabled: false, pipelineStage: "AGUARDANDO_HUMANO" },
      });
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
