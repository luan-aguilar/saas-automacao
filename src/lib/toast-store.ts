"use client";

/**
 * Store global de toasts (sem dependência externa — mesmo espírito dos
 * outros primitivos de UI da casa, ver `src/components/ui/button.tsx` etc.,
 * hand-rolled em vez de puxar uma lib pra algo simples).
 *
 * Chame `toast({ title, variant })` de QUALQUER client component, sem
 * precisar envolver a árvore num Provider — o `<Toaster />` (montado uma vez
 * em `src/app/layout.tsx`) escuta este módulo e renderiza a fila atual.
 */

export type ToastVariant = "default" | "success" | "destructive" | "warning";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

/** Usado só pelo `<Toaster />` — inscreve pra receber a fila atual sempre que mudar. */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const DEFAULT_DURATION_MS = 5000;

/** Enfileira um toast — some sozinho depois de `durationMs` (5s por padrão), ou ao clicar no X. */
export function toast(input: { title: string; description?: string; variant?: ToastVariant; durationMs?: number }): string {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, title: input.title, description: input.description, variant: input.variant ?? "default" }];
  emit();
  setTimeout(() => dismissToast(id), input.durationMs ?? DEFAULT_DURATION_MS);
  return id;
}
