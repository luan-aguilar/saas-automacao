import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function NodeShell({
  icon: Icon,
  title,
  subtitle,
  colorClass,
  selected,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  colorClass: string;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-60 rounded-lg border-2 bg-card shadow-sm transition-shadow",
        selected ? "border-primary shadow-md" : "border-border"
      )}
    >
      <div className={cn("flex items-center gap-2 rounded-t-md px-3 py-2 text-white", colorClass)}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
        {subtitle && <p className="line-clamp-2">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
