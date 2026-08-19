import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FlowBuilder } from "@/components/flows/flow-builder";
import { getAvailableTemplates } from "@/lib/templates/access";
import type { Node, Edge } from "@xyflow/react";

// Garante que sempre exista pelo menos um fluxo para o usuário editar,
// criando um fluxo padrão (com o bloco de Entrada) no primeiro acesso.
async function getOrCreateDefaultFlow(userId: string) {
  const existing = await prisma.flow.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.flow.create({
    data: {
      userId,
      name: "Fluxo principal",
      nodes: [
        {
          id: "start",
          type: "trigger",
          position: { x: 80, y: 80 },
          data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
        },
        {
          id: "welcome",
          type: "aiResponse",
          position: { x: 80, y: 260 },
          data: { label: "Resposta IA", useGlobalPrompt: true },
        },
      ],
      edges: [{ id: "e-start-welcome", source: "start", target: "welcome" }],
    },
  });
}

export default async function FlowsPage() {
  const session = await auth();
  const [flow, availableTemplates] = await Promise.all([
    getOrCreateDefaultFlow(session!.user.id),
    getAvailableTemplates(session!.user.id, session!.user.role),
  ]);

  return (
    <div className="h-full">
      <FlowBuilder
        flowId={flow.id}
        flowName={flow.name}
        initialNodes={(flow.nodes as unknown as Node[]) ?? []}
        initialEdges={(flow.edges as unknown as Edge[]) ?? []}
        isActive={flow.isActive}
        // Só key/name/description cruzam pra um Client Component — `load` é
        // função (não serializável via RSC) e é resolvida no próprio
        // FlowBuilder através do registry (`getTemplateDefinition`).
        availableTemplates={availableTemplates.map(({ key, name, description }) => ({ key, name, description }))}
      />
    </div>
  );
}
