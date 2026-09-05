"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { subscribeConfirm, resolveConfirm, type PendingConfirm } from "@/lib/confirm-store";

/** Montado uma única vez em `src/app/layout.tsx` — chame `confirm(...)` de `@/lib/confirm-store` de qualquer lugar. */
export function ConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => subscribeConfirm(setPending), []);

  useEffect(() => {
    if (!pending) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") resolveConfirm(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending]);

  if (!pending) return null;

  const isDestructive = pending.variant === "destructive";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => resolveConfirm(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-description"
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isDestructive ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {pending.title && <p className="font-semibold">{pending.title}</p>}
            <p id="confirm-dialog-description" className="mt-1 text-sm text-muted-foreground">
              {pending.description}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => resolveConfirm(false)}>
            {pending.cancelLabel ?? "Cancelar"}
          </Button>
          <Button variant={isDestructive ? "destructive" : "default"} size="sm" onClick={() => resolveConfirm(true)}>
            {pending.confirmLabel ?? "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
