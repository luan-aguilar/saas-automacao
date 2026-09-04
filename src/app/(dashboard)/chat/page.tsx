import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const session = await auth();
  const tenantId = getTenantId(session!.user);

  const [config, connection] = await Promise.all([
    prisma.config.findUnique({ where: { userId: tenantId }, select: { aiGloballyEnabled: true } }),
    prisma.whatsappConnection.findUnique({ where: { userId: tenantId }, select: { status: true, phoneNumber: true } }),
  ]);

  // Mesmo filtro de `GET /api/chats` (ver doc de `Chat.connectedPhoneNumber`
  // em schema.prisma) — essa busca inicial (renderizada no servidor, antes
  // do primeiro polling do client) tinha ficado sem esse filtro quando a
  // feature foi adicionada, então por alguns segundos (até o primeiro
  // polling de `/api/chats` chegar) o histórico de um número antigo
  // reconectado por outra pessoa aparecia junto com o do número atual.
  const chats = connection?.phoneNumber
    ? await prisma.chat.findMany({
        where: { userId: tenantId, connectedPhoneNumber: connection.phoneNumber },
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
      })
    : [];

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
