"use client";

import { useEffect, useState } from "react";
import { ConversationList, type ChatSummary } from "./conversation-list";
import { ChatPanel } from "./chat-panel";
import { MessageSquareText } from "lucide-react";

export function ChatView({ initialChats }: { initialChats: ChatSummary[] }) {
  const [chats, setChats] = useState(initialChats);
  const [selectedId, setSelectedId] = useState<string | null>(initialChats[0]?.id ?? null);

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

  async function handleAiToggle(chatId: string, aiEnabled: boolean) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, aiEnabled } : c)));
    await fetch(`/api/chats/${chatId}/toggle-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled }),
    });
  }

  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <ConversationList chats={chats} selectedId={selectedId} onSelect={setSelectedId} />
      {selectedChat ? (
        <ChatPanel chat={selectedChat} onAiToggle={handleAiToggle} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <MessageSquareText className="h-10 w-10" />
          <p className="text-sm">Selecione uma conversa para começar</p>
        </div>
      )}
    </div>
  );
}
