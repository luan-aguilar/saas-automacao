"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatPhone, cn } from "@/lib/utils";
import { Send, Bot } from "lucide-react";
import type { ChatSummary } from "./conversation-list";

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  sender: "CONTACT" | "AI" | "HUMAN" | "SYSTEM";
  content: string;
  createdAt: string;
};

const senderLabel: Record<Message["sender"], string> = {
  CONTACT: "Contato",
  AI: "IA",
  HUMAN: "Atendente",
  SYSTEM: "Sistema",
};

export function ChatPanel({
  chat,
  onAiToggle,
}: {
  chat: ChatSummary;
  onAiToggle: (chatId: string, aiEnabled: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/chats/${chat.id}/messages`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setMessages(data.messages);
      }
    }

    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    const res = await fetch(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setDraft("");
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={chat.contactName} src={chat.contactAvatarUrl} />
          <div>
            <p className="font-medium">{chat.contactName}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(chat.contactPhone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">IA</span>
          <Switch checked={chat.aiEnabled} onCheckedChange={(v) => onAiToggle(chat.id, v)} />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
        {messages.map((message) => {
          const isOutbound = message.direction === "OUTBOUND";
          const isSystem = message.sender === "SYSTEM";

          if (isSystem) {
            return (
              <div key={message.id} className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {message.content}
                </span>
              </div>
            );
          }

          return (
            <div key={message.id} className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  isOutbound ? "bg-primary text-primary-foreground" : "bg-card"
                )}
              >
                {isOutbound && (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">
                    {senderLabel[message.sender]}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">
                  {new Date(message.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda nesta conversa.
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-card p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            chat.aiEnabled
              ? "IA está respondendo automaticamente — envie para intervir manualmente"
              : "Digite uma mensagem..."
          }
        />
        <Button onClick={handleSend} disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
