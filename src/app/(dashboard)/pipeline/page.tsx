import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export default async function PipelinePage() {
  const session = await auth();

  const chats = await prisma.chat.findMany({
    where: { userId: session!.user.id },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      contactAvatarUrl: true,
      aiEnabled: true,
      pipelineStage: true,
      lastMessageAt: true,
      lastMessagePreview: true,
    },
  });

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 shrink-0">
        <h2 className="text-2xl font-semibold">Funil de Atendimento</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe cada contato do primeiro contato até o agendamento fechado. Arraste os cards entre as
          colunas para mover manualmente.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <PipelineBoard
          initialChats={chats.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
