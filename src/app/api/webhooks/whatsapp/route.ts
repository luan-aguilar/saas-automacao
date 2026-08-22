import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/flow-engine";
import { syncConnectionState } from "@/lib/whatsapp-service";
import { getBase64FromMediaMessage, type EvolutionConnectionState } from "@/lib/evolution-api";

/**
 * POST /api/webhooks/whatsapp — recebido diretamente da Evolution API v2 a
 * cada evento configurado na instância (ver `setWebhook` em
 * `evolution-api.ts`, chamado por `POST /api/whatsapp/connect`).
 *
 * Só o evento de mensagem recebida (`messages.upsert`/`MESSAGES_UPSERT`,
 * dependendo da versão da Evolution API) importa aqui — os demais são
 * ignorados com 200 OK para a Evolution API não ficar reenviando.
 *
 * Autenticado por `WHATSAPP_SERVICE_TOKEN`, já que esta rota fica fora do
 * middleware de sessão (a Evolution API não tem cookie de login desta
 * aplicação). Aceita a credencial em qualquer um destes lugares — a
 * Evolution API v2 varia onde repassa a apikey global dependendo da versão
 * e de como o webhook foi cadastrado, então validamos todos:
 *   1. Query string (`?token=...`), como configurado em `setWebhook`.
 *   2. Header `apikey` (mesmo header usado nas chamadas de gerenciamento).
 *   3. Header `x-api-key`.
 *   4. Header `authorization` (com ou sem prefixo `Bearer `).
 */

type EvolutionMessageKey = { remoteJid?: string; fromMe?: boolean; id?: string };

type EvolutionMessageContent = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  buttonsResponseMessage?: { selectedDisplayText?: string };
  listResponseMessage?: { title?: string };
  imageMessage?: { caption?: string };
};

type EvolutionWebhookBody = {
  event?: string;
  instance?: string;
  data?: {
    key?: EvolutionMessageKey;
    message?: EvolutionMessageContent;
    pushName?: string;
    // Campos do evento CONNECTION_UPDATE — a Evolution API varia se manda o
    // estado direto em `data.state` ou aninhado em `data.instance.state`
    // dependendo da versão, então checamos os dois (ver `extractConnectionState`).
    state?: string;
    instance?: { state?: string };
  };
};

type EvolutionChatUpdate = { id?: string; remoteJid?: string; unreadCount?: number };

/**
 * Normaliza o payload de um evento CHATS_UPDATE numa lista de atualizações —
 * a Evolution API varia bastante aqui entre versões (às vezes um único
 * objeto, às vezes um array, às vezes aninhado em `data.chats`), então
 * cobrimos os formatos mais comuns em vez de travar numa forma só.
 */
function extractChatUpdates(data: unknown): EvolutionChatUpdate[] {
  if (Array.isArray(data)) return data as EvolutionChatUpdate[];
  if (data && typeof data === "object") {
    const obj = data as { chats?: unknown; chat?: unknown };
    if (Array.isArray(obj.chats)) return obj.chats as EvolutionChatUpdate[];
    if (obj.chat && typeof obj.chat === "object") return [obj.chat as EvolutionChatUpdate];
    return [data as EvolutionChatUpdate];
  }
  return [];
}

/** Normaliza o estado de conexão do payload de um evento CONNECTION_UPDATE. */
function extractConnectionState(data: EvolutionWebhookBody["data"]): EvolutionConnectionState {
  const raw = data?.state ?? data?.instance?.state;
  if (raw === "open" || raw === "connecting" || raw === "close") return raw;
  return "unknown";
}

/** Extrai o texto "efetivo" da mensagem, cobrindo texto puro e respostas a botões/lista (não cobre mídia — ver `resolveIncomingMessageText`). */
function extractMessageText(message: EvolutionMessageContent | undefined): string {
  if (!message) return "";
  const text =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    "";
  return text.trim();
}

