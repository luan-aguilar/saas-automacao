"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { OPENAI_MODELS } from "@/lib/constants";
import { KeyRound, ShieldCheck } from "lucide-react";

type InitialConfig = {
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  systemPrompt: string;
  model: string;
  temperature: number;
  aiEnabledDefault: boolean;
} | null;

export function SettingsForm({ initialConfig }: { initialConfig: InitialConfig }) {
  const [apiKey, setApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    initialConfig?.systemPrompt ??
      "Você é um assistente virtual educado e objetivo. Responda de forma clara e curta."
  );
  const [model, setModel] = useState(initialConfig?.model ?? "gpt-4o-mini");
  const [temperature, setTemperature] = useState(initialConfig?.temperature ?? 0.7);
  const [aiEnabledDefault, setAiEnabledDefault] = useState(initialConfig?.aiEnabledDefault ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openaiApiKey: apiKey || undefined,
        systemPrompt,
        model,
        temperature,
        aiEnabledDefault,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao salvar configurações");
      return;
    }

    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> API Key da OpenAI
          </CardTitle>
          <CardDescription>
            Sua chave é armazenada de forma criptografada e nunca é exibida novamente após salva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialConfig?.hasApiKey && (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <ShieldCheck className="h-4 w-4" />
              Chave configurada ({initialConfig.apiKeyPreview})
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">
              {initialConfig?.hasApiKey ? "Substituir chave (opcional)" : "Sua API Key"}
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Modelo</Label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {OPENAI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="temperature">Temperatura ({temperature.toFixed(1)})</Label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Valores baixos = respostas mais previsíveis. Valores altos = respostas mais criativas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt do Sistema</CardTitle>
          <CardDescription>Instruções gerais que definem a personalidade e o comportamento do robô</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            placeholder="Ex: Você é o assistente virtual da Loja XPTO. Seja simpático, responda em português..."
          />
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">IA ativa por padrão em novas conversas</p>
              <p className="text-xs text-muted-foreground">
                Pode ser alterado individualmente em cada conversa na Central de Atendimento.
              </p>
            </div>
            <Switch checked={aiEnabledDefault} onCheckedChange={setAiEnabledDefault} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </Button>
        {saved && <span className="text-sm text-success">Salvo com sucesso.</span>}
      </div>
    </form>
  );
}
