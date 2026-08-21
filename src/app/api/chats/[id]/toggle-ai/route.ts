import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ aiEnabled: z.boolean() });

// POST /api/chats/:id/toggle-ai — liga/desliga a IA para uma conversa específica
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  const chat = await prisma.chat.findUnique({ where: { id: params.id } });
  if (!chat || chat.userId !== tenantId) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const updated = await prisma.chat.update({
    where: { id: params.id },
    data: { aiEnabled: parsed.data.aiEnabled },
  });

  // Ao REATIVAR a IA manualmente (operador ligando o toggle de volta), reseta
  // a sessão do fluxo desse contato — sem isso, a IA voltava "lembrando" de
  // toda a conversa/testes anteriores (histórico, dados já coletados, node
  // onde parou), o que é constrangedor quando o contato é retestado do zero
  // (ex: dono de outro salão testando o robô) e ele responde como se já
  // conhecesse a pessoa. Igual a um cliente novo: a próxima mensagem dele
  // aciona o node de trigger e começa o fluxo do absoluto zero.
  if (parsed.data.aiEnabled) {
    await prisma.flowSession.deleteMany({
      where: { userId: chat.userId, contactPhone: chat.contactPhone },
    });
  }

  await prisma.message.create({
    data: {
      chatId: params.id,
      direction: "OUTBOUND",
      sender: "SYSTEM",
      content: parsed.data.aiEnabled
        ? "IA reativada para esta conversa — atendimento reiniciado do zero."
        : "IA pausada — atendimento humano assumiu esta conversa.",
    },
  });

  // Só registramos no log quando a ação vem de um FUNCIONARIO — é a
  // transparência que interessa ao dono do tenant (ver a movimentação de
  // leads da equipe dele), não cada clique do próprio dono no toggle.
  if (session.user.role === "FUNCIONARIO") {
    await writeAuditLog({
      actor: session.user,
      action: parsed.data.aiEnabled ? "CHAT_AI_REACTIVATED" : "CHAT_AI_TAKEOVER",
      target: params.id,
      metadata: { contactName: chat.contactName, contactPhone: chat.contactPhone },
    });
  }

  return NextResponse.json({ chat: updated });
}
