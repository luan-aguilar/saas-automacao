import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

// DELETE /api/chats/:id — exclui a conversa inteira (só no SaaS, nunca no
// WhatsApp do contato). `Message` é apagado em cascata (onDelete: Cascade no
// schema). Não mexe na `FlowSession` do contato de propósito — se ele
// escrever de novo, o motor de fluxo recria a conversa normalmente e segue
// de onde a automação estava, só o histórico visual na Central de
// Atendimento é que começa vazio.
//
// Restrito ao dono do tenant (MASTER/CLIENTE): um FUNCIONARIO não pode
// apagar histórico de conversa — é justamente o tipo de ação que poderia
// esconder um lead desviado, então fica de fora do escopo dele.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const tenantId = getTenantId(session.user);
  const chat = await prisma.chat.findUnique({ where: { id: params.id } });
  if (!chat || chat.userId !== tenantId) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  await prisma.chat.delete({ where: { id: params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CHAT_DELETED",
      target: params.id,
      metadata: { contactName: chat.contactName, contactPhone: chat.contactPhone },
    },
  });

  return NextResponse.json({ ok: true });
}
