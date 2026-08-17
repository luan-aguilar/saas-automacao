import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteInstance, logoutInstance, instanceNameFor, EvolutionApiError } from "@/lib/evolution-api";

/**
 * Logout + delete na Evolution API, em melhor esforço e EM PARALELO entre si
 * (não sequencial) — cada chamada já tem seu próprio timeout de 3s em
 * `evolutionFetch`, então rodar as duas ao mesmo tempo limita o pior caso
 * desta função a ~3s (em vez de ~6s se fossem uma depois da outra). Nunca
 * lança: qualquer erro (403/404/500/timeout) é só logado.
 */
async function cleanupEvolutionInstance(instanceName: string): Promise<void> {
  const [logoutResult, deleteResult] = await Promise.allSettled([
    logoutInstance(instanceName), // fecha o socket ativo do Baileys, se houver um
    deleteInstance(instanceName), // destrói as credenciais salvas, evitando reconexão automática
  ]);

  if (logoutResult.status === "rejected") {
    const status = logoutResult.reason instanceof EvolutionApiError ? logoutResult.reason.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao fazer logout na Evolution API (status ${status}):`, logoutResult.reason);
  }
  if (deleteResult.status === "rejected") {
    const status = deleteResult.reason instanceof EvolutionApiError ? deleteResult.reason.status : undefined;
    console.error(`[whatsapp/disconnect] Falha ao apagar a instância na Evolution API (status ${status}):`, deleteResult.reason);
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
 * responde 200 assim que as duas terminarem. O SaaS jamais deve deixar o
 * botão "Desconectar" travado esperando a VPS, nem continuar exibindo
 * "Conectado" depois do clique.
 *
 * Nota técnica: o ideal seria disparar a limpeza na VPS sem esperar por ela
 * (fire-and-forget) e responder assim que `deleteMany` terminasse — mas o
 * Next.js 14.2.15 usado neste projeto não expõe uma API de "background task"
 * (o `after()`/`unstable_after` só existe a partir de versões mais novas do
 * Next.js), e uma função serverless na Vercel pode ser congelada assim que a
 * resposta é enviada, o que arriscaria a limpeza na VPS nunca rodar de
 * verdade. Por isso ainda aguardamos as duas coisas juntas — mas como as
 * chamadas à VPS agora rodam em paralelo entre si e têm timeout de 3s cada
 * (ver `evolutionFetch`), o pior caso é limitado a ~3s, não mais indefinido.
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
