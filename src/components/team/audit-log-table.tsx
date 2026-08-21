import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { auditActionLabel } from "@/lib/audit";

type AuditEntry = {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function describeMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const contactName = typeof metadata.contactName === "string" ? metadata.contactName : null;
  if (!contactName) return null;

  if (typeof metadata.from === "string" && typeof metadata.to === "string") {
    return `${contactName}: ${metadata.from} → ${metadata.to}`;
  }
  return contactName;
}

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de ações</CardTitle>
        <CardDescription>
          Registro de tudo que a equipe (e o dono da conta) fizeram — movimentação no funil, atendimento
          assumido manualmente, contas criadas/desativadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-t border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Quem</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">Detalhe</th>
                <th className="px-4 py-3 font-medium text-right">Quando</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.actorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorRole === "FUNCIONARIO" ? "Funcionário" : entry.actorRole === "MASTER" ? "MASTER" : "Dono"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{auditActionLabel(entry.action)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{describeMetadata(entry.metadata) ?? "-"}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: ptBR })}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma ação registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
