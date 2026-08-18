import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionState } from "@/lib/evolution-api";
import { syncConnectionState } from "@/lib/whatsapp-service";

/**
 * GET /api/whatsapp/status — usado pelo frontend em polling (a cada 3s) para
 * refletir o estado real da conexão. A cada chamada, consultamos
 * `/instance/connectionState/{instanceName}` na Evolution API e sincronizamos
 * o resultado no banco, para que o badge da tela /whatsapp mude para
 * "Conectado" assim que o pareamento for concluído.
 *
 * `getConnectionState` trata um 404 da Evolution API (instância sem nenhuma
 * chave de sessão ativa do Baileys — ex: apagada numa desconexão anterior)
 * como `"close"`, então o branch abaixo já corrige sozinho qualquer registro
 * que tenha ficado com `status: "CONNECTED"` desatualizado — inclusive o que
 * alimenta a lista de clientes do MASTER (`/clients`), já que ela lê o mesmo
 * campo `WhatsappConnection.status` gravado aqui.
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
      connection = await syncConnectionState(session.user.id, connection, state);
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
