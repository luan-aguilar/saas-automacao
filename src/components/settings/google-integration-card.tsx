"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, CheckCircle2 } from "lucide-react";

type GoogleConfig = {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
  timezone: string;
  spreadsheetId: string;
  leadsSheetName: string;
  sessionsSheetName: string;
};

/**
 * Card de configuração da integração Google (Calendar + Sheets), usada
 * pelos blocos "Agenda: Buscar Horários" / "Agenda: Confirmar Agendamento"
 * do Construtor de Fluxos. A conexão em si (OAuth) é um simples link pra
 * `/api/google/connect`, que redireciona pro consentimento do Google e
 * volta com `?google_connected=1` (ou `?google_error=...`) — ver
 * `/api/google/callback`.
 */
export function GoogleIntegrationCard() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("google_error"));
  const [justConnected] = useState(searchParams.get("google_connected") === "1");

  useEffect(() => {
    fetch("/api/google/config")
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch("/api/google/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarId: config.calendarId,
        timezone: config.timezone,
        spreadsheetId: config.spreadsheetId,
        leadsSheetName: config.leadsSheetName,
        sessionsSheetName: config.sessionsSheetName,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleDisconnect() {
    if (!window.confirm("Desconectar sua conta Google? Os blocos de Agenda do Construtor de Fluxos param de funcionar até você conectar de novo.")) {
      return;
    }
    await fetch("/api/google/disconnect", { method: "POST" });
    setConfig((prev) => (prev ? { ...prev, connected: false, googleEmail: null } : prev));
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Integração Google (Agenda e Planilha)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Integração Google (Agenda e Planilha)
        </CardTitle>
        <CardDescription>
          Usada pelos blocos &ldquo;Agenda: Buscar Horários&rdquo; e &ldquo;Agenda: Confirmar Agendamento&rdquo; do
          Construtor de Fluxos — pra consultar horários livres, criar o evento com link do Google Meet, e
          registrar o lead numa planilha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {justConnected && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Conta Google conectada com sucesso.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!config?.connected ? (
          <Button onClick={() => (window.location.href = "/api/google/connect")}>Conectar com Google</Button>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Conectado{config.googleEmail ? ` como ${config.googleEmail}` : ""}
            </p>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Agenda a consultar/agendar</Label>
                <Input
                  value={config.calendarId}
                  onChange={(e) => setConfig({ ...config, calendarId: e.target.value })}
                  placeholder="primary (a sua própria) ou o e-mail de uma agenda compartilhada"
                />
                <p className="text-xs text-muted-foreground">
                  Use <code>primary</code> pra sua própria agenda, ou o e-mail de outra agenda que você tenha
                  permissão de editar (ex: a do seu gestor comercial, compartilhada pelo Google Calendar).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Fuso horário</Label>
                <Input
                  value={config.timezone}
                  onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                  placeholder="America/Sao_Paulo"
                />
              </div>

              <div className="space-y-1.5">
                <Label>ID da planilha (Google Sheets)</Label>
                <Input
                  value={config.spreadsheetId}
                  onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
                  placeholder="o trecho da URL entre /d/ e /edit"
                />
                <p className="text-xs text-muted-foreground">
                  Ex: em <code>docs.google.com/spreadsheets/d/ABC123/edit</code>, o ID é <code>ABC123</code>. A
                  planilha precisa estar compartilhada com {config.googleEmail ?? "a conta conectada"} (edição).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Aba de leads</Label>
                  <Input
                    value={config.leadsSheetName}
                    onChange={(e) => setConfig({ ...config, leadsSheetName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Aba de sessões</Label>
                  <Input
                    value={config.sessionsSheetName}
                    onChange={(e) => setConfig({ ...config, sessionsSheetName: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar configuração"}
                </Button>
                {saved && <span className="text-sm text-success">Salvo com sucesso.</span>}
              </div>
            </form>

            <Button variant="destructive" size="sm" onClick={handleDisconnect}>
              Desconectar conta Google
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
