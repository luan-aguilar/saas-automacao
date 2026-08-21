import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Botões "em alto relevo": gradiente sutil (topo mais claro) + contorno na
// cor da própria variante + brilho por trás no hover, pra dar profundidade
// 3D sem precisar de nenhuma imagem/asset — só CSS.
const variantClasses: Record<Variant, string> = {
  default:
    "bg-gradient-to-b from-primary to-primary/80 text-primary-foreground border border-primary/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_2px_10px_-2px_hsl(var(--primary)/0.55)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_4px_18px_-2px_hsl(var(--primary)/0.75)] hover:brightness-110 active:translate-y-px active:brightness-95",
  outline:
    "border border-gold/40 bg-transparent text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:border-gold/70 hover:bg-gold/10 hover:shadow-[0_0_14px_-3px_hsl(var(--gold)/0.5)]",
  ghost: "bg-transparent hover:bg-accent",
  destructive:
    "bg-gradient-to-b from-destructive to-destructive/80 text-destructive-foreground border border-destructive/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_10px_-2px_hsl(var(--destructive)/0.5)] hover:brightness-110 active:translate-y-px",
  secondary:
    "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
