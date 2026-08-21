import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantAuditLog } from "@/lib/audit";
import { TeamManager } from "@/components/team/team-manager";
import { AuditLogTable } from "@/components/team/audit-log-table";

export default async function TeamPage() {
  const session = await auth();
  if (session?.user.role !== "CLIENTE") {
    redirect("/dashboard");
  }

  const [employees, auditLog] = await Promise.all([
    prisma.user.findMany({
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
    }),
    getTenantAuditLog(session.user.id),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Minha Equipe</h2>
        <p className="text-sm text-muted-foreground">
          Crie contas para sua equipe (ex: recepcionista) com acesso ao Atendimento e ao Funil — sem acesso
          ao Construtor de Fluxos e sem poder excluir conversas. Toda ação da equipe fica registrada no
          histórico abaixo.
        </p>
      </div>

      <TeamManager initialEmployees={employees.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))} />

      <AuditLogTable
        entries={auditLog.map((entry) => ({
          id: entry.id,
          action: entry.action,
          actorName: entry.actorName,
          actorRole: entry.actorRole,
          metadata: entry.metadata as Record<string, unknown> | null,
          createdAt: entry.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
