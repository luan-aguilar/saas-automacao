import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const session = await auth();

  const chats = await prisma.chat.findMany({
    where: { userId: session!.user.id },
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

  return (
    <div className="h-full">
      <ChatView
        initialChats={chats.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() }))}
      />
    </div>
  );
}
