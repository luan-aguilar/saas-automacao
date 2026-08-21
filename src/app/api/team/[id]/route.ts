import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.union([
  z.object({ action: z.enum(["ACTIVATE", "DEACTIVATE", "RESET_PASSWORD"]) }),
  z.object({
    action: z.literal("UPDATE"),
    name: z.string().min(2, "Informe o nome completo"),
    email: z.string().email("E-mail inválido"),
    phone: z.string().min(8, "Informe um telefone válido"),
  }),
]);

async function findOwnedEmployee(id: string, ownerId: string) {
  const employee = await prisma.user.findUnique({ where: { id } });
  if (!employee || employee.role !== "FUNCIONARIO" || employee.tenantOwnerId !== ownerId) return null;
  return employee;
}

// PATCH /api/team/:id — ativa/desativa, reseta a senha temporária ou edita
// nome/e-mail/telefone de uma conta de equipe (somente o dono do tenant,
// CLIENTE, e só sobre funcionários que ele mesmo criou)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENTE") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ação inválida" }, { status: 400 });
  }

  const employee = await findOwnedEmployee(params.id, session.user.id);
  if (!employee) {
    return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });
  }

  if (parsed.data.action === "ACTIVATE" || parsed.data.action === "DEACTIVATE") {
    const status = parsed.data.action === "ACTIVATE" ? "ACTIVE" : "INACTIVE";
    await prisma.user.update({ where: { id: employee.id }, data: { status } });
    await writeAuditLog({
      actor: session.user,
      action: `EMPLOYEE_${parsed.data.action}D`,
      target: employee.id,
      metadata: { employeeName: employee.name },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "UPDATE") {
    const email = parsed.data.email.toLowerCase().trim();
    if (email !== employee.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "Já existe um usuário com este e-mail" }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id: employee.id },
      data: { name: parsed.data.name, email, phone: parsed.data.phone },
    });
    await writeAuditLog({
      actor: session.user,
      action: "EMPLOYEE_UPDATED",
      target: employee.id,
      metadata: { employeeName: parsed.data.name },
    });
    return NextResponse.json({ ok: true });
  }

  // RESET_PASSWORD
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await prisma.user.update({
    where: { id: employee.id },
    data: { passwordHash, mustChangePassword: true },
  });
  await writeAuditLog({
    actor: session.user,
    action: "EMPLOYEE_PASSWORD_RESET",
    target: employee.id,
    metadata: { employeeName: employee.name },
  });

  return NextResponse.json({ ok: true, temporaryPassword });
}

// DELETE /api/team/:id — exclui definitivamente uma conta de equipe (somente
// o dono do tenant, sobre funcionários que ele mesmo criou). O histórico de
// ações desse funcionário em `AuditLog` NÃO é apagado junto — ele guarda um
// retrato do nome/papel do autor (ver `writeAuditLog`), então continua
// consultável mesmo depois da conta não existir mais. É justamente quando o
// dono desliga alguém por suspeita de mau uso que esse histórico mais importa.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENTE") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const employee = await findOwnedEmployee(params.id, session.user.id);
  if (!employee) {
    return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });
  }

  await writeAuditLog({
    actor: session.user,
    action: "EMPLOYEE_DELETED",
    target: employee.id,
    metadata: { employeeName: employee.name, employeeEmail: employee.email },
  });

  await prisma.user.delete({ where: { id: employee.id } });

  return NextResponse.json({ ok: true });
}
