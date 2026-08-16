import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/flows — lista os fluxos do usuário logado
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const flows = await prisma.flow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, isActive: true, updatedAt: true },
  });

  return NextResponse.json({ flows });
}

// POST /api/flows — cria um novo fluxo em branco
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name : "Novo fluxo";

  const flow = await prisma.flow.create({
    data: {
      userId: session.user.id,
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
