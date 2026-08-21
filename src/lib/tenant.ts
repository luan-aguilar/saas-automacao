import type { Role } from "@prisma/client";

export interface TenantActor {
  id: string;
  role: Role;
  tenantOwnerId?: string | null;
}

/**
 * Id do tenant a usar para escopar dados (chats, fluxos, config, conexão
 * WhatsApp): o próprio dono (MASTER/CLIENTE) usa o seu id; um FUNCIONARIO
 * (conta de equipe) usa o id do dono do tenant que o criou.
 */
export function getTenantId(actor: TenantActor): string {
  return actor.tenantOwnerId ?? actor.id;
}
