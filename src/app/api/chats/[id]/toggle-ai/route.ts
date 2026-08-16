import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ aiEnabled: z.boolean() });

// POST /api/chats/:id/toggle-ai — liga/desliga a IA para uma conversa específica
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chat = await prisma.chat.findUnique({ where: { id: params.id } });
  if (!chat || chat.userId !== session.user.id) {
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

  await prisma.message.create({
    data: {
      chatId: params.id,
      direction: "OUTBOUND",
      sender: "SYSTEM",
      content: parsed.data.aiEnabled
        ? "IA reativada para esta conversa."
        : "IA pausada — atendimento humano assumiu esta conversa.",
    },
  });

  return NextResponse.json({ chat: updated });
}
