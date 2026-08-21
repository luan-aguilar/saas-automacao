import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { getAvailableTemplates } from "@/lib/templates/access";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { Kanban } from "lucide-react";

export default async function PipelinePage() {
  const session = await auth();
  const tenantId = getTenantId(session!.user);

  const templates = await getAvailableTemplates(tenantId, session!.user.role);
  const pipelineTemplates = templates
    .filter((t) => t.pipelineColumns && t.pipelineColumns.length > 0)
    .map((t) => ({ key: t.key, name: t.name, columns: t.pipelineColumns! }));

  // Sem nenhum template com funil liberado — nada a mostrar. Acontece pra
  // quem ainda não tem um template atribuído (ex: uma conta recém-criada
  // antes do MASTER liberar algo em /templates) ou cujo template liberado
  // ainda não tem um funil definido.
  if (pipelineTemplates.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <Kanban className="h-10 w-10" />
        <p className="text-sm font-medium text-foreground">Nenhum funil de atendimento disponível ainda</p>
        <p className="max-w-sm text-sm">
          O funil de atendimento vem junto com um template do Construtor de Fluxos. Peça para o MASTER liberar
          um template para sua conta na aba &ldquo;Templates&rdquo;.
        </p>
      </div>
    );
  }

  const chats = await prisma.chat.findMany({
    where: { userId: tenantId },
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
          templates={pipelineTemplates}
        />
      </div>
    </div>
  );
}
