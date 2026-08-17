import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/flow-engine";

/**
 * POST /api/webhooks/whatsapp — recebido diretamente da Evolution API v2 a
 * cada evento configurado na instância (ver `setWebhook` em
 * `evolution-api.ts`, chamado por `POST /api/whatsapp/connect`).
 *
 * Só o evento de mensagem recebida (`messages.upsert`/`MESSAGES_UPSERT`,
 * dependendo da versão da Evolution API) importa aqui — os demais são
 * ignorados com 200 OK para a Evolution API não ficar reenviando.
 *
 * Autenticado por um token simples na query string (reaproveita
 * `WHATSAPP_SERVICE_TOKEN`), já que esta rota fica fora do middleware de
 * sessão (a Evolution API não tem cookie de login desta aplicação).
 */

type EvolutionMessageKey = { remoteJid?: string; fromMe?: boolean; id?: string };

type EvolutionMessageContent = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  buttonsResponseMessage?: { selectedDisplayText?: string };
  listResponseMessage?: { title?: string };
};

type EvolutionWebhookBody = {
  event?: string;
  instance?: string;
  data?: {
    key?: EvolutionMessageKey;
    message?: EvolutionMessageContent;
    pushName?: string;
  };
};

/** Extrai o texto "efetivo" da mensagem, cobrindo texto puro e respostas a botões/lista. */
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

/** Normaliza o nome do evento para SCREAMING_SNAKE_CASE, cobrindo tanto "messages.upsert" quanto "MESSAGES_UPSERT". */
function normalizeEventName(rawEvent: string | undefined): string {
  return (rawEvent ?? "").toUpperCase().replace(/[.\s]/g, "_");
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // Log incondicional — antes de qualquer validação — para conseguir auditar
  // no log da Vercel exatamente o que a Evolution API está enviando, mesmo
  // quando a requisição acaba sendo rejeitada logo abaixo.
  console.log("[WEBHOOK HEADERS/QUERY]", { url: request.url, tokenReceived: token });

  if (!token || token !== process.env.WHATSAPP_SERVICE_TOKEN) {
    console.warn("[webhook/whatsapp] Token ausente ou inválido na query string — requisição rejeitada.", {
      tokenReceived: token,
      tokenConfigurado: Boolean(process.env.WHATSAPP_SERVICE_TOKEN),
    });
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: EvolutionWebhookBody;
  try {
    body = await request.json();
  } catch {
    // Payload ilegível — não é um erro nosso, apenas nada a processar.
    return NextResponse.json({ ok: true });
  }

  // Auditoria: loga todo payload recebido (inclusive eventos que serão
  // ignorados abaixo, como CONNECTION_UPDATE) para conferir no log da Vercel
  // se a Evolution API está de fato chamando este webhook.
  console.log("[WEBHOOK RECEBIDO]", JSON.stringify(body));

  const eventName = normalizeEventName(body.event);
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
    const messageText = extractMessageText(body.data?.message);

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
