"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Sparkles } from "lucide-react";

type Template = { key: string; name: string; description: string };
type Client = { id: string; name: string; email: string };
type AccessRow = { userId: string; templateKey: string };

export function TemplateAccessManager({
  templates,
  clients,
  initialAccess,
}: {
  templates: Template[];
  clients: Client[];
  initialAccess: AccessRow[];
}) {
  // Set de chaves "userId::templateKey" — forma mais simples de checar/alternar
  // acesso individual sem precisar de estrutura aninhada.
  const [granted, setGranted] = useState<Set<string>>(
    new Set(initialAccess.map((a) => `${a.userId}::${a.templateKey}`))
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  function cellKey(userId: string, templateKey: string) {
    return `${userId}::${templateKey}`;
  }

  async function toggle(userId: string, templateKey: string) {
    const key = cellKey(userId, templateKey);
    const currentlyGranted = granted.has(key);

    setPending((p) => new Set(p).add(key));
    setGranted((g) => {
      const next = new Set(g);
      if (currentlyGranted) next.delete(key);
      else next.add(key);
      return next;
    });

    const res = await fetch("/api/templates/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, templateKey, grant: !currentlyGranted }),
    });

    setPending((p) => {
      const next = new Set(p);
      next.delete(key);
      return next;
    });

    if (!res.ok) {
      // Reverte em caso de falha — mantém a UI honesta com o que de fato está salvo.
      setGranted((g) => {
        const next = new Set(g);
        if (currentlyGranted) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Acesso por cliente
        </CardTitle>
        <CardDescription>
          {templates.length === 0
            ? "Nenhum template cadastrado ainda."
            : "Marque quais clientes podem carregar cada template no Construtor de Fluxos."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-t border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                {templates.map((t) => (
                  <th key={t.key} className="px-4 py-3 text-center font-medium" title={t.description}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={client.name} />
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      </div>
                    </div>
                  </td>
                  {templates.map((t) => {
                    const key = cellKey(client.id, t.key);
                    const isGranted = granted.has(key);
                    const isPending = pending.has(key);
                    return (
                      <td key={t.key} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary disabled:opacity-50"
                          checked={isGranted}
                          disabled={isPending}
                          onChange={() => toggle(client.id, t.key)}
                          aria-label={`Liberar ${t.name} para ${client.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={templates.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum cliente cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
