"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatPhone } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, PowerOff, MoreVertical, Eraser, Trash2 } from "lucide-react";

export type ChatSummary = {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatarUrl: string | null;
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  aiEnabled: boolean;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
};

function ConversationRowMenu({
  onClear,
  onDelete,
}: {
  onClear: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        title="Opções da conversa"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-10 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-md"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClear();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Eraser className="h-3.5 w-3.5" />
            Limpar conversa
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir conversa
          </button>
        </div>
      )}
    </div>
  );
}

export function ConversationList({
  chats,
  selectedId,
  onSelect,
  aiGloballyEnabled,
  onGlobalAiToggle,
  onClearChat,
  onDeleteChat,
}: {
  chats: ChatSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  aiGloballyEnabled: boolean;
  onGlobalAiToggle: (enabled: boolean) => void;
  onClearChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">Conversas</h2>
        <p className="text-xs text-muted-foreground">{chats.length} conversa(s)</p>

        <div
          className={cn(
            "mt-3 flex items-center justify-between gap-2 rounded-md border px-2.5 py-2",
            aiGloballyEnabled ? "border-border bg-muted/30" : "border-destructive/40 bg-destructive/10"
          )}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            {aiGloballyEnabled ? (
              <Bot className="h-3.5 w-3.5" />
            ) : (
              <PowerOff className="h-3.5 w-3.5 text-destructive" />
            )}
            Chave geral de IA
          </span>
          <Switch checked={aiGloballyEnabled} onCheckedChange={onGlobalAiToggle} />
        </div>
        {!aiGloballyEnabled && (
          <p className="mt-1.5 text-[11px] leading-snug text-destructive">
            Desativada: contatos novos não recebem resposta automática. Conversas onde você já ativou a IA
            manualmente (toggle individual) continuam respondendo normalmente.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <div
            key={chat.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(chat.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(chat.id);
            }}
            className={cn(
              "group flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
              selectedId === chat.id && "bg-accent"
            )}
          >
            <Avatar name={chat.contactName} src={chat.contactAvatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{chat.contactName}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true, locale: ptBR })}
                  </span>
                  <ConversationRowMenu
                    onClear={() => onClearChat(chat.id)}
                    onDelete={() => onDeleteChat(chat.id)}
                  />
                </div>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {chat.lastMessagePreview ?? formatPhone(chat.contactPhone)}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant={chat.aiEnabled ? "default" : "secondary"} className="text-[10px]">
                  {chat.aiEnabled ? "IA ativa" : "Humano"}
                </Badge>
                {chat.unreadCount > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {chat.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {chats.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma conversa ainda. Assim que seu robô receber mensagens, elas aparecerão aqui.
          </p>
        )}
      </div>
    </div>
  );
}
