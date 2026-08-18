import { prisma } from "@/lib/prisma";
import { TEMPLATE_REGISTRY, type TemplateDefinition } from "./registry";
import type { Role } from "@prisma/client";

/**
 * Templates que um usuário pode carregar no Construtor de Fluxos.
 * MASTER sempre vê todos (é quem cria/distribui os templates, não faz
 * sentido ele mesmo depender de uma liberação); um CLIENTE só vê os que o
 * MASTER liberou explicitamente para ele via `TemplateAccess` — ver página
 * `/templates`.
 */
export async function getAvailableTemplates(
  userId: string,
  role: Role
): Promise<Pick<TemplateDefinition, "key" | "name" | "description">[]> {
  if (role === "MASTER") {
    return TEMPLATE_REGISTRY.map(({ key, name, description }) => ({ key, name, description }));
  }

  const grants = await prisma.templateAccess.findMany({
    where: { userId },
    select: { templateKey: true },
  });
  const grantedKeys = new Set(grants.map((g) => g.templateKey));

  return TEMPLATE_REGISTRY.filter((t) => grantedKeys.has(t.key)).map(({ key, name, description }) => ({
    key,
    name,
    description,
  }));
}
