import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantAuditLog } from "@/lib/audit";
import { AuditLogTable } from "@/components/team/audit-log-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatPhone } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

// Detalhe de um cliente visto pelo MASTER: equipe (contas FUNCIONARIO que o
// próprio cliente criou) e o histórico de ações do tenant inteiro — dá pro
// MASTER auditar se surgir um conflito entre o dono e a equipe dele (ex: a
// preocupação do Igor sobre a recepcionista desviar leads).
export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user.role !== "MASTER") {
    redirect("/dashboard");
  }

  const client = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, role: true },
  });
  if (!client || client.role !== "CLIENTE") {
    notFound();
  }

  const [employees, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { tenantOwnerId: client.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
    }),
    getTenantAuditLog(client.id),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link href="/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Clientes
        </Link>
        <h2 className="text-2xl font-semibold">{client.name}</h2>
        <p className="text-sm text-muted-foreground">{client.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipe deste cliente</CardTitle>
          <CardDescription>Contas de equipe (ex: recepcionista) que {client.name} criou para o próprio tenant</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Membro</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={employee.name} />
                        <div>
                          <p className="font-medium">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">{employee.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{employee.phone ? formatPhone(employee.phone) : "-"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={employee.status === "ACTIVE" ? "success" : "destructive"}>
                        {employee.status === "ACTIVE" ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      Este cliente ainda não criou nenhuma conta de equipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