/**
 * Resolve o texto "efetivo" de uma mensagem recebida — incluindo o caso de
 * foto: a URL crua que vem no payload (`imageMessage.url`) é criptografada
 * pelo protocolo do WhatsApp e não pode ser aberta diretamente, então
 * baixamos os bytes já decriptados via `getBase64FromMediaMessage`, guardamos
 * em `MediaAsset` e devolvemos um texto com a legenda (se houver) + a URL
 * pública da foto nesta aplicação. Isso é o que permite ao bloco de IA do
 * fluxo "ver" a foto na conversa e salvar essa URL nas variáveis
 * `foto_atual_url`/`foto_referencia_url` (regra "b" do prompt do template de
 * salão) — sem esse texto, a IA não tem absolutamente nenhuma pista de que
 * uma foto foi enviada.
 */
async function resolveIncomingMessageText(params: {
  message: EvolutionMessageContent | undefined;
  key: EvolutionMessageKey;
  instanceName: string;
  userId: string;
  requestOrigin: string;
}): Promise<string> {
  const { message, key, instanceName, userId, requestOrigin } = params;

  if (message?.imageMessage) {
    const caption = message.imageMessage.caption?.trim() ?? "";
    const media = await getBase64FromMediaMessage(instanceName, key);

    if (!media) {
      console.warn("[webhook/whatsapp] Falha ao baixar foto recebida — seguindo sem URL.");
      return caption || "[O cliente enviou uma foto, mas não foi possível processá-la — peça para reenviar.]";
    }

    const asset = await prisma.mediaAsset.create({
      data: { userId, mimetype: media.mimetype, data: Buffer.from(media.base64, "base64") },
    });
    const url = `${requestOrigin}/api/media/${asset.id}`;

    return caption ? `${caption}\n[Foto enviada pelo cliente: ${url}]` : `[Foto enviada pelo cliente: ${url}]`;
  }

  return extractMessageText(message);
}

/** Normaliza o nome do evento para SCREAMING_SNAKE_CASE, cobrindo tanto "messages.upsert" quanto "MESSAGES_UPSERT". */
function normalizeEventName(rawEvent: string | undefined): string {
  return (rawEvent ?? "").toUpperCase().replace(/[.\s]/g, "_");
}

/**
 * Trata um evento `fromMe: true` (mensagem enviada pelo próprio número
 * conectado) — duas origens possíveis, indistinguíveis pelo payload da
 * Evolution API:
 *   1. O PRÓPRIO robô enviou via `sendWhatsappMessage` — essa mensagem já foi
 *      registrada na hora do envio (com `Message.externalId` salvo). Este
 *      evento é só o "eco" da Evolution API confirmando o envio — precisa
 *      ser IGNORADO, senão duplica no histórico da Central de Atendimento.
 *   2. Alguém mandou manualmente pelo APARELHO (celular) ou WhatsApp Web —
 *      nunca passou pelo backend, então nunca foi registrada. Precisa ser
 *      salva agora, pela primeira vez, pra a Central de Atendimento refletir
 *      TUDO que realmente foi enviado ao contato, não só o que o robô mandou.
 *
 * Reconhece o caso 1 primeiro por `key.id` batendo com um `Message.externalId`
 * já salvo (o jeito preciso). Como fallback — caso a extração do ID falhe em
 * algum envio — também trata como eco qualquer mensagem OUTBOUND idêntica
 * enviada por nós nos últimos 15s, pra nunca duplicar mesmo se o ID faltar.
 */
