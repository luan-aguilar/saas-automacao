import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword } from "@/lib/utils";

const updateSchema = z.object({
  action: z.enum(["ACTIVATE", "DEACTIVATE", "RESET_PASSWORD"]),
});

// PATCH /api/team/:id — ativa/desativa uma conta de equipe ou reseta a senha
// temporária dela (somente o dono do tenant, CLIENTE, e só sobre funcionários
// que ele mesmo criou)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENTE") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const employee = await prisma.user.findUnique({ where: { id: params.id } });
  if (!employee || employee.role !== "FUNCIONARIO" || employee.tenantOwnerId !== session.user.id) {
    return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });
  }

  if (parsed.data.action === "ACTIVATE" || parsed.data.action === "DEACTIVATE") {
    const status = parsed.data.action === "ACTIVATE" ? "ACTIVE" : "INACTIVE";
    await prisma.user.update({ where: { id: employee.id }, data: { status } });
    await prisma.auditLog.create({
      data: { userId: session.user.id, action: `EMPLOYEE_${parsed.data.action}D`, target: employee.id },
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
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "EMPLOYEE_PASSWORD_RESET", target: employee.id },
  });

  return NextResponse.json({ ok: true, temporaryPassword });
}
