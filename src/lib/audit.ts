import { prisma } from "@/lib/prisma";

/**
 * Histórico de ações de um tenant: tanto as do próprio dono quanto as de
 * qualquer conta de equipe (FUNCIONARIO) dele — usado tanto na tela "Minha
 * Equipe" (dono vendo o próprio tenant) quanto no detalhe de um cliente
 * visto pelo MASTER. Ações do MASTER sobre o cadastro do cliente (ex:
 * CLIENT_CREATED) ficam de fora de propósito: o ator ali é o MASTER, não o
 * dono do tenant nem um funcionário dele.
 */
export async function getTenantAuditLog(tenantOwnerId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { OR: [{ userId: tenantOwnerId }, { user: { tenantOwnerId } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, role: true } } },
  });
}

/** Rótulos amigáveis (pt-BR) para o campo `AuditLog.action`. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: "Conta de cliente criada",
  CLIENT_ACTIVATED: "Conta de cliente ativada",
  CLIENT_DEACTIVATED: "Conta de cliente desativada",
  PASSWORD_RESET: "Senha redefinida",
  EMPLOYEE_CREATED: "Funcionário adicionado",
  EMPLOYEE_ACTIVATED: "Funcionário ativado",
  EMPLOYEE_DEACTIVATED: "Funcionário desativado",
  EMPLOYEE_PASSWORD_RESET: "Senha do funcionário redefinida",
  PIPELINE_STAGE_CHANGED: "Etapa do funil alterada",
  CHAT_AI_REACTIVATED: "IA reativada numa conversa",
  CHAT_AI_TAKEOVER: "Atendimento assumido manualmente (IA desativada)",
  CHAT_DELETED: "Conversa excluída",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
