"use client";

import { Zap, Sparkles, MessageSquare, GitFork, BellRing } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const paletteItems: {
  type: "trigger" | "aiResponse" | "staticMessage" | "condition" | "alertNotification";
  label: string;
  description: string;
  icon: LucideIcon;
  colorClass: string;
}[] = [
  {
    type: "trigger",
    label: "Entrada (Trigger)",
    description: "Primeira mensagem ou palavra-chave",
    icon: Zap,
    colorClass: "bg-emerald-600",
  },
  {
    type: "aiResponse",
    label: "Resposta IA",
    description: "Usa o System Prompt + OpenAI",
    icon: Sparkles,
    colorClass: "bg-violet-600",
  },
  {
    type: "staticMessage",
    label: "Mensagem Estática",
    description: "Texto pronto com botões/opções",
    icon: MessageSquare,
    colorClass: "bg-sky-600",
  },
  {
    type: "condition",
    label: "Condição / Decisão",
    description: "Direciona o fluxo pela resposta",
    icon: GitFork,
    colorClass: "bg-amber-600",
  },
  {
    type: "alertNotification",
    label: "Notificação / Alerta",
    description: "Avisa um atendente via WhatsApp com os dados do lead",
    icon: BellRing,
    colorClass: "bg-rose-600",
  },
];

export function NodePanel() {
  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="w-64 shrink-0 space-y-2 overflow-y-auto border-r border-border bg-card p-3">
      <p className="px-1 text-xs font-semibold uppercase text-muted-foreground">Blocos disponíveis</p>
      {paletteItems.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          className="flex cursor-grab items-start gap-2 rounded-md border border-border p-2.5 transition-colors hover:bg-accent active:cursor-grabbing"
        >
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${item.colorClass}`}>
            <item.icon className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-medium leading-tight">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        </div>
      ))}
      <p className="px-1 pt-2 text-xs text-muted-foreground">
        Arraste um bloco para o canvas para adicioná-lo ao fluxo.
      </p>
    </aside>
  );
}
