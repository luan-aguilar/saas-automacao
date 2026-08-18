"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, AlertTriangle } from "lucide-react";

export function ChangePasswordForm({ mustChangePassword }: { mustChangePassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError("A confirmação não bate com a nova senha");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Erro ao trocar a senha");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Alterar senha
        </CardTitle>
        <CardDescription>
          {mustChangePassword
            ? "Você ainda está usando a senha temporária gerada para você. Recomendamos trocá-la agora."
            : "Informe sua senha atual e a nova senha desejada."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mustChangePassword && (
          <p className="mb-4 flex items-center gap-1.5 rounded-md bg-gold/10 px-3 py-2 text-sm text-gold-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Senha temporária ainda em uso — troque por uma de sua escolha.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Trocar senha"}
            </Button>
            {saved && <span className="text-sm text-success">Senha atualizada com sucesso.</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
