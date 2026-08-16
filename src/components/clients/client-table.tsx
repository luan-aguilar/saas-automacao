"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatPhone } from "@/lib/utils";
import { Plus, KeyRound, Power, Copy, Check } from "lucide-react";

type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  mustChangePassword: boolean;
  createdAt: string;
  whatsappConnection: { status: string; phoneNumber: string | null } | null;
};

export function ClientTable({ initialClients }: { initialClients: ClientRow[] }) {
  const [clients, setClients] = useState(initialClients);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    };

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setFormError(data.error ?? "Erro ao criar cliente");
      return;
    }

    setGeneratedCredentials({ email: payload.email, password: data.temporaryPassword });
    setShowForm(false);

    startTransition(async () => {
      const listRes = await fetch("/api/clients");
      const listData = await listRes.json();
      setClients(listData.clients);
    });
  }

  async function handleAction(id: string, action: "ACTIVATE" | "DEACTIVATE" | "RESET_PASSWORD") {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) return;

    if (action === "RESET_PASSWORD" && data.temporaryPassword) {
      const client = clients.find((c) => c.id === id);
      if (client) {
        setGeneratedCredentials({ email: client.email, password: data.temporaryPassword });
      }
    }

    startTransition(async () => {
      const listRes = await fetch("/api/clients");
      const listData = await listRes.json();
      setClients(listData.clients);
    });
  }

  function copyCredentials() {
    if (!generatedCredentials) return;
    const text = `Acesso ao painel:\nLink: ${window.location.origin}/login\nE-mail: ${generatedCredentials.email}\nSenha temporária: ${generatedCredentials.password}\n\nPor segurança, você será solicitado a trocar a senha no primeiro acesso.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {generatedCredentials && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">Credenciais geradas para {generatedCredentials.email}</p>
              <p className="text-muted-foreground">
                Senha temporária: <span className="font-mono font-semibold text-foreground">{generatedCredentials.password}</span>
                {" — "}envie esta mensagem ao cliente via WhatsApp. Ela não será exibida novamente.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyCredentials}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar mensagem"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGeneratedCredentials(null)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>Gerencie as contas de clientes do robô</CardDescription>
          </div>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        </CardHeader>

        {showForm && (
          <CardContent className="border-t border-border pt-4">
            <form
              action={(formData) => handleCreate(formData)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" placeholder="Nome do cliente" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" placeholder="cliente@empresa.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                <Input id="phone" name="phone" placeholder="11999998888" required />
              </div>
              <div className="sm:col-span-3">
                {formError && <p className="mb-2 text-sm text-destructive">{formError}</p>}
                <Button type="submit" disabled={isPending}>
                  Criar conta e gerar senha temporária
                </Button>
              </div>
            </form>
          </CardContent>
        )}

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
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
                    <td className="px-4 py-3">{client.phone ? formatPhone(client.phone) : "-"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={client.whatsappConnection?.status === "CONNECTED" ? "success" : "outline"}>
                        {client.whatsappConnection?.status ?? "DESCONHECIDO"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={client.status === "ACTIVE" ? "success" : "destructive"}>
                        {client.status === "ACTIVE" ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Redefinir senha"
                          onClick={() => handleAction(client.id, "RESET_PASSWORD")}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={client.status === "ACTIVE" ? "destructive" : "default"}
                          title={client.status === "ACTIVE" ? "Desativar" : "Ativar"}
                          onClick={() =>
                            handleAction(client.id, client.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum cliente cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
