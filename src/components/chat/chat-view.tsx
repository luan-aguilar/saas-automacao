"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationList, type ChatSummary } from "./conversation-list";
import { ChatPanel } from "./chat-panel";
import { MessageSquareText } from "lucide-react";

export function ChatView({
  initialChats,
  initialAiGloballyEnabled,
}: {
  initialChats: ChatSummary[];
  initialAiGloballyEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  // Deep-link vindo do Kanban (/pipeline) — clicar num card navega pra
  // /chat?id=... e essa conversa já abre selecionada.
  const linkedChatId = searchParams.get("id");

  const [chats, setChats] = useState(initialChats);
  const [selectedId, setSelectedId] = useState<string | null>(
    linkedChatId ?? initialChats[0]?.id ?? null
  );

  useEffect(() => {
    if (linkedChatId) setSelectedId(linkedChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedChatId]);
  const [aiGloballyEnabled, setAiGloballyEnabled] = useState(initialAiGloballyEnabled);
  // Incrementado após limpar/apagar mensagens da conversa aberta, pra forçar
  // o ChatPanel a recarregar na hora em vez de esperar o próximo polling.
  const [reloadSignal, setReloadSignal] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  function syncLocalAiState(chatId: string, aiEnabled: boolean) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, aiEnabled } : c)));
  }

  async function handleAiToggle(chatId: string, aiEnabled: boolean) {
    syncLocalAiState(chatId, aiEnabled);
    await fetch(`/api/chats/${chatId}/toggle-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled }),
    });
  }

  async function handleGlobalAiToggle(enabled: boolean) {
    setAiGloballyEnabled(enabled);
    await fetch("/api/config/ai-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleClearChat(chatId: string) {
    if (!window.confirm("Limpar todo o histórico desta conversa? Isso apaga só aqui no SaaS — não afeta o WhatsApp do contato.")) {
      return;
    }
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
    if (!res.ok) return;

    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, lastMessagePreview: null } : c)));
    if (chatId === selectedId) setReloadSignal((n) => n + 1);
  }

  async function handleDeleteChat(chatId: string) {
    if (!window.confirm("Excluir esta conversa? Isso remove o histórico daqui do SaaS — não afeta o WhatsApp do contato.")) {
      return;
    }
    const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    if (!res.ok) return;

    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (chatId === selectedId) {
      setSelectedId((prevId) => {
        const remaining = chats.filter((c) => c.id !== chatId);
        return remaining[0]?.id ?? null;
      });
    }
  }

  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <ConversationList
        chats={chats}
        selectedId={selectedId}
        onSelect={setSelectedId}
        aiGloballyEnabled={aiGloballyEnabled}
        onGlobalAiToggle={handleGlobalAiToggle}
        onClearChat={handleClearChat}
        onDeleteChat={handleDeleteChat}
      />
      {selectedChat ? (
        <ChatPanel
          chat={selectedChat}
          onAiToggle={handleAiToggle}
          onLocalAiStateSync={syncLocalAiState}
          reloadSignal={reloadSignal}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <MessageSquareText className="h-10 w-10" />
          <p className="text-sm">Selecione uma conversa para começar</p>
        </div>
      )}
    </div>
  );
}
