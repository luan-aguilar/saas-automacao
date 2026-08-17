import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteInstance, logoutInstance } from "@/lib/evolution-api";

/**
 * POST /api/whatsapp/disconnect — encerra definitivamente a sessão do
 * WhatsApp na Evolution API e volta o estado local para "DISCONNECTED", para
 * a tela /whatsapp voltar a exibir a opção de gerar um novo QR Code.
 *
 * Importante: `logoutInstance` (DELETE /instance/logout) sozinho apenas
 * fecha o socket, mas MANTÉM as credenciais da sessão salvas na Evolution
 * API — o Baileys então reconecta sozinho poucos segundos depois usando esse
 * cache, fazendo o botão "Desconectar" parecer não funcionar. Por isso aqui
 * chamamos também `deleteInstance` (DELETE /instance/delete), que apaga a
 * instância e destrói de vez as credenciais/token de sessão, impedindo a
 * reconexão automática.
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

  const instanceName = connection.externalSessionId;

  // 1) Logout "gracioso" — fecha o socket ativo do Baileys, se houver um.
  try {
    await logoutInstance(instanceName);
  } catch (error) {
    // Segue em frente mesmo se falhar (ex: instância já estava desconectada).
    console.error("[whatsapp/disconnect] Falha ao fazer logout na Evolution API:", error);
  }

  // 2) Delete definitivo — destrói as credenciais/token de sessão salvos, o
  // que é o que efetivamente evita a reconexão automática alguns segundos
  // depois. Sem isso, o Baileys reabre a conexão sozinho usando o auth state
  // em cache e o status volta para "CONNECTED" no próximo polling.
  try {
    await deleteInstance(instanceName);
  } catch (error) {
    console.error("[whatsapp/disconnect] Falha ao apagar a instância na Evolution API:", error);
  }

  // 3) Limpa o estado local — inclusive `externalSessionId` (nome da
  // instância), para que o polling de /api/whatsapp/status pare de consultar
  // a Evolution API para essa instância (que agora está apagada/inexistente)
  // e não corra o risco de "revalidar" uma conexão antiga. Ao clicar em
  // "Conectar" novamente, /api/whatsapp/connect gera um `instanceName` novo
  // (determinístico, via `instanceNameFor`) e recria a instância do zero.
  await prisma.whatsappConnection.update({
    where: { userId: session.user.id },
    data: {
      status: "DISCONNECTED",
      qrCode: null,
      qrExpiresAt: null,
      phoneNumber: null,
      externalSessionId: null,
      lastDisconnectedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
