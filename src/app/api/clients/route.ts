import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword } from "@/lib/utils";

const createClientSchema = z.object({
  name: z.string().min(2, "Informe o nome completo"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(8, "Informe um telefone válido"),
});

// GET /api/clients — lista todos os clientes (somente MASTER)
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "MASTER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENTE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      whatsappConnection: { select: { status: true, phoneNumber: true } },
    },
  });

  return NextResponse.json({ clients });
}

// POST /api/clients — cria um novo cliente com login/senha temporários (somente MASTER)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MASTER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { name, email, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Já existe um usuário com este e-mail" }, { status: 409 });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const client = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role: "CLIENTE",
      mustChangePassword: true,
      createdById: session.user.id,
      config: { create: {} },
      whatsappConnection: { create: {} },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CLIENT_CREATED",
      target: client.id,
    },
  });

  // Retorna a senha temporária UMA única vez, para que o MASTER a envie por WhatsApp/e-mail.
  // Ela não é armazenada em texto puro — apenas o hash fica no banco.
  return NextResponse.json({
    client: { id: client.id, name: client.name, email: client.email },
    temporaryPassword,
  });
}
