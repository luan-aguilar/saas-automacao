import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/chats — lista as conversas do usuário logado, mais recentes primeiro
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chats = await prisma.chat.findMany({
    where: { userId: session.user.id },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      contactAvatarUrl: true,
      status: true,
      aiEnabled: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      unreadCount: true,
    },
  });

  return NextResponse.json({ chats });
}
