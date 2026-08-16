"use client";

import { cn, formatPhone } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export function ConversationList({
  chats,
  selectedId,
  onSelect,
}: {
  chats: ChatSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">Conversas</h2>
        <p className="text-xs text-muted-foreground">{chats.length} conversa(s)</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
              selectedId === chat.id && "bg-accent"
            )}
          >
            <Avatar name={chat.contactName} src={chat.contactAvatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{chat.contactName}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true, locale: ptBR })}
                </span>
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
          </button>
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
