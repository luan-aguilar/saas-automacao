"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { LayoutDashboard, Workflow, Settings, QrCode, MessageSquareText, Users, UserCircle, Sparkles, Kanban, UsersRound } from "lucide-react";
import type { Role } from "@prisma/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  masterOnly?: boolean;
  /** Só aparece se o tenant tiver acesso a um template com essa funcionalidade — ver `hasPipeline`. */
  requiresPipeline?: boolean;
  /** Um FUNCIONARIO (conta de equipe) não vê este item — ver `Role`. */
  hiddenForFuncionario?: boolean;
  /** Só aparece para o dono do tenant (CLIENTE) — gestão da própria equipe. */
  ownerOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/flows", label: "Construtor de Fluxos", icon: Workflow, hiddenForFuncionario: true },
  { href: "/chat", label: "Atendimento", icon: MessageSquareText },
  { href: "/pipeline", label: "Funil de Atendimento", icon: Kanban, requiresPipeline: true },
  { href: "/whatsapp", label: "Conexão WhatsApp", icon: QrCode },
  { href: "/settings", label: "Configurações", icon: Settings },
  { href: "/team", label: "Minha Equipe", icon: UsersRound, ownerOnly: true },
  { href: "/clients", label: "Clientes", icon: Users, masterOnly: true },
  { href: "/templates", label: "Templates", icon: Sparkles, masterOnly: true },
  { href: "/profile", label: "Meu Perfil", icon: UserCircle },
];

/** Usado tanto pela sidebar fixa (desktop) quanto pelo menu deslizante (mobile) — ver `MobileNav`. */
export function visibleNavItems(role: Role, hasPipeline: boolean): NavItem[] {
  return navItems
    .filter((item) => !item.masterOnly || role === "MASTER")
    .filter((item) => !item.hiddenForFuncionario || role !== "FUNCIONARIO")
    .filter((item) => !item.ownerOnly || role === "CLIENTE")
    .filter((item) => !item.requiresPipeline || hasPipeline);
}

export function NavLinks({
  role,
  hasPipeline,
  onNavigate,
}: {
  role: Role;
  hasPipeline: boolean;
  /** Chamado ao clicar num item — usado pelo menu mobile pra fechar o drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {visibleNavItems(role, hasPipeline).map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RoleFooterBadge({ role }: { role: Role }) {
  if (role !== "MASTER" && role !== "FUNCIONARIO") return null;

  return (
    <div className="border-t border-border p-3">
      <span className="block rounded-md bg-accent px-3 py-2 text-xs font-medium text-muted-foreground">
        {role === "MASTER" ? "Modo Administrador (MASTER)" : "Modo Funcionário"}
      </span>
    </div>
  );
}

export function Sidebar({ role, hasPipeline }: { role: Role; hasPipeline: boolean }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Image src="/logo-digital-analytics.png" alt={APP_NAME} width={28} height={28} className="shrink-0" />
        <span className="font-semibold">{APP_NAME}</span>
      </div>

      <NavLinks role={role} hasPipeline={hasPipeline} />
      <RoleFooterBadge role={role} />
    </aside>
  );
}
