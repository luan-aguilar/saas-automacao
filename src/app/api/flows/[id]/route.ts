import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

const updateSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
});

const toggleActiveSchema = z.object({ isActive: z.boolean() });

async function assertOwnership(flowId: string, userId: string) {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow || flow.userId !== userId) return null;
  return flow;
}

// GET /api/flows/:id
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const flow = await assertOwnership(params.id, getTenantId(session.user));
  if (!flow) {
    return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ flow });
}

// PUT /api/flows/:id — salva nodes/edges do construtor visual
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const existing = await assertOwnership(params.id, getTenantId(session.user));
  if (!existing) {
    return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const flow = await prisma.flow.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      isActive: parsed.data.isActive,
      nodes: parsed.data.nodes,
      edges: parsed.data.edges,
      version: { increment: 1 },
    },
  });

  return NextResponse.json({ flow });
}

/**
 * PATCH /api/flows/:id — liga/desliga o fluxo (Ativo/Inativo) na hora, sem
 * depender de "Salvar fluxo" nem reenviar nodes/edges. Existe porque o botão
 * antigo só mudava o estado LOCAL do Construtor — o usuário não tinha como
 * saber se precisava clicar em "Salvar fluxo" depois. Ver `flow-builder.tsx`
 * (agora um Switch, efeito imediato, mesmo padrão do toggle de IA no Chat).
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const existing = await assertOwnership(params.id, getTenantId(session.user));
  if (!existing) {
    return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = toggleActiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const flow = await prisma.flow.update({
    where: { id: params.id },
    data: { isActive: parsed.data.isActive },
  });

  return NextResponse.json({ flow });
}

// DELETE /api/flows/:id
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const existing = await assertOwnership(params.id, getTenantId(session.user));
  if (!existing) {
    return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  }

  await prisma.flow.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
