import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteInstance, logoutInstance, EvolutionApiError } from "@/lib/evolution-api";

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

  // 1) e 2) Logout + delete na Evolution API — melhor esforço. Qualquer erro
  // aqui (403 de token incorreto, 404 de instância já removida, 500 da VPS
  // instável, etc.) é apenas logado: o SaaS NUNCA deve ficar preso no estado
  // "Conectado" por causa de uma falha de permissão/instabilidade da VPS. O
  // passo 3 abaixo (apagar o registro local) roda sempre, independentemente
  // do resultado destas duas chamadas.
  try {
    // Logout "gracioso" — fecha o socket ativo do Baileys, se houver um.
    await logoutInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao fazer logout na Evolution API (status ${status}):`, error);
  }

  try {
    // Delete definitivo — destrói as credenciais/token de sessão salvos, o
    // que é o que efetivamente evita a reconexão automática alguns segundos
    // depois. Sem isso, o Baileys reabre a conexão sozinho usando o auth
    // state em cache e o status volta para "CONNECTED" no próximo polling.
    await deleteInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao apagar a instância na Evolution API (status ${status}):`, error);
  }

  // 3) Remove o registro local por completo (em vez de só resetar os campos)
  // — isso limpa qualquer estado travado da sessão anterior (QR expirado,
  // status inconsistente, etc.) sem apagar nada de `Chat`/`Message` (o
  // histórico de conversas do tenant é preservado). Ao clicar em "Conectar"
  // novamente, `/api/whatsapp/connect` recria o registro do zero via upsert,
  // com um `instanceName` novo (determinístico, via `instanceNameFor`).
  await prisma.whatsappConnection.delete({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
