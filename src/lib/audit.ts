import { prisma } from "@/lib/prisma";
import type { Prisma, Role } from "@prisma/client";

/**
 * Registra uma ação no AuditLog, tirando um "retrato" do autor (nome/papel)
 * no momento — o histórico precisa continuar legível mesmo que essa conta
 * seja excluída depois (ex: dono excluindo um funcionário desligado, que é
 * justamente o cenário em que esse histórico mais importa). `tenantOwnerId`
 * só é preenchido quando o autor é um FUNCIONARIO, e é o que permite listar
 * "só o que a equipe fez" sem depender de um JOIN vivo com `User`.
 */
export async function writeAuditLog(params: {
  actor: { id: string; name?: string | null; role: Role; tenantOwnerId?: string | null };
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}) {
  const { actor, action, target, metadata } = params;
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      actorName: actor.name ?? "Desconhecido",
      actorRole: actor.role,
      tenantOwnerId: actor.role === "FUNCIONARIO" ? actor.tenantOwnerId ?? null : null,
      action,
      target,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Histórico de ações da EQUIPE (contas FUNCIONARIO) de um tenant — não
 * inclui ações do próprio dono nem do MASTER, de propósito: o ponto desta
 * tela é o dono conseguir auditar a equipe dele, não se auto-vigiar. Usado
 * tanto em "Minha Equipe" (dono vendo o próprio tenant) quanto no detalhe de
 * um cliente visto pelo MASTER.
 */
export async function getTenantAuditLog(tenantOwnerId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { tenantOwnerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Rótulos amigáveis (pt-BR) para o campo `AuditLog.action`. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: "Conta de cliente criada",
  CLIENT_ACTIVATED: "Conta de cliente ativada",
  CLIENT_DEACTIVATED: "Conta de cliente desativada",
  PASSWORD_RESET: "Senha redefinida",
  EMPLOYEE_CREATED: "Funcionário adicionado",
  EMPLOYEE_UPDATED: "Dados do funcionário editados",
  EMPLOYEE_ACTIVATED: "Funcionário ativado",
  EMPLOYEE_DEACTIVATED: "Funcionário desativado",
  EMPLOYEE_DELETED: "Funcionário excluído",
  EMPLOYEE_PASSWORD_RESET: "Senha do funcionário redefinida",
  PIPELINE_STAGE_CHANGED: "Etapa do funil alterada",
  CHAT_AI_REACTIVATED: "IA reativada numa conversa",
  CHAT_AI_TAKEOVER: "Atendimento assumido manualmente (IA desativada)",
  CHAT_CLEARED: "Histórico de uma conversa limpo",
  CHAT_DELETED: "Conversa excluída",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
