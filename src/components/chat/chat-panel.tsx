"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, cn } from "@/lib/utils";
import { confirm } from "@/lib/confirm-store";
import { Send, Bot, ListChecks, Trash2, X, ArrowLeft } from "lucide-react";
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
  onLocalAiStateSync,
  onMessagesLoaded,
  reloadSignal,
  onBack,
}: {
  chat: ChatSummary;
  onAiToggle: (chatId: string, aiEnabled: boolean) => void;
  onLocalAiStateSync: (chatId: string, aiEnabled: boolean) => void;
  /** Chamado toda vez que a busca de mensagens termina (poll normal ou forçado por `reloadSignal`) — usado pelo pai pra saber a hora certa de fechar o toast de "aguarde" da troca de IA. */
  onMessagesLoaded?: () => void;
  /** Incrementado pelo componente pai para forçar um recarregamento imediato (ex: após limpar a conversa pelo menu lateral). */
  reloadSignal?: number;
  /** Só usado no mobile — volta pra lista de conversas (lá, a lista fica escondida enquanto uma conversa está aberta). */
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  // true enquanto a PRIMEIRA busca de uma conversa recém-aberta ainda não
  // voltou — nunca fica true de novo nos polls seguintes da mesma conversa.
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ref (não state) pra sempre chamar a versão mais recente de `onMessagesLoaded`
  // sem precisar listar como dependência do efeito abaixo — o componente pai
  // recria essa função a cada render, e colocá-la nas deps reiniciaria o
  // polling toda hora.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  }, [onMessagesLoaded]);

  // Guarda o id da conversa da renderização anterior — sem isso, trocar de
  // conversa reaproveitava este mesmo componente (não remonta, não tem
  // `key`) e continuava mostrando as mensagens da conversa ANTERIOR por
  // baixo do nome/cabeçalho da conversa NOVA até a busca terminar. Some
  // errado, ainda que só por um instante.
  const previousChatIdRef = useRef(chat.id);

  useEffect(() => {
    let cancelled = false;

    if (previousChatIdRef.current !== chat.id) {
      previousChatIdRef.current = chat.id;
      setMessages([]);
      setMessagesLoading(true);
    }

    // `isForced` só é true pra ESTA chamada imediata (a que reage a `chat.id`/
    // `reloadSignal` mudando) — o polling periódico abaixo nunca chama
    // `onMessagesLoaded`. Sem essa distinção, um polling "de fundo" que por
    // coincidência termina um instante antes do reload forçado (ex: logo
    // após ligar/desligar a IA) fechava o toast de "aguarde" cedo demais,
    // antes da mensagem de confirmação realmente aparecer.
    async function load(isForced: boolean) {
      const res = await fetch(`/api/chats/${chat.id}/messages`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setMessages(data.messages);
        setMessagesLoading(false);
        if (isForced) onMessagesLoadedRef.current?.();
      }
    }

    load(true);
    const interval = setInterval(() => load(false), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chat.id, reloadSignal]);

  // Sai do modo de seleção (e limpa a seleção) sempre que troca de conversa.
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [chat.id]);

  function toggleSelected(messageId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  async function deleteMessages(messageIds: string[]) {
    if (messageIds.length === 0) return;
    const res = await fetch(`/api/chats/${chat.id}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds }),
    });
    if (!res.ok) return;
    setMessages((prev) => prev.filter((m) => !messageIds.includes(m.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      messageIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function handleDeleteSingle(messageId: string) {
    if (
      !(await confirm({
        title: "Apagar esta mensagem?",
        description: "Isso apaga só aqui no SaaS — não afeta o WhatsApp do contato.",
        confirmLabel: "Apagar",
        variant: "destructive",
      }))
    ) {
      return;
    }
    await deleteMessages([messageId]);
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (
      !(await confirm({
        title: "Apagar mensagens selecionadas?",
        description: `Apagar ${selectedIds.size} mensagem(ns) selecionada(s)? Isso apaga só aqui no SaaS — não afeta o WhatsApp do contato.`,
        confirmLabel: "Apagar",
        variant: "destructive",
      }))
    ) {
      return;
    }
    await deleteMessages(Array.from(selectedIds));
    setSelectMode(false);
  }

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
      // O backend desativa a IA automaticamente ao receber um envio manual —
      // reflete isso no switch já aqui (sem chamar /toggle-ai de novo, que
      // duplicaria a mensagem de sistema), sem esperar o próximo polling.
      if (data.aiEnabled === false && chat.aiEnabled) {
        onLocalAiStateSync(chat.id, false);
      }
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              title="Voltar para conversas"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <Avatar name={chat.contactName} src={chat.contactAvatarUrl} />
          <div>
            <p className="font-medium">{chat.contactName}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(chat.contactPhone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectMode ? (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.size} selecionada(s)</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" title="Selecionar mensagens" onClick={() => setSelectMode(true)}>
              <ListChecks className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">IA</span>
            <Switch checked={chat.aiEnabled} onCheckedChange={(v) => onAiToggle(chat.id, v)} />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
        {messagesLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-lg" />
            <Skeleton className="ml-auto h-9 w-1/2 rounded-lg" />
            <Skeleton className="h-14 w-3/5 rounded-lg" />
            <Skeleton className="ml-auto h-9 w-2/5 rounded-lg" />
          </div>
        )}
        {!messagesLoading && messages.map((message) => {
          const isOutbound = message.direction === "OUTBOUND";
          const isSystem = message.sender === "SYSTEM";
          const isSelected = selectedIds.has(message.id);

          if (isSystem) {
            return (
              <div key={message.id} className="group flex items-center justify-center gap-1.5">
                {selectMode && (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={isSelected}
                    onChange={() => toggleSelected(message.id)}
                  />
                )}
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {message.content}
                </span>
                {!selectMode && (
                  <button
                    type="button"
                    title="Apagar mensagem"
                    onClick={() => handleDeleteSingle(message.id)}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={cn("group flex items-center gap-1.5", isOutbound ? "justify-end" : "justify-start")}
            >
              {selectMode && !isOutbound && (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                  checked={isSelected}
                  onChange={() => toggleSelected(message.id)}
                />
              )}
              {!selectMode && !isOutbound && (
                <button
                  type="button"
                  title="Apagar mensagem"
                  onClick={() => handleDeleteSingle(message.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <div
                className={cn(
                  "max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  isOutbound ? "bg-primary text-primary-foreground" : "bg-card",
                  isSelected && "ring-2 ring-primary"
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
              {!selectMode && isOutbound && (
                <button
                  type="button"
                  title="Apagar mensagem"
                  onClick={() => handleDeleteSingle(message.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {selectMode && isOutbound && (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                  checked={isSelected}
                  onChange={() => toggleSelected(message.id)}
                />
              )}
            </div>
          );
        })}
        {!messagesLoading && messages.length === 0 && (
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
