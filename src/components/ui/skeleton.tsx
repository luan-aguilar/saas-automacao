import { cn } from "@/lib/utils";

/** Placeholder de carregamento genérico — "pisca" suavemente enquanto o conteúdo real não chega. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
