"use client";

import { useEffect, useRef, useState } from "react";
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

export type PipelineColumnDefinition = { key: PipelineStage; label: string; description: string };

/** Um template do Construtor de Fluxos que também define um funil (ver `TemplateDefinition.pipelineColumns`). */
export type PipelineTemplate = { key: string; name: string; columns: PipelineColumnDefinition[] };

export function PipelineBoard({
  initialChats,
  templates,
}: {
  initialChats: PipelineChat[];
  /**
   * Templates com funil que este usuário tem acesso — normalmente só 1 (o
   * template do negócio dele), mas o MASTER (ou um cliente liberado pra mais
   * de um) vê um seletor pra escolher qual visualizar, igual ao seletor de
   * template do Construtor de Fluxos.
   */
  templates: PipelineTemplate[];
}) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0]?.key ?? "");
  const columns = templates.find((t) => t.key === selectedTemplateKey)?.columns ?? templates[0]?.columns ?? [];

  const [chats, setChats] = useState(initialChats);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PipelineStage | null>(null);
  const router = useRouter();

  // Ref espelhando `draggingId` — lida dentro do `setInterval` abaixo, que só
  // roda uma vez (deps vazio) e por isso enxergaria sempre o valor "preso" da
  // primeira renderização se lesse o state diretamente.
  const draggingIdRef = useRef<string | null>(null);
  useEffect(() => {
    draggingIdRef.current = draggingId;
  }, [draggingId]);

  // Polling: mantém o quadro sincronizado com movimentações automáticas do
  // motor de fluxo (handoff pra "Aguardando Humano", retorno de cliente
  // recorrente) enquanto o operador está com a página aberta — sem isso, só
  // aparecia ao recarregar a página. Pula a atualização durante um arrasto em
  // andamento pra não "puxar o tapete" do card no meio do gesto.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (draggingIdRef.current) return;
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="flex h-full flex-col gap-3">
      {templates.length > 1 && (
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <span className="text-xs text-muted-foreground">Funil:</span>
          <select
            value={selectedTemplateKey}
            onChange={(e) => setSelectedTemplateKey(e.target.value)}
            className="flex h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
        {columns.map((column) => {
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
                // Não depende só do `onDragEnd` do card pra limpar isso: como
                // o card muda de coluna (o `chats` state muda assim que
                // `moveChat` roda), o elemento original arrastado pode ser
                // desmontado/realocado no DOM antes do evento nativo
                // `dragend` disparar nele — deixando `draggingId` preso pra
                // sempre (o card ficava com opacidade baixa/letras apagadas
                // até recarregar a página). Limpar aqui garante que sempre é
                // resetado.
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
    </div>
  );
}
