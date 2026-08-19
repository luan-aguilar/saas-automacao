"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { LayoutDashboard, Workflow, Settings, QrCode, MessageSquareText, Users, UserCircle, Sparkles, Kanban } from "lucide-react";
import type { Role } from "@prisma/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  masterOnly?: boolean;
  /** Só aparece se o tenant tiver acesso a um template com essa funcionalidade — ver `hasPipeline`. */
  requiresPipeline?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/flows", label: "Construtor de Fluxos", icon: Workflow },
  { href: "/chat", label: "Atendimento", icon: MessageSquareText },
  { href: "/pipeline", label: "Funil de Atendimento", icon: Kanban, requiresPipeline: true },
  { href: "/whatsapp", label: "Conexão WhatsApp", icon: QrCode },
  { href: "/settings", label: "Configurações", icon: Settings },
  { href: "/clients", label: "Clientes", icon: Users, masterOnly: true },
  { href: "/templates", label: "Templates", icon: Sparkles, masterOnly: true },
  { href: "/profile", label: "Meu Perfil", icon: UserCircle },
];

export function Sidebar({ role, hasPipeline }: { role: Role; hasPipeline: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Image src="/logo-digital-analytics.png" alt={APP_NAME} width={28} height={28} className="shrink-0" />
        <span className="font-semibold">{APP_NAME}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems
          .filter((item) => !item.masterOnly || role === "MASTER")
          .filter((item) => !item.requiresPipeline || hasPipeline)
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
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

      {role === "MASTER" && (
        <div className="border-t border-border p-3">
          <span className="block rounded-md bg-accent px-3 py-2 text-xs font-medium text-muted-foreground">
            Modo Administrador (MASTER)
          </span>
        </div>
      )}
    </aside>
  );
}
