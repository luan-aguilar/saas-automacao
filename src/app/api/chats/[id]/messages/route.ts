import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function assertOwnership(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat || chat.userId !== userId) return null;
  return chat;
}

// GET /api/chats/:id/messages — histórico de mensagens da conversa
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chat = await assertOwnership(params.id, session.user.id);
  if (!chat) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { chatId: params.id },
    orderBy: { createdAt: "asc" },
  });

  // Zera contador de não lidas ao abrir a conversa
  await prisma.chat.update({ where: { id: params.id }, data: { unreadCount: 0 } });

  return NextResponse.json({ messages });
}

const sendSchema = z.object({ content: z.string().min(1) });

// POST /api/chats/:id/messages — envia uma mensagem manual (intervenção humana)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chat = await assertOwnership(params.id, session.user.id);
  if (!chat) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      chatId: params.id,
      direction: "OUTBOUND",
      sender: "HUMAN",
      content: parsed.data.content,
    },
  });

  await prisma.chat.update({
    where: { id: params.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: parsed.data.content.slice(0, 120) },
  });

  // TODO: encaminhar esta mensagem ao serviço externo do WhatsApp para envio real
  // (POST `${WHATSAPP_SERVICE_URL}/messages`), já que o envio efetivo depende da
  // sessão Baileys/whatsapp-web.js mantida fora da Vercel.

  return NextResponse.json({ message });
}
