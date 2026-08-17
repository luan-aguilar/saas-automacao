import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteInstance, logoutInstance, instanceNameFor, EvolutionApiError } from "@/lib/evolution-api";

/**
 * POST /api/whatsapp/disconnect — encerra a sessão do WhatsApp na Evolution
 * API (melhor esforço) e SEMPRE limpa o registro local, para a tela
 * /whatsapp voltar a exibir a opção de gerar um novo QR Code.
 *
 * Importante: mesmo com a `AUTHENTICATION_API_KEY`/`WHATSAPP_SERVICE_TOKEN`
 * corretos, a Evolution API v2 pode responder 403 em `/instance/delete` (é um
 * comportamento conhecido dela recusar a deleção de uma instância em certos
 * estados). Por isso este endpoint é intencionalmente idempotente e nunca
 * retorna erro por causa da VPS: a limpeza do lado do app (o que decide o
 * que a UI mostra) roda sempre, independentemente do resultado das chamadas
 * à Evolution API — o SaaS jamais deve continuar exibindo "Conectado" depois
 * que o usuário clicou em "Desconectar".
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const connection = await prisma.whatsappConnection.findUnique({ where: { userId } });

  // Mesmo sem registro local (ou sem `externalSessionId` salvo), recalcula o
  // nome determinístico e tenta limpar a instância na VPS de qualquer forma
  // — não há motivo para pular esse passo só porque o Prisma já não tem o
  // dado (pode ter havido uma falha anterior no meio do processo).
  const instanceName = connection?.externalSessionId ?? instanceNameFor(userId);

  // 1) Logout "gracioso" — fecha o socket ativo do Baileys, se houver um.
  try {
    await logoutInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao fazer logout na Evolution API (status ${status}):`, error);
  }

  // 2) Delete definitivo — destrói as credenciais/token de sessão salvos, o
  // que é o que efetivamente evita a reconexão automática alguns segundos
  // depois. Qualquer erro (403/404/500) é só logado — nunca bloqueia o passo 3.
  try {
    await deleteInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao apagar a instância na Evolution API (status ${status}):`, error);
  }

  // 3) Limpeza local obrigatória. `deleteMany` (em vez de `delete`) nunca
  // lança se o registro já não existir, então este passo nunca falha — e o
  // histórico de `Chat`/`Message` do tenant não é afetado, só a conexão.
  await prisma.whatsappConnection.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true });
}
