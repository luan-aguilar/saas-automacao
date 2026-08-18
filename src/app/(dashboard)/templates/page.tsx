import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_REGISTRY } from "@/lib/templates/registry";
import { TemplateAccessManager } from "@/components/templates/template-access-manager";

export default async function TemplatesPage() {
  const session = await auth();
  if (session?.user.role !== "MASTER") {
    redirect("/dashboard");
  }

  const [clients, access] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENTE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.templateAccess.findMany({ select: { userId: true, templateKey: true } }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Templates</h2>
        <p className="text-sm text-muted-foreground">
          Modelos pré-definidos de fluxo por segmento. Escolha quais clientes têm acesso a cada um — só
          quem você liberar aqui vê o botão de carregar aquele template no Construtor de Fluxos.
        </p>
      </div>

      <TemplateAccessManager
        templates={TEMPLATE_REGISTRY.map(({ key, name, description }) => ({ key, name, description }))}
        clients={clients}
        initialAccess={access}
      />
    </div>
  );
}
