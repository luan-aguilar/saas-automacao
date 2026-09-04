import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { processIncomingMessage } from "@/lib/flow-engine";
import { getCloudApiMediaBytes } from "@/lib/whatsapp-cloud-api";

/**
 * GET/POST /api/webhooks/whatsapp-cloud — equivalente, pro provedor CLOUD_API
 * (API oficial do WhatsApp Business Platform da Meta), do que
 * `/api/webhooks/whatsapp/route.ts` já é pro Evolution API. Rota SEPARADA
 * (não a mesma) porque o formato do payload da Meta não tem nenhuma relação
 * com o da Evolution API — tentar compartilhar uma única rota só criaria
 * `if`s frágeis tentando adivinhar de qual provedor veio cada requisição.
 *
 * Cadastrada UMA VEZ no App da Meta (Meta for Developers → WhatsApp →
 * Configuração → Webhooks) — não por tenant. A Meta manda todo evento de
 * TODOS os números registrados sob o mesmo App pra essa única URL; o tenant
 * é resolvido a cada mensagem pelo `phone_number_id` que vem no próprio
 * payload (`WhatsappConnection.cloudApiPhoneNumberId`) — mesmo princípio já
 * usado no Evolution API pra resolver o tenant pelo `instance` do payload.
 *
 * GET — verificação do endpoint, exigida pela Meta ao cadastrar/validar a
 * URL do webhook (ver `hub.challenge`): só nesse momento, nunca depois.
 * POST — eventos de fato (mensagem recebida, status de entrega).
 *
 * Autenticado por `WHATSAPP_CLOUD_VERIFY_TOKEN` (usado só na verificação
 * GET — a Meta não reenvia esse token nos POSTs subsequentes; em produção,
 * validar a assinatura `X-Hub-Signature-256` do corpo seria o próximo passo
 * de segurança, ainda não implementado aqui).
 */

type CloudApiMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  button?: { text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

type CloudApiWebhookBody = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: CloudApiMessage[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
};

/** Extrai o texto "efetivo" de uma mensagem — texto puro, resposta a botão/lista, ou legenda de imagem (a imagem em si é tratada à parte, ver `resolveIncomingMessageText`). */
function extractMessageText(message: CloudApiMessage): string {
  const text =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    "";
  return text.trim();
}

/**
 * Resolve o texto "efetivo" da mensagem — mesmo papel de
 * `resolveIncomingMessageText` no webhook do Evolution API: baixa a foto (se
 * houver), salva em `MediaAsset`, devolve um texto com a legenda + a URL
 * pública, pra a IA do fluxo poder "ver" a imagem (`analyzeAttachedImages`).
 */
async function resolveIncomingMessageText(params: {
  message: CloudApiMessage;
  accessToken: string;
  userId: string;
  requestOrigin: string;
}): Promise<string> {
  const { message, accessToken, userId, requestOrigin } = params;

  if (message.type === "image" && message.image?.id) {
    const caption = message.image.caption?.trim() ?? "";
    const media = await getCloudApiMediaBytes(accessToken, message.image.id);

    if (!media) {
      console.warn("[webhook/whatsapp-cloud] Falha ao baixar foto recebida — seguindo sem URL.");
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

/** Verificação do webhook — a Meta chama isso UMA VEZ ao cadastrar/validar a URL (ver `hub.mode`/`hub.verify_token`/`hub.challenge`). */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  console.warn("[webhook/whatsapp-cloud] Verificação falhou.", { mode, tokenConfigurado: Boolean(expectedToken) });
  return NextResponse.json({ error: "Verificação falhou" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  let body: CloudApiWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  console.log("[WEBHOOK CLOUD API RECEBIDO]", JSON.stringify(body));

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // `statuses` (sent/delivered/read/failed) — só reconhecemos por ora,
      // mesmo comportamento que o Evolution API já tem hoje pro equivalente
      // MESSAGES_UPDATE (não tratado, evita reenvio da Meta e nada mais).
      if (!value?.messages || value.messages.length === 0) continue;

      try {
        const connection = await prisma.whatsappConnection.findFirst({
          where: { cloudApiPhoneNumberId: phoneNumberId },
        });
        if (!connection) {
          console.warn("[webhook/whatsapp-cloud] phone_number_id desconhecido (sem tenant associado):", phoneNumberId);
          continue;
        }
        if (!connection.cloudApiAccessTokenEncrypted) {
          console.warn("[webhook/whatsapp-cloud] Tenant sem token de acesso configurado:", connection.userId);
          continue;
        }
        const accessToken = decrypt(connection.cloudApiAccessTokenEncrypted);

        const contactName = value.contacts?.[0]?.profile?.name;

        for (const message of value.messages) {
          if (!message.from) continue;

          const messageText = await resolveIncomingMessageText({
            message,
            accessToken,
            userId: connection.userId,
            requestOrigin: request.nextUrl.origin,
          });

          const activeFlow = await prisma.flow.findFirst({
            where: { userId: connection.userId, isActive: true },
          });

          await processIncomingMessage({
            userId: connection.userId,
            flow: activeFlow,
            contactPhone: message.from,
            contactName,
            messageText,
            externalMessageId: message.id,
          });
        }
      } catch (error) {
        console.error("[webhook/whatsapp-cloud] Erro ao processar mensagem recebida:", error);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
