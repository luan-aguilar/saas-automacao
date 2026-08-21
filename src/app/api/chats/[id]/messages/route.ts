import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsappMessage } from "@/lib/whatsapp-service";
import { getTenantId } from "@/lib/tenant";

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

  const tenantId = getTenantId(session.user);
  const chat = await assertOwnership(params.id, tenantId);
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

  const tenantId = getTenantId(session.user);
  const chat = await assertOwnership(params.id, tenantId);
  if (!chat) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
  }

  const sendResult = await sendWhatsappMessage(tenantId, chat.contactPhone, parsed.data.content);
  if (!sendResult.ok) {
    console.error("[chats/messages] Falha ao enviar mensagem via WhatsApp:", sendResult.error);
  }

  // `externalId` (quando o envio funciona) é o que permite o webhook
  // reconhecer o eco desta mesma mensagem (evento `fromMe`) e não duplicá-la
  // no histórico — ver `resolveOutboundFromMeMessage` no webhook.
  const message = await prisma.message.create({
    data: {
      chatId: params.id,
      direction: "OUTBOUND",
      sender: "HUMAN",
      content: parsed.data.content,
      externalId: sendResult.ok ? sendResult.externalId : undefined,
    },
  });

  // Intervenção manual do operador: desativa a IA para esta conversa
  // automaticamente (o motor de fluxo passa a ignorar novas mensagens deste
  // contato até o operador reativar pelo toggle no topo do chat).
  await prisma.chat.update({
    where: { id: params.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: parsed.data.content.slice(0, 120),
      aiEnabled: false,
    },
  });

  return NextResponse.json({ message, aiEnabled: false });
}

const deleteSchema = z.union([
  z.object({ clearAll: z.literal(true) }),
  z.object({ messageIds: z.array(z.string().min(1)).min(1) }),
]);

/**
 * Atualiza `lastMessageAt`/`lastMessagePreview` do Chat para refletir a
 * mensagem mais recente que sobrou depois de uma exclusão — evita a prévia
 * da lista lateral continuar mostrando o texto de uma mensagem já apagada.
 */
async function refreshChatPreview(chatId: string) {
  const latest = await prisma.message.findFirst({
    where: { chatId },
    orderBy: { createdAt: "desc" },
  });

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageAt: latest?.createdAt ?? new Date(),
      lastMessagePreview: latest?.content.slice(0, 120) ?? null,
    },
  });
}

// DELETE /api/chats/:id/messages — apaga mensagens desta conversa (só no
// SaaS, nunca no WhatsApp do contato): `{ clearAll: true }` limpa a conversa
// inteira (mantém o Chat, some com o histórico); `{ messageIds: [...] }`
// apaga só as mensagens indicadas (uma ou várias, seleção do operador).
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  const chat = await assertOwnership(params.id, tenantId);
  if (!chat) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  if ("clearAll" in parsed.data) {
    await prisma.message.deleteMany({ where: { chatId: params.id } });
  } else {
    await prisma.message.deleteMany({ where: { chatId: params.id, id: { in: parsed.data.messageIds } } });
  }

  await refreshChatPreview(params.id);

  return NextResponse.json({ ok: true });
}
