"use client";

/**
 * Substitui `window.confirm()` (diálogo nativo do navegador, quebra a
 * imersão do tema escuro do resto do app) por um modal no mesmo estilo —
 * mesmo princípio de `toast-store.ts`: um store global simples, chamável de
 * qualquer client component sem precisar de Provider envolvendo a árvore.
 *
 * Uso (mesmo formato de antes, só com `await` a mais):
 *   if (!(await confirm("Excluir esta conversa?"))) return;
 */

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

export type PendingConfirm = ConfirmOptions & { id: string };

type Listener = (pending: PendingConfirm | null) => void;

let current: (PendingConfirm & { resolve: (value: boolean) => void }) | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

/** Usado só pelo `<ConfirmDialog />` — inscreve pra saber quando um pedido de confirmação abre/fecha. */
export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Abre o modal de confirmação e devolve `true`/`false` conforme a escolha —
 * mesma assinatura de uso do `window.confirm()` que substitui. Só um pedido
 * por vez: se chamado de novo enquanto um já está aberto, o anterior resolve
 * como cancelado (nunca deveria acontecer na prática, é só uma salvaguarda).
 */
export function confirm(options: ConfirmOptions | string): Promise<boolean> {
  const resolved: ConfirmOptions = typeof options === "string" ? { description: options } : options;
  return new Promise((resolve) => {
    if (current) current.resolve(false);
    current = { ...resolved, id: crypto.randomUUID(), resolve };
    emit();
  });
}

/** Usado só pelo `<ConfirmDialog />` — resolve a Promise pendente com a escolha do usuário. */
export function resolveConfirm(value: boolean) {
  if (!current) return;
  current.resolve(value);
  current = null;
  emit();
}
