import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAvailableTemplates } from "@/lib/templates/access";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { name, email, role } = session.user;

  // O item "Funil de Atendimento" só aparece pra quem tem acesso a algum
  // template com funil configurado (ver `TemplateDefinition.pipelineColumns`)
  // — sem isso, todo tenant via o mesmo Kanban genérico do Salão de Beleza,
  // mesmo clientes de outros segmentos sem esse funil fazer sentido pra eles.
  const templates = await getAvailableTemplates(session.user.id, role);
  const hasPipeline = templates.some((t) => t.pipelineColumns && t.pipelineColumns.length > 0);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar role={role} hasPipeline={hasPipeline} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="" name={name ?? ""} email={email ?? ""} role={role} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
