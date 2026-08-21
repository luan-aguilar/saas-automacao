"use client";

import { Zap, Sparkles, MessageSquare, GitFork, BellRing, Webhook, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const paletteItems: {
  type: "trigger" | "aiResponse" | "staticMessage" | "condition" | "alertNotification" | "webhook";
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
  {
    type: "webhook",
    label: "Webhook / Automação Externa",
    description: "Envia os dados coletados pra outra ferramenta (ex: n8n, Zapier)",
    icon: Webhook,
    colorClass: "bg-teal-600",
  },
];

/**
 * `open`/`onClose` só importam no mobile — lá o painel vira um overlay em
 * tela cheia (aberto por um botão na barra de ferramentas), em vez de uma
 * coluna sempre visível como no desktop, porque não cabem as 3 colunas
 * (blocos + canvas + config) numa tela pequena.
 */
export function NodePanel({
  onAddNode,
  open,
  onClose,
}: {
  onAddNode: (nodeType: string) => void;
  open?: boolean;
  onClose?: () => void;
}) {
  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  function handlePick(nodeType: string) {
    onAddNode(nodeType);
    onClose?.();
  }

  return (
    <aside
      className={cn(
        "w-64 shrink-0 space-y-2 overflow-y-auto border-r border-border bg-card p-3",
        "fixed inset-0 z-40 md:static md:z-auto",
        open ? "block" : "hidden md:block"
      )}
    >
      <div className="mb-1 flex items-center justify-between md:hidden">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Blocos disponíveis</p>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="hidden px-1 text-xs font-semibold uppercase text-muted-foreground md:block">Blocos disponíveis</p>
      {paletteItems.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          onClick={() => handlePick(item.type)}
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
        Toque num bloco para adicioná-lo ao fluxo (ou arraste, no computador).
      </p>
    </aside>
  );
}
