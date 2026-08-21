import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const session = await auth();
  const tenantId = getTenantId(session!.user);

  const [chats, config, connection] = await Promise.all([
    prisma.chat.findMany({
      where: { userId: tenantId },
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
    }),
    prisma.config.findUnique({ where: { userId: tenantId }, select: { aiGloballyEnabled: true } }),
    prisma.whatsappConnection.findUnique({ where: { userId: tenantId }, select: { status: true } }),
  ]);

  return (
    <div className="h-full">
      <ChatView
        initialChats={chats.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() }))}
        initialAiGloballyEnabled={config?.aiGloballyEnabled ?? true}
        initialWhatsappStatus={connection?.status ?? "DISCONNECTED"}
        canDeleteChat={session!.user.role !== "FUNCIONARIO"}
      />
    </div>
  );
}
