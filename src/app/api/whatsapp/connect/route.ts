import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createInstance, deleteInstance, instanceNameFor, setWebhook } from "@/lib/evolution-api";

/** Monta a URL pública do webhook de mensagens, autenticada por token na query string. */
function webhookUrlFor(): string | null {
  const appUrl = process.env.NEXTAUTH_URL;
  const token = process.env.WHATSAPP_SERVICE_TOKEN;
  if (!appUrl || !token) return null;
  return `${appUrl}/api/webhooks/whatsapp?token=${encodeURIComponent(token)}`;
}

/**
 * POST /api/whatsapp/connect — dispara o pareamento real via Evolution API v2.
 *
 * 1. Marca a conexão como "CONNECTING" imediatamente (feedback rápido na UI).
 * 2. Expurga preventivamente qualquer instância antiga com este nome
 *    (`deleteInstance`, melhor esforço) — garante que a criação abaixo parta
 *    sempre de um estado limpo, sem depender de nenhuma sessão anterior.
 * 3. Cria a instância do zero (`createInstance`) e exige um QR Code válido na
 *    resposta — sem fallback silencioso para uma sessão pré-existente.
 * 4. Salva o QR Code (base64) retornado no banco, para a tela /whatsapp
 *    exibi-lo via polling em GET /api/whatsapp/status.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const instanceName = instanceNameFor(session.user.id);

  await prisma.whatsappConnection.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, status: "CONNECTING", externalSessionId: instanceName },
    update: { status: "CONNECTING", qrCode: null, externalSessionId: instanceName },
  });

  // Expurgo preventivo: apaga qualquer instância antiga com este nome antes de
  // recriar do zero. Sem isso, uma sessão travada/corrompida na Evolution API
  // (ex: credenciais órfãs de uma desconexão anterior mal-sucedida) pode
  // impedir um QR Code novo de ser gerado ou causar reconexão automática
  // indesejada. Melhor esforço — se a instância não existir, a Evolution API
  // simplesmente responde com erro (ignorado) e seguimos para criar normalmente.
  try {
    await deleteInstance(instanceName);
  } catch (error) {
    console.warn(
      "[whatsapp/connect] Expurgo preventivo da instância falhou (provavelmente não existia ainda):",
      error
    );
  }

  try {
    const { base64 } = await createInstance(instanceName);

    if (!base64) {
      await prisma.whatsappConnection.update({
        where: { userId: session.user.id },
        data: { status: "ERROR" },
      });
      return NextResponse.json(
        {
          error:
            "A Evolution API respondeu, mas não retornou um QR Code. Aguarde alguns segundos e tente novamente.",
        },
        { status: 502 }
      );
    }

    await prisma.whatsappConnection.update({
      where: { userId: session.user.id },
      data: {
        status: "QR_PENDING",
        qrCode: base64,
        // O QR Code do WhatsApp costuma expirar rapidamente; se o usuário não
        // escanear a tempo, ele pode clicar em "Conectar" novamente.
        qrExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    // Registra o webhook de mensagens recebidas na instância — melhor esforço:
    // se falhar, o pareamento (QR Code) segue normalmente, só o robô não vai
    // reagir a mensagens automaticamente até uma nova tentativa de conexão.
    const webhookUrl = webhookUrlFor();
    if (webhookUrl) {
      try {
        await setWebhook(instanceName, webhookUrl);
      } catch (error) {
        console.warn("[whatsapp/connect] Falha ao configurar webhook da instância:", error);
      }
    } else {
      console.warn(
        "[whatsapp/connect] NEXTAUTH_URL e/ou WHATSAPP_SERVICE_TOKEN ausentes — webhook não configurado."
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await prisma.whatsappConnection.update({
      where: { userId: session.user.id },
      data: { status: "ERROR" },
    });

    const message =
      error instanceof Error ? error.message : "Erro inesperado ao conectar com a Evolution API.";
    console.error("[whatsapp/connect] Falha ao criar/conectar instância:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
