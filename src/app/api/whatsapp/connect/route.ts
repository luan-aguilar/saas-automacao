import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createOrConnectInstance, instanceNameFor } from "@/lib/evolution-api";

/**
 * POST /api/whatsapp/connect — dispara o pareamento real via Evolution API v2.
 *
 * 1. Marca a conexão como "CONNECTING" imediatamente (feedback rápido na UI).
 * 2. Cria a instância na Evolution API (ou reaproveita uma existente e pede
 *    um novo QR Code via /instance/connect/{instanceName}).
 * 3. Salva o QR Code (base64) retornado no banco, para a tela /whatsapp
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

  try {
    const { base64 } = await createOrConnectInstance(instanceName);

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
