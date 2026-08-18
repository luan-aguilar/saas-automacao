import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_REGISTRY } from "@/lib/templates/registry";

// GET /api/templates — lista o catálogo de templates, os clientes e quais
// templates já foram liberados para cada um (somente MASTER). Usado pela
// página /templates para montar a matriz de acesso.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "MASTER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const [clients, access] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENTE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.templateAccess.findMany({ select: { userId: true, templateKey: true } }),
  ]);

  return NextResponse.json({
    templates: TEMPLATE_REGISTRY.map(({ key, name, description }) => ({ key, name, description })),
    clients,
    access,
  });
}
