"use client";

import { useEffect, useState } from "react";
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
  const [chats, setChats] = useState(initialChats);
  const [selectedId, setSelectedId] = useState<string | null>(initialChats[0]?.id ?? null);
  const [aiGloballyEnabled, setAiGloballyEnabled] = useState(initialAiGloballyEnabled);

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

  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <ConversationList
        chats={chats}
        selectedId={selectedId}
        onSelect={setSelectedId}
        aiGloballyEnabled={aiGloballyEnabled}
        onGlobalAiToggle={handleGlobalAiToggle}
      />
      {selectedChat ? (
        <ChatPanel chat={selectedChat} onAiToggle={handleAiToggle} onLocalAiStateSync={syncLocalAiState} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <MessageSquareText className="h-10 w-10" />
          <p className="text-sm">Selecione uma conversa para começar</p>
        </div>
      )}
    </div>
  );
}
