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

  if (eventName !== "MESSAGES_UPSERT") {
    return NextResponse.json({ ok: true });
  }

  const key = body.data?.key;
  const instanceName = body.instance;
  if (!key?.remoteJid || !instanceName) {
    return NextResponse.json({ ok: true });
  }

  // Ignora mensagens enviadas pelo próprio robô e mensagens de grupo (motor hoje só atende 1:1).
  if (key.fromMe || key.remoteJid.endsWith("@g.us")) {
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

    // Pode ser `null` (tenant sem fluxo ativo no momento) — `processIncomingMessage`
    // sempre registra a mensagem em Chat/Message independentemente disso, e só
    // pula a automação do fluxo quando não houver um `Flow` ativo.
    const activeFlow = await prisma.flow.findFirst({
      where: { userId: connection.userId, isActive: true },
    });

    const contactPhone = key.remoteJid.split("@")[0];
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
    });
  } catch (error) {
    console.error("[webhook/whatsapp] Erro ao processar mensagem recebida:", error);
  }

  return NextResponse.json({ ok: true });
}
