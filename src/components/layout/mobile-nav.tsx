"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { NavLinks, RoleFooterBadge } from "./sidebar";
import type { Role } from "@prisma/client";

/**
 * Menu deslizante usado só em telas pequenas (a sidebar fixa já cobre
 * md+ — ver `Sidebar`). Fecha sozinho ao trocar de rota, pra não ficar
 * aberto por cima da página seguinte depois de tocar num link.
 */
export function MobileNav({ role, hasPipeline }: { role: Role; hasPipeline: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        title="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/70" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
              <div className="flex items-center gap-2">
                <Image src="/logo-digital-analytics.png" alt={APP_NAME} width={28} height={28} className="shrink-0" />
                <span className="font-semibold">{APP_NAME}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavLinks role={role} hasPipeline={hasPipeline} onNavigate={() => setOpen(false)} />
            <RoleFooterBadge role={role} />
          </div>
        </div>
      )}
    </>
  );
}
