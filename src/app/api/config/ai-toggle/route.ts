import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

const schema = z.object({ enabled: z.boolean() });

// POST /api/config/ai-toggle — liga/desliga a chave geral de IA do tenant
// (afeta TODAS as conversas, inclusive contatos novos — ver flow-engine.ts).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const tenantId = getTenantId(session.user);
  await prisma.config.upsert({
    where: { userId: tenantId },
    create: { userId: tenantId, aiGloballyEnabled: parsed.data.enabled },
    update: { aiGloballyEnabled: parsed.data.enabled },
  });

  return NextResponse.json({ ok: true, aiGloballyEnabled: parsed.data.enabled });
}
