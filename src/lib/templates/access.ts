import { prisma } from "@/lib/prisma";
import { TEMPLATE_REGISTRY, type TemplateDefinition } from "./registry";
import type { Role } from "@prisma/client";

/**
 * Templates que um usuário pode usar — tanto pra carregar no Construtor de
 * Fluxos quanto pro Kanban de `/pipeline` (ver `pipelineColumns`).
 * MASTER sempre vê todos (é quem cria/distribui os templates, não faz
 * sentido ele mesmo depender de uma liberação); um CLIENTE só vê os que o
 * MASTER liberou explicitamente para ele via `TemplateAccess` — ver página
 * `/templates`. Retorna a definição completa (não só key/name/description)
 * pra quem precisar inspecionar `pipelineColumns`/`load` — quem só precisa
 * dos metadados pode simplesmente pegar os campos que quiser do resultado.
 */
export async function getAvailableTemplates(userId: string, role: Role): Promise<TemplateDefinition[]> {
  if (role === "MASTER") {
    return TEMPLATE_REGISTRY;
  }

  const grants = await prisma.templateAccess.findMany({
    where: { userId },
    select: { templateKey: true },
  });
  const grantedKeys = new Set(grants.map((g) => g.templateKey));

  return TEMPLATE_REGISTRY.filter((t) => grantedKeys.has(t.key));
}
