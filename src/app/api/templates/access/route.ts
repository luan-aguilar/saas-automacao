import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTemplateDefinition } from "@/lib/templates/registry";

const accessSchema = z.object({
  userId: z.string().min(1),
  templateKey: z.string().min(1),
  grant: z.boolean(),
});

// POST /api/templates/access — libera ou revoga o acesso de um cliente a um
// template pré-definido (somente MASTER). O MASTER em si nunca precisa de
// uma linha aqui — ver checagem de acesso em `src/lib/templates/access.ts`.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MASTER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = accessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const { userId, templateKey, grant } = parsed.data;

  if (!getTemplateDefinition(templateKey)) {
    return NextResponse.json({ error: "Template desconhecido" }, { status: 400 });
  }

  const client = await prisma.user.findUnique({ where: { id: userId } });
  if (!client || client.role !== "CLIENTE") {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  if (grant) {
    await prisma.templateAccess.upsert({
      where: { userId_templateKey: { userId, templateKey } },
      create: { userId, templateKey, grantedById: session.user.id },
      update: {},
    });
  } else {
    await prisma.templateAccess.deleteMany({ where: { userId, templateKey } });
  }

  return NextResponse.json({ ok: true });
}
