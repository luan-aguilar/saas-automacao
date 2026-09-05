"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/** Só é renderizado pra role MASTER — ver uso em `profile/page.tsx`. */
export function LogoutAllSessionsButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);

    const res = await fetch("/api/profile/logout-all-sessions", { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao desconectar as sessões");
      return;
    }

    // Essa própria sessão também é invalidada -- desloga aqui e manda pro
    // login, de onde é preciso entrar de novo com a senha atual.
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Deslogar de todas as sessões
        </CardTitle>
        <CardDescription>
          Encerra todo login MASTER já aberto (inclusive em outros computadores) e te desloga daqui também. Use se
          suspeitar que alguém mais tem acesso à sua conta — depois é só entrar de novo com a senha atual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <Button variant="destructive" onClick={handleClick} disabled={loading}>
          {loading ? "Desconectando..." : "Deslogar de todas as sessões"}
        </Button>
      </CardContent>
    </Card>
  );
}
