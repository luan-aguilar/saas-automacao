"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatPhone, cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PipelineStage = "PRIMEIRO_ATENDIMENTO" | "CLIENTE_RECORRENTE" | "AGUARDANDO_HUMANO" | "AGENDAMENTO_CONCLUIDO";

export type PipelineChat = {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatarUrl: string | null;
  aiEnabled: boolean;
  pipelineStage: PipelineStage;
  lastMessageAt: string;
  lastMessagePreview: string | null;
};

const COLUMNS: { key: PipelineStage; label: string; description: string }[] = [
  { key: "PRIMEIRO_ATENDIMENTO", label: "Primeiro Atendimento", description: "IA conduzindo o atendimento inicial" },
  { key: "CLIENTE_RECORRENTE", label: "Cliente Recorrente", description: "Já é cliente, voltou pra um novo atendimento" },
  { key: "AGUARDANDO_HUMANO", label: "Aguardando Humano", description: "IA encaminhou, esperando um atendente" },
  { key: "AGENDAMENTO_CONCLUIDO", label: "Agendamento Concluído", description: "Atendimento fechado" },
];

export function PipelineBoard({ initialChats }: { initialChats: PipelineChat[] }) {
  const [chats, setChats] = useState(initialChats);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PipelineStage | null>(null);
  const router = useRouter();

  async function moveChat(chatId: string, stage: PipelineStage) {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat || chat.pipelineStage === stage) return;

    const previousStage = chat.pipelineStage;
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pipelineStage: stage } : c)));

    const res = await fetch(`/api/chats/${chatId}/pipeline-stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });

    if (!res.ok) {
      // Reverte em caso de falha — mantém o quadro honesto com o que de fato está salvo.
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pipelineStage: previousStage } : c)));
    }
  }

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((column) => {
        const columnChats = chats.filter((c) => c.pipelineStage === column.key);
        const isDragOver = dragOverColumn === column.key;

        return (
          <div
            key={column.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(column.key);
            }}
            onDragLeave={() => setDragOverColumn((c) => (c === column.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverColumn(null);
              if (draggingId) moveChat(draggingId, column.key);
              // Não depende só do `onDragEnd` do card pra limpar isso: como o
              // card muda de coluna (o `chats` state muda assim que
              // `moveChat` roda), o elemento original arrastado pode ser
              // desmontado/realocado no DOM antes do evento nativo `dragend`
              // disparar nele — deixando `draggingId` preso pra sempre (o
              // card ficava com opacidade baixa/letras apagadas até recarregar
              // a página). Limpar aqui garante que sempre é resetado.
              setDraggingId(null);
            }}
            className={cn(
              "flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30 transition-colors",
              isDragOver && "border-primary bg-primary/5"
            )}
          >
            <div className="shrink-0 border-b border-border px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{column.label}</p>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {columnChats.length}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{column.description}</p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {columnChats.map((chat) => (
                <div
                  key={chat.id}
                  draggable
                  onDragStart={() => setDraggingId(chat.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => router.push(`/chat?id=${chat.id}`)}
                  className={cn(
                    "cursor-grab space-y-1.5 rounded-md border border-border bg-card p-2.5 shadow-sm transition-opacity hover:border-primary/40",
                    draggingId === chat.id && "opacity-40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={chat.contactName} src={chat.contactAvatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{chat.contactName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{formatPhone(chat.contactPhone)}</p>
                    </div>
                  </div>
                  {chat.lastMessagePreview && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{chat.lastMessagePreview}</p>
                  )}
                  <div className="flex items-center justify-between gap-1.5">
                    <Badge variant={chat.aiEnabled ? "default" : "secondary"} className="text-[10px]">
                      {chat.aiEnabled ? "IA ativa" : "Humano"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
              {columnChats.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhum contato aqui.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