async function resolveOutboundFromMeMessage(params: {
  userId: string;
  key: EvolutionMessageKey;
  message: EvolutionMessageContent | undefined;
  contactPhone: string;
  instanceName: string;
  requestOrigin: string;
}) {
  const { userId, key, message, contactPhone, instanceName, requestOrigin } = params;

  const chat = await prisma.chat.findUnique({ where: { userId_contactPhone: { userId, contactPhone } } });

  if (key.id) {
    const echoOfOwnSend = await prisma.message.findFirst({
      where: { externalId: key.id, chat: { userId, contactPhone } },
    });
    if (echoOfOwnSend) return;
  }

  const text = await resolveIncomingMessageText({ message, key, instanceName, userId, requestOrigin });
  if (!text) return;

  if (chat) {
    const recentDuplicate = await prisma.message.findFirst({
      where: {
        chatId: chat.id,
        direction: "OUTBOUND",
        content: text,
        createdAt: { gte: new Date(Date.now() - 15_000) },
      },
    });
    if (recentDuplicate) return;
  }

  const targetChat =
    chat ??
    (await prisma.chat.create({
      data: { userId, contactPhone, contactName: contactPhone, lastMessagePreview: text.slice(0, 120), aiEnabled: false },
    }));

  await prisma.message.create({
    data: { chatId: targetChat.id, direction: "OUTBOUND", sender: "HUMAN", content: text, externalId: key.id },
  });

  // Mensagem mandada manualmente pelo celular = intervenção humana — desliga
  // a IA pra essa conversa, mesmo princípio de quando o operador manda uma
  // mensagem manual pela própria Central de Atendimento (ver
  // `POST /api/chats/:id/messages`): evita a IA responder por cima de quem
  // já está atendendo pessoalmente.
  await prisma.chat.update({
    where: { id: targetChat.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 120), aiEnabled: false },
  });
}

