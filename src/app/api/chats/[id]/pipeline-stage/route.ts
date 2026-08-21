import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

const schema = z.object({
  stage: z.enum(["PRIMEIRO_ATENDIMENTO", "CLIENTE_RECORRENTE", "AGUARDANDO_HUMANO", "AGENDAMENTO_CONCLUIDO"]),
});

// PATCH /api/chats/:id/pipeline-stage — move manualmente o card de um
// contato entre as colunas do Kanban em /pipeline (ex: arrastar de
// "Aguardando Humano" para "Agendamento Concluído" quando o operador fecha o
// atendimento). As transições automáticas (handoff da IA, cliente
// recorrente) acontecem no motor de fluxo — ver `flow-engine.ts`.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  const chat = await prisma.chat.findUnique({ where: { id: params.id } });
  if (!chat || chat.userId !== tenantId) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Estágio inválido" }, { status: 400 });
  }

  const updated = await prisma.chat.update({
    where: { id: params.id },
    data: { pipelineStage: parsed.data.stage },
  });

  // Só registramos quando é um FUNCIONARIO movendo o card — é essa a
  // movimentação que o dono do tenant quer poder auditar (quem moveu qual
  // lead pra qual etapa).
  if (session.user.role === "FUNCIONARIO" && chat.pipelineStage !== parsed.data.stage) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "PIPELINE_STAGE_CHANGED",
        target: params.id,
        metadata: {
          contactName: chat.contactName,
          contactPhone: chat.contactPhone,
          from: chat.pipelineStage,
          to: parsed.data.stage,
        },
      },
    });
  }

  return NextResponse.json({ chat: updated });
}
