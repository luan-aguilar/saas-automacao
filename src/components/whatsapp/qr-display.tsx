"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, LogOut, QrCode, RefreshCw, Smartphone } from "lucide-react";

type Status = "DISCONNECTED" | "CONNECTING" | "QR_PENDING" | "CONNECTED" | "ERROR";

type StatusResponse = {
  status: Status;
  phoneNumber: string | null;
  qrCode: string | null;
  qrExpiresAt: string | null;
  lastConnectedAt: string | null;
};

const statusLabels: Record<Status, string> = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Iniciando conexão...",
  QR_PENDING: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  ERROR: "Erro na conexão",
};

const POLL_INTERVAL_MS = 3000;

export function QrDisplay({ initial }: { initial: StatusResponse }) {
  const [data, setData] = useState<StatusResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Polling do status real da instância na Evolution API a cada 3s
    // (GET /instance/connectionState/{instanceName} por trás de /api/whatsapp/status).
    // Assim que o status virar "CONNECTED", o badge muda automaticamente e o
    // polling para.
    if (data.status === "CONNECTED") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [data.status]);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/whatsapp/connect", { method: "POST" });

    if (res.ok) {
      const statusRes = await fetch("/api/whatsapp/status");
      if (statusRes.ok) setData(await statusRes.json());
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível gerar o QR Code. Tente novamente em instantes.");
      // Ainda assim, atualiza o status (provavelmente virou ERROR no backend).
      const statusRes = await fetch("/api/whatsapp/status");
      if (statusRes.ok) setData(await statusRes.json());
    }

    setLoading(false);
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);

    const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });

    if (res.ok) {
      // Volta para a tela inicial de geração do QR Code.
      setData({
        status: "DISCONNECTED",
        phoneNumber: null,
        qrCode: null,
        qrExpiresAt: null,
        lastConnectedAt: null,
      });
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível desconectar o WhatsApp. Tente novamente em instantes.");
    }

    setDisconnecting(false);
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4" /> Conexão com WhatsApp
        </CardTitle>
        <CardDescription>
          Escaneie o QR Code com o aplicativo WhatsApp do número que será usado pelo robô.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              data.status === "CONNECTED" ? "success" : data.status === "ERROR" ? "destructive" : "outline"
            }
          >
            {statusLabels[data.status]}
          </Badge>
          {data.status === "CONNECTED" && data.phoneNumber && (
            <span className="text-sm text-muted-foreground">{formatPhone(data.phoneNumber)}</span>
          )}
        </div>

        <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6">
          {data.status === "CONNECTED" ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-sm font-medium">WhatsApp conectado com sucesso</p>
            </div>
          ) : data.qrCode ? (
            <Image
              src={data.qrCode}
              alt="QR Code para pareamento do WhatsApp"
              width={280}
              height={280}
              unoptimized
              className="h-full w-full rounded-md object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              <Smartphone className="h-10 w-10" />
              <p className="text-sm">Clique em &quot;Conectar&quot; para gerar o QR Code</p>
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {data.status === "CONNECTED" ? (
          <Button
            onClick={handleDisconnect}
            disabled={disconnecting}
            variant="destructive"
            className="w-full"
          >
            <LogOut className={disconnecting ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {disconnecting ? "Desconectando..." : "Desconectar WhatsApp"}
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={loading} className="w-full">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Conectar / Gerar novo QR Code
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Conectado à Evolution API (<code>WHATSAPP_SERVICE_URL</code>). O QR Code é gerado em
          tempo real via <code>/instance/create</code> (ou <code>/instance/connect</code>, se a
          instância já existir), e o status é sincronizado a cada 3s consultando{" "}
          <code>/instance/connectionState/{"{instanceName}"}</code>. Veja{" "}
          <code>src/lib/evolution-api.ts</code>.
        </p>
      </CardContent>
    </Card>
  );
}