export async function POST(request: NextRequest) {
  const queryToken = request.nextUrl.searchParams.get("token");
  const apikeyHeader = request.headers.get("apikey");
  const xApiKeyHeader = request.headers.get("x-api-key");
  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.replace(/^Bearer\s+/i, "").trim() || null;

  // Log incondicional — antes de qualquer validação — para conseguir auditar
  // no log da Vercel exatamente o que a Evolution API está enviando, mesmo
  // quando a requisição acaba sendo rejeitada logo abaixo.
  console.log("[WEBHOOK HEADERS/QUERY]", {
    url: request.url,
    queryToken,
    apikeyHeader,
    xApiKeyHeader,
    authorizationHeader,
  });

  const token = queryToken || apikeyHeader || xApiKeyHeader || bearerToken;
  const expectedToken = process.env.WHATSAPP_SERVICE_TOKEN;

  if (!token || !expectedToken || token !== expectedToken) {
    console.warn(
      "[webhook/whatsapp] Nenhuma credencial válida encontrada (query `token`, header `apikey`, `x-api-key` ou `authorization`) — requisição rejeitada.",
      { queryToken, apikeyHeader, xApiKeyHeader, authorizationHeader, tokenConfigurado: Boolean(expectedToken) }
    );
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: EvolutionWebhookBody;
  try {
    body = await request.json();
  } catch {
    // Payload ilegível — não é um erro nosso, apenas nada a processar.
    return NextResponse.json({ ok: true });
  }

  // Auditoria: loga todo payload recebido para conferir no log da Vercel se a
  // Evolution API está de fato chamando este webhook.
  console.log("[WEBHOOK RECEBIDO]", JSON.stringify(body));

  const eventName = normalizeEventName(body.event);

  // CONNECTION_UPDATE — dispara sempre que o estado da sessão do Baileys
  // muda, inclusive quando o próprio celular desconecta o dispositivo
  // vinculado pelo app do WhatsApp (o Baileys recebe isso como um "close" com
  // motivo de logout). Antes esse evento era simplesmente ignorado, então o
  // status no banco (e a lista de clientes do MASTER) só se corrigia sozinho
  // quando alguém abria a tela /whatsapp e o polling cliente-side rodava —
  // ou seja, nunca, se ninguém estivesse olhando a tela naquele momento.
  // Tratar aqui deixa a atualização automática e imediata, independente de
  // qualquer aba aberta no navegador.
  if (eventName === "CONNECTION_UPDATE") {
    const instanceName = body.instance;
    const state = extractConnectionState(body.data);

    if (instanceName && state !== "unknown") {
      try {
        const connection = await prisma.whatsappConnection.findFirst({
          where: { externalSessionId: instanceName },
        });
        if (connection) {
          await syncConnectionState(connection.userId, connection, state);
        }
      } catch (error) {
        console.error("[webhook/whatsapp] Erro ao sincronizar CONNECTION_UPDATE:", error);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // CHATS_UPDATE — o Baileys dispara isso quando o contador de não lidas de
  // uma conversa muda no WhatsApp, inclusive quando o dono marca como lida
  // pelo próprio celular (não só quando chega mensagem nova). Sem tratar
  // isso, `Chat.unreadCount` só zerava quando a conversa era aberta aqui
  // dentro da Central de Atendimento — ler no celular não refletia no SaaS.
  if (eventName === "CHATS_UPDATE") {
    const instanceName = body.instance;
    if (instanceName) {
      try {
        const connection = await prisma.whatsappConnection.findFirst({
          where: { externalSessionId: instanceName },
        });
        if (connection) {
          for (const update of extractChatUpdates(body.data)) {
            const jid = update.id ?? update.remoteJid;
            if (!jid || jid.endsWith("@g.us") || typeof update.unreadCount !== "number") continue;

            await prisma.chat.updateMany({
              where: { userId: connection.userId, contactPhone: jid.split("@")[0] },
              data: { unreadCount: Math.max(0, update.unreadCount) },
            });
          }
        }
      } catch (error) {
        console.error("[webhook/whatsapp] Erro ao sincronizar CHATS_UPDATE:", error);
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (eventName !== "MESSAGES_UPSERT") {
    return NextResponse.json({ ok: true });
  }

  const key = body.data?.key;
  const instanceName = body.instance;
  if (!key?.remoteJid || !instanceName) {
    return NextResponse.json({ ok: true });
  }

  // Mensagens de grupo ficam de fora — o motor hoje só atende conversas 1:1.
  if (key.remoteJid.endsWith("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  try {
    const connection = await prisma.whatsappConnection.findFirst({
      where: { externalSessionId: instanceName },
    });
    if (!connection) {
      console.warn("[webhook/whatsapp] Instância desconhecida (sem tenant associado):", instanceName);
      return NextResponse.json({ ok: true });
    }

    const contactPhone = key.remoteJid.split("@")[0];

    // `fromMe: true` = mensagem enviada pelo próprio número conectado — pode
    // ser o eco de algo que o robô já mandou (ignorar) ou uma mensagem
    // manual mandada direto do celular/WhatsApp Web (sincronizar na Central
    // de Atendimento). Ver `resolveOutboundFromMeMessage`. Não passa pelo
    // motor de fluxo — não é uma mensagem do contato pro robô responder.
    if (key.fromMe) {
      await resolveOutboundFromMeMessage({
        userId: connection.userId,
        key,
        message: body.data?.message,
        contactPhone,
        instanceName,
        requestOrigin: request.nextUrl.origin,
      });
      return NextResponse.json({ ok: true });
    }

    // Pode ser `null` (tenant sem fluxo ativo no momento) — `processIncomingMessage`
    // sempre registra a mensagem em Chat/Message independentemente disso, e só
    // pula a automação do fluxo quando não houver um `Flow` ativo.
    const activeFlow = await prisma.flow.findFirst({
      where: { userId: connection.userId, isActive: true },
    });

    const messageText = await resolveIncomingMessageText({
      message: body.data?.message,
      key,
      instanceName,
      userId: connection.userId,
      requestOrigin: request.nextUrl.origin,
    });

    await processIncomingMessage({
      userId: connection.userId,
      flow: activeFlow,
      contactPhone,
      contactName: body.data?.pushName,
      messageText,
      externalMessageId: key.id,
    });
  } catch (error) {
    console.error("[webhook/whatsapp] Erro ao processar mensagem recebida:", error);
  }

  return NextResponse.json({ ok: true });
}
