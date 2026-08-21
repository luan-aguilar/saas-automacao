import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword } from "@/lib/utils";

const createEmployeeSchema = z.object({
  name: z.string().min(2, "Informe o nome completo"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(8, "Informe um telefone válido"),
});

// GET /api/team — lista as contas de equipe (FUNCIONARIO) do tenant do dono logado
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENTE") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: { tenantOwnerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ employees });
}

// POST /api/team — cria uma conta de equipe (recepcionista etc) com login/senha
// temporários, vinculada ao tenant do dono logado (somente CLIENTE)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENTE") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { name, phone } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Já existe um usuário com este e-mail" }, { status: 409 });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const employee = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role: "FUNCIONARIO",
      tenantOwnerId: session.user.id,
      mustChangePassword: true,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "EMPLOYEE_CREATED", target: employee.id },
  });

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, email: employee.email },
    temporaryPassword,
  });
}
