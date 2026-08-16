/**
 * Cliente HTTP para a Evolution API v2 (https://doc.evolution-api.com), usada
 * para manter a sessão do WhatsApp (via Baileys) na VPS externa configurada em
 * `WHATSAPP_SERVICE_URL` (base URL da Evolution API) e autenticada com a
 * apikey global em `WHATSAPP_SERVICE_TOKEN`.
 *
 * Cada tenant (usuário) tem sua própria "instância" na Evolution API,
 * nomeada via `instanceNameFor(userId)` e persistida em
 * `WhatsappConnection.externalSessionId`.
 */

export class EvolutionApiError extends Error {}

function getEvolutionConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_SERVICE_TOKEN;

  if (!baseUrl || !apiKey) {
    throw new EvolutionApiError(
      "WHATSAPP_SERVICE_URL e/ou WHATSAPP_SERVICE_TOKEN não estão configurados no .env."
    );
  }

  return { baseUrl, apiKey };
}

/** Nome de instância estável e único por tenant na Evolution API. */
export function instanceNameFor(userId: string): string {
  return `tenant_${userId}`.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = getEvolutionConfig();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de rede desconhecido";
    throw new EvolutionApiError(`Não foi possível conectar à Evolution API (${message}).`);
  }

  const raw = await response.text();
  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = raw;
    }
  }

  if (!response.ok) {
    const body = json as { message?: unknown; error?: unknown } | null;
    const messageField = body?.message ?? body?.error;
    const message = Array.isArray(messageField)
      ? messageField.join(", ")
      : (messageField as string | undefined) ?? raw ?? `HTTP ${response.status}`;
    throw new EvolutionApiError(`Evolution API respondeu ${response.status}: ${message}`);
  }

  return json;
}

type EvolutionQrPayload = {
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
};

export type EvolutionQrResult = {
  base64: string | null;
  pairingCode: string | null;
};

/**
 * A Evolution API retorna o QR ora aninhado em `qrcode` (resposta de
 * `/instance/create`), ora "no nível raiz" (resposta de `/instance/connect`).
 * Esta função normaliza os dois formatos e garante que o base64 vire uma
 * data URL utilizável diretamente em uma tag <img>.
 */
function extractQr(data: unknown): EvolutionQrResult {
  const root = data as { qrcode?: EvolutionQrPayload } & EvolutionQrPayload;
  const qr: EvolutionQrPayload = root?.qrcode ?? root ?? {};

  let base64 = qr.base64 ?? null;
  if (base64 && !base64.startsWith("data:")) {
    base64 = `data:image/png;base64,${base64}`;
  }

  return { base64, pairingCode: qr.pairingCode ?? null };
}

/**
 * Cria a instância na Evolution API. Se ela já existir (usuário clicou em
 * "Conectar" mais de uma vez), busca um novo QR Code para a instância
 * existente via `/instance/connect/{instanceName}`.
 */
export async function createOrConnectInstance(instanceName: string): Promise<EvolutionQrResult> {
  try {
    const created = await evolutionFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    const qr = extractQr(created);
    if (qr.base64) return qr;
    // Instância criada mas a resposta não trouxe o QR embutido — busca explicitamente abaixo.
  } catch (error) {
    // Provavelmente a instância já existe (Evolution retorna 403/409 nesse caso).
    // Nesses casos seguimos para buscar um QR novo na instância existente.
    if (!(error instanceof EvolutionApiError)) throw error;
  }

  const connected = await evolutionFetch(`/instance/connect/${instanceName}`, { method: "GET" });
  return extractQr(connected);
}

export type EvolutionConnectionState = "open" | "connecting" | "close" | "unknown";

/** Consulta o estado atual da instância (`open` = conectado, `close` = desconectado). */
export async function getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
  const data = (await evolutionFetch(`/instance/connectionState/${instanceName}`, {
    method: "GET",
  })) as { instance?: { state?: string }; state?: string } | null;

  const state = data?.instance?.state ?? data?.state;
  if (state === "open" || state === "connecting" || state === "close") return state;
  return "unknown";
}

/** Melhor esforço: busca o número de telefone pareado após a conexão abrir. Não lança em caso de falha. */
export async function fetchInstancePhoneNumber(instanceName: string): Promise<string | null> {
  try {
    const data = await evolutionFetch(`/instance/fetchInstances?instanceName=${instanceName}`, {
      method: "GET",
    });
    const entry = (Array.isArray(data) ? data[0] : data) as
      | {
          ownerJid?: string;
          owner?: string;
          instance?: { owner?: string; ownerJid?: string };
        }
      | null
      | undefined;

    const ownerJid = entry?.ownerJid ?? entry?.owner ?? entry?.instance?.ownerJid ?? entry?.instance?.owner;
    if (!ownerJid) return null;

    return ownerJid.split("@")[0]?.replace(/\D/g, "") || null;
  } catch (error) {
    console.warn("[evolution-api] Não foi possível obter o número da instância:", error);
    return null;
  }
}

/** Envia uma mensagem de texto simples através da instância do tenant. */
export async function sendTextMessage(instanceName: string, phone: string, text: string) {
  return evolutionFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text }),
  });
}

/** Encerra a sessão da instância na Evolution API (logout do WhatsApp). */
export async function logoutInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
}
