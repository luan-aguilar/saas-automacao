import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteInstance, logoutInstance, instanceNameFor, EvolutionApiError } from "@/lib/evolution-api";

/** Logout + delete na Evolution API, em melhor esforço — nunca lança (erros só são logados). */
async function cleanupEvolutionInstance(instanceName: string): Promise<void> {
  // 1) Logout "gracioso" — fecha o socket ativo do Baileys, se houver um.
  try {
    await logoutInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao fazer logout na Evolution API (status ${status}):`, error);
  }

  // 2) Delete definitivo — destrói as credenciais/token de sessão salvos, o
  // que é o que efetivamente evita a reconexão automática alguns segundos
  // depois. Qualquer erro (403/404/500/timeout) é só logado.
  try {
    await deleteInstance(instanceName);
  } catch (error) {
    const status = error instanceof EvolutionApiError ? error.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao apagar a instância na Evolution API (status ${status}):`, error);
  }
}

/**
 * POST /api/whatsapp/disconnect — encerra a sessão do WhatsApp na Evolution
 * API (melhor esforço) e SEMPRE limpa o registro local, para a tela
 * /whatsapp voltar a exibir a opção de gerar um novo QR Code.
 *
 * Importante: mesmo com a `AUTHENTICATION_API_KEY`/`WHATSAPP_SERVICE_TOKEN`
 * corretos, a Evolution API v2 pode responder lento, travar ou responder 403
 * em `/instance/delete` (comportamento conhecido dela em certos estados de
 * instância). Por isso a limpeza local (`deleteMany`, o que decide o que a
 * UI mostra) roda em PARALELO com a tentativa de limpeza na VPS — em vez de
 * esperar a VPS responder antes de sequer tocar no banco — e a rota sempre
 * responde 200 assim que as duas terminarem (cada chamada à VPS já tem um
 * timeout próprio de 4s em `evolutionFetch`, então o pior caso é previsível
 * e curto). O SaaS jamais deve deixar o botão "Desconectar" travado
 * esperando a VPS, nem continuar exibindo "Conectado" depois do clique.
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

  await Promise.allSettled([
    prisma.whatsappConnection.deleteMany({ where: { userId } }),
    cleanupEvolutionInstance(instanceName),
  ]);

  return NextResponse.json({ ok: true, success: true });
}
