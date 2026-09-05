"use client";

import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToasts, dismissToast, type Toast, type ToastVariant } from "@/lib/toast-store";

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-foreground",
  warning: "border-gold/40 bg-gold/10 text-foreground",
};

const variantIcons: Record<ToastVariant, ElementType> = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
  warning: AlertTriangle,
};

const iconClasses: Record<ToastVariant, string> = {
  default: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-gold",
};

/** Montado uma única vez em `src/app/layout.tsx` — chame `toast(...)` de `@/lib/toast-store` de qualquer lugar pra enfileirar. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end">
      {items.map((item) => {
        const Icon = variantIcons[item.variant];
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg",
              variantClasses[item.variant]
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClasses[item.variant])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
            </div>
            <button
              type="button"
              aria-label="Fechar notificação"
              onClick={() => dismissToast(item.id)}
              className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
