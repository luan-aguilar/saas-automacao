"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConversationList, type ChatSummary } from "./conversation-list";
import { ChatPanel } from "./chat-panel";
import { Button } from "@/components/ui/button";
import { MessageSquareText, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirm } from "@/lib/confirm-store";
import { toast, dismissToast } from "@/lib/toast-store";

type WhatsappStatus = "DISCONNECTED" | "CONNECTING" | "QR_PENDING" | "CONNECTED" | "ERROR";

export function ChatView({
  initialChats,
  initialAiGloballyEnabled,
  initialWhatsappStatus,
  canDeleteChat = true,
}: {
  initialChats: ChatSummary[];
  initialAiGloballyEnabled: boolean;
  initialWhatsappStatus: WhatsappStatus;
  canDeleteChat?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link vindo do Kanban (/pipeline) — clicar num card navega pra
  // /chat?id=... e essa conversa já abre selecionada.
  const linkedChatId = searchParams.get("id");

  const [chats, setChats] = useState(initialChats);
  const [selectedId, setSelectedId] = useState<string | null>(
    linkedChatId ?? initialChats[0]?.id ?? null
  );
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus>(initialWhatsappStatus);

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

  // Acompanha o status da conexão do WhatsApp, igual à tela /whatsapp — se o
  // celular for desconectado enquanto o operador está com a Central de
  // Atendimento aberta, o bloqueio abaixo aparece na hora, sem precisar
  // recarregar a página. Assim que reconectar, some sozinho e as mensagens
  // voltam a sincronizar normalmente (o polling de `/api/chats` acima já
  // continua rodando por baixo o tempo todo).
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setWhatsappStatus(data.status);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  function syncLocalAiState(chatId: string, aiEnabled: boolean) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, aiEnabled } : c)));
  }

  // Toast "aguarde" da troca da IA por conversa — criado no clique, apagado
  // assim que `handleMessagesLoaded` confirmar que a mensagem de sistema
  // ("IA reativada.../IA pausada...") já chegou (ver essa função abaixo).
  const pendingAiToastId = useRef<string | null>(null);

  async function handleAiToggle(chatId: string, aiEnabled: boolean) {
    syncLocalAiState(chatId, aiEnabled);

    if (pendingAiToastId.current) dismissToast(pendingAiToastId.current);
    pendingAiToastId.current = toast({
      title: aiEnabled ? "Reativando a IA nesta conversa..." : "Pausando a IA nesta conversa...",
      description: "Aguarde só um instante.",
      durationMs: 15000, // rede de segurança — some sozinho mesmo se o reload abaixo falhar
    });

    await fetch(`/api/chats/${chatId}/toggle-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled }),
    });

    // Força a Central de Atendimento a buscar as mensagens NA HORA, em vez de
    // esperar o próximo polling (a cada 4s) — é isso que fazia a confirmação
    // demorar visivelmente pra aparecer, mesmo a mensagem já existindo no
    // banco desde a resposta do POST acima.
    setReloadSignal((n) => n + 1);
  }

  /** Chamado pelo ChatPanel toda vez que a lista de mensagens termina de recarregar (poll normal ou forçado). */
  function handleMessagesLoaded() {
    if (pendingAiToastId.current) {
      dismissToast(pendingAiToastId.current);
      pendingAiToastId.current = null;
    }
  }

  async function handleGlobalAiToggle(enabled: boolean) {
    setAiGloballyEnabled(enabled);
    await fetch("/api/config/ai-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    toast({
      title: enabled ? "Chave geral de IA reativada" : "Chave geral de IA desativada",
      description: enabled
        ? "Contatos novos voltam a receber resposta automática."
        : "Contatos novos não recebem mais resposta automática.",
      variant: enabled ? "success" : "warning",
    });
  }

  async function handleClearChat(chatId: string) {
    if (
      !(await confirm({
        title: "Limpar histórico desta conversa?",
        description: "Isso apaga só aqui no SaaS — não afeta o WhatsApp do contato.",
        confirmLabel: "Limpar",
        variant: "destructive",
      }))
    ) {
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
    if (
      !(await confirm({
        title: "Excluir esta conversa?",
        description: "Isso remove o histórico daqui do SaaS — não afeta o WhatsApp do contato.",
        confirmLabel: "Excluir",
        variant: "destructive",
      }))
    ) {
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
  const isDisconnected = whatsappStatus !== "CONNECTED";

  return (
    <div className="relative flex h-full">
      <div className={isDisconnected ? "pointer-events-none flex h-full flex-1 blur-sm select-none" : "flex h-full flex-1"}>
        {/* No mobile só um painel fica visível por vez: lista OU conversa —
            lado a lado (como no desktop) não cabe numa tela pequena. */}
        <div className={cn("h-full", selectedId ? "hidden md:block" : "block")}>
          <ConversationList
            chats={chats}
            selectedId={selectedId}
            onSelect={setSelectedId}
            aiGloballyEnabled={aiGloballyEnabled}
            onGlobalAiToggle={handleGlobalAiToggle}
            onClearChat={handleClearChat}
            onDeleteChat={canDeleteChat ? handleDeleteChat : undefined}
          />
        </div>
        <div className={cn("h-full flex-1", selectedId ? "flex" : "hidden md:flex")}>
          {selectedChat ? (
            <ChatPanel
              chat={selectedChat}
              onAiToggle={handleAiToggle}
              onLocalAiStateSync={syncLocalAiState}
              onMessagesLoaded={handleMessagesLoaded}
              reloadSignal={reloadSignal}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquareText className="h-10 w-10" />
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          )}
        </div>
      </div>

      {isDisconnected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center shadow-lg">
            <QrCode className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">WhatsApp desconectado</p>
            <p className="text-sm text-muted-foreground">
              Por favor, faça a conexão novamente na aba &ldquo;Conexão WhatsApp&rdquo; escaneando o QR code com
              seu aplicativo do WhatsApp pelo celular.
            </p>
            <Button size="sm" className="mt-1" onClick={() => router.push("/whatsapp")}>
              Ir para Conexão WhatsApp
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
