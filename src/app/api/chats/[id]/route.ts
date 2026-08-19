import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/chats/:id — exclui a conversa inteira (só no SaaS, nunca no
// WhatsApp do contato). `Message` é apagado em cascata (onDelete: Cascade no
// schema). Não mexe na `FlowSession` do contato de propósito — se ele
// escrever de novo, o motor de fluxo recria a conversa normalmente e segue
// de onde a automação estava, só o histórico visual na Central de
// Atendimento é que começa vazio.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chat = await prisma.chat.findUnique({ where: { id: params.id } });
  if (!chat || chat.userId !== session.user.id) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  await prisma.chat.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
