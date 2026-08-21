import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

// GET /api/chats — lista as conversas do tenant do usuário logado (dono ou
// funcionário), mais recentes primeiro
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chats = await prisma.chat.findMany({
    where: { userId: getTenantId(session.user) },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      contactAvatarUrl: true,
      status: true,
      aiEnabled: true,
      pipelineStage: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      unreadCount: true,
    },
  });

  return NextResponse.json({ chats });
}
