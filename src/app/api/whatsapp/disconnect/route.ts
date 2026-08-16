import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutInstance } from "@/lib/evolution-api";

/**
 * POST /api/whatsapp/disconnect — encerra a sessão do WhatsApp na Evolution API
 * e volta o estado local para "DISCONNECTED", para a tela /whatsapp voltar a
 * exibir a opção de gerar um novo QR Code.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const connection = await prisma.whatsappConnection.findUnique({
    where: { userId: session.user.id },
  });

  if (!connection?.externalSessionId) {
    return NextResponse.json(
      { error: "Nenhuma sessão do WhatsApp encontrada para desconectar." },
      { status: 404 }
    );
  }

  try {
    await logoutInstance(connection.externalSessionId);
  } catch (error) {
    // Mesmo que a Evolution API já não tenha a instância conectada (ex: já
    // caiu sozinha), seguimos em frente e limpamos o estado local — o
    // objetivo final do usuário (voltar para a tela de QR Code) é atingido
    // de qualquer forma.
    console.error("[whatsapp/disconnect] Falha ao fazer logout na Evolution API:", error);
  }

  await prisma.whatsappConnection.update({
    where: { userId: session.user.id },
    data: {
      status: "DISCONNECTED",
      qrCode: null,
      qrExpiresAt: null,
      phoneNumber: null,
      lastDisconnectedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
