import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createInstance, deleteInstance, instanceNameFor, setWebhook, type EvolutionQrResult } from "@/lib/evolution-api";

/** URL pública de produção — último fallback antes de recorrer à origem da própria requisição. */
const FALLBACK_PUBLIC_URL = "https://saas-automacao-eight.vercel.app";

/**
 * Resolve a URL pública da aplicação para registrar o webhook na Evolution
 * API. Prioridade: `APP_URL` (env) > URL fixa de produção na Vercel >
 * origem da própria requisição (`request.nextUrl.origin`). Em produção,
 * nunca deixa passar um candidato com `localhost` (ex: `APP_URL` mal
 * configurada) — pula para o próximo da lista.
 */
function resolvePublicAppUrl(requestOrigin: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const candidates = [process.env.APP_URL, FALLBACK_PUBLIC_URL, requestOrigin];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isProd && candidate.includes("localhost")) continue;
    return candidate.replace(/\/+$/, "");
  }

  return requestOrigin;
}

/** Monta a URL pública do webhook de mensagens, autenticada por token na query string. */
function webhookUrlFor(requestOrigin: string): string | null {
  const token = process.env.WHATSAPP_SERVICE_TOKEN;
  if (!token) return null;
  const publicUrl = resolvePublicAppUrl(requestOrigin);
  return `${publicUrl}/api/webhooks/whatsapp?token=${encodeURIComponent(token)}`;
}

/** Expurga (melhor esforço) e cria a instância do zero, exigindo um QR Code válido na resposta. */
async function purgeAndCreate(instanceName: string, webhookUrl: string | null): Promise<EvolutionQrResult> {
  try {
    await deleteInstance(instanceName);
  } catch (error) {
    console.warn(`[whatsapp/connect] Expurgo de '${instanceName}' falhou (provavelmente não existia):`, error);
  }

  const qr = await createInstance(instanceName, webhookUrl ?? undefined);
  if (!qr.base64) {
    throw new Error("A Evolution API respondeu, mas não retornou um QR Code.");
  }
  return qr;
}

/**
 * POST /api/whatsapp/connect — dispara o pareamento real via Evolution API v2.
 *
 * 1. Marca a conexão como "CONNECTING" imediatamente (feedback rápido na UI).
 * 2. Expurga preventivamente qualquer instância antiga com o nome
 *    determinístico do tenant e cria do zero, já embutindo o webhook no
 *    payload de criação (`purgeAndCreate`).
 * 3. Se isso falhar (ex: a Evolution API recusa apagar/recriar esse nome
 *    específico por algum estado travado na VPS — pode acontecer mesmo com o
 *    token correto), tenta mais uma vez com um nome de instância novo
 *    ("limpo"), que não tem nenhum histórico prévio na VPS para conflitar.
 * 4. Salva o QR Code (base64) e o `externalSessionId` (o nome efetivamente
 *    usado, que pode ser o "limpo" do passo 3) no banco, para a tela
 *    /whatsapp exibi-lo via polling em GET /api/whatsapp/status.
 * 5. Registra o webhook explicitamente via `setWebhook` (além do embutido no
 *    passo 2) — garante que a Evolution API passe a chamar
 *    `POST /api/webhooks/whatsapp` mesmo em versões que ignoram o campo
 *    `webhook` no payload de `/instance/create`.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const baseInstanceName = instanceNameFor(userId);
  const webhookUrl = webhookUrlFor(request.nextUrl.origin);

  if (!webhookUrl) {
    console.warn("[whatsapp/connect] WHATSAPP_SERVICE_TOKEN ausente — webhook não será configurado.");
  }

  await prisma.whatsappConnection.upsert({
    where: { userId },
    create: { userId, status: "CONNECTING", externalSessionId: baseInstanceName },
    update: { status: "CONNECTING", qrCode: null, externalSessionId: baseInstanceName },
  });

  let instanceName = baseInstanceName;
  let qr: EvolutionQrResult;

  try {
    qr = await purgeAndCreate(instanceName, webhookUrl);
  } catch (firstError) {
    console.warn(
      `[whatsapp/connect] Falha ao criar a instância '${baseInstanceName}' — tentando um nome limpo alternativo:`,
      firstError
    );

    // Nome alternativo sem nenhum histórico na VPS — evita depender do
    // /instance/delete funcionar sobre o nome antigo (que pode estar preso
    // num estado que a Evolution API recusa liberar, mesmo com o token certo).
    instanceName = `${baseInstanceName}_${Date.now().toString(36)}`;

    try {
      // Força a limpeza do registro anterior antes de recriar com o nome novo.
      await prisma.whatsappConnection.deleteMany({ where: { userId } });
      await prisma.whatsappConnection.create({
        data: { userId, status: "CONNECTING", externalSessionId: instanceName },
      });

      qr = await purgeAndCreate(instanceName, webhookUrl);
    } catch (secondError) {
      await prisma.whatsappConnection.upsert({
        where: { userId },
        create: { userId, status: "ERROR" },
        update: { status: "ERROR" },
      });

      const message =
        secondError instanceof Error
          ? secondError.message
          : "Erro inesperado ao conectar com a Evolution API.";
      console.error("[whatsapp/connect] Falha ao criar instância mesmo com nome limpo:", secondError);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  await prisma.whatsappConnection.update({
    where: { userId },
    data: {
      status: "QR_PENDING",
      qrCode: qr.base64,
      externalSessionId: instanceName,
      // O QR Code do WhatsApp costuma expirar rapidamente; se o usuário não
      // escanear a tempo, ele pode clicar em "Conectar" novamente.
      qrExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  // Registra o webhook explicitamente — melhor esforço: se falhar, o
  // pareamento (QR Code) segue normalmente, só o robô não vai reagir a
  // mensagens automaticamente até uma nova tentativa de conexão.
  if (webhookUrl) {
    try {
      await setWebhook(instanceName, webhookUrl);
    } catch (error) {
      console.warn("[whatsapp/connect] Falha ao configurar webhook da instância:", error);
    }
  }

  return NextResponse.json({ ok: true });
}
