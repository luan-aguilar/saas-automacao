import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

// GET /api/flows — lista os fluxos do tenant do usuário logado. Um
// FUNCIONARIO não edita fluxos (ver middleware/authConfig), mas a checagem
// aqui também fica em profundidade, caso a rota seja chamada direto.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const flows = await prisma.flow.findMany({
    where: { userId: getTenantId(session.user) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, isActive: true, updatedAt: true },
  });

  return NextResponse.json({ flows });
}

// POST /api/flows — cria um novo fluxo em branco
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role === "FUNCIONARIO") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name : "Novo fluxo";

  const flow = await prisma.flow.create({
    data: {
      userId: getTenantId(session.user),
      name,
      nodes: [
        {
          id: "start",
          type: "trigger",
          position: { x: 80, y: 80 },
          data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
        },
      ],
      edges: [],
    },
  });

  return NextResponse.json({ flow });
}
