import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionState, fetchInstancePhoneNumber } from "@/lib/evolution-api";

/**
 * GET /api/whatsapp/status — usado pelo frontend em polling (a cada 3s) para
 * refletir o estado real da conexão. A cada chamada, consultamos
 * `/instance/connectionState/{instanceName}` na Evolution API e sincronizamos
 * o resultado no banco, para que o badge da tela /whatsapp mude para
 * "Conectado" assim que o pareamento for concluído.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let connection = await prisma.whatsappConnection.findUnique({
    where: { userId: session.user.id },
  });

  if (connection?.externalSessionId) {
    try {
      const state = await getConnectionState(connection.externalSessionId);

      if (state === "open") {
        const phoneNumber =
          connection.phoneNumber ?? (await fetchInstancePhoneNumber(connection.externalSessionId));

        connection = await prisma.whatsappConnection.update({
          where: { userId: session.user.id },
          data: {
            status: "CONNECTED",
            phoneNumber: phoneNumber ?? connection.phoneNumber,
            qrCode: null,
            lastConnectedAt: new Date(),
          },
        });
      } else if (state === "close" && connection.status !== "DISCONNECTED") {
        connection = await prisma.whatsappConnection.update({
          where: { userId: session.user.id },
          data: { status: "DISCONNECTED", qrCode: null, lastDisconnectedAt: new Date() },
        });
      } else if (state === "connecting" && connection.status === "CONNECTED") {
        // A instância caiu e a Evolution API está tentando reconectar sozinha.
        connection = await prisma.whatsappConnection.update({
          where: { userId: session.user.id },
          data: { status: "CONNECTING" },
        });
      }
      // Para state === "connecting" com status já QR_PENDING/CONNECTING, mantemos como está
      // (o QR Code exibido continua sendo o último salvo em /api/whatsapp/connect).
    } catch (error) {
      // Evolution API instável/indisponível no momento: não derruba a tela,
      // apenas mantemos o último status conhecido no banco.
      console.error("[whatsapp/status] Falha ao consultar a Evolution API:", error);
    }
  }

  return NextResponse.json({
    status: connection?.status ?? "DISCONNECTED",
    phoneNumber: connection?.phoneNumber ?? null,
    qrCode: connection?.status === "QR_PENDING" ? connection?.qrCode : null,
    qrExpiresAt: connection?.qrExpiresAt ?? null,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
  });
}
