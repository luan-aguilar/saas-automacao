/**
 * Cliente HTTP para a API OFICIAL do WhatsApp Business Platform da Meta
 * (Graph API) — usada por tenants cujo número já está registrado na
 * infraestrutura oficial da Meta (ver `WhatsappConnection.provider =
 * "CLOUD_API"`), incompatível com a sessão não-oficial do Evolution API
 * (`evolution-api.ts`). Primeiro caso de uso: KFG (2026-09-04).
 *
 * Ao contrário do Evolution API (uma instância própria, autenticada com uma
 * apikey global da nossa VPS), aqui cada TENANT tem seu próprio
 * `phoneNumberId` + token de acesso (System User, permanente — ver
 * `WhatsappConnection.cloudApiAccessTokenEncrypted`), obtidos manualmente no
 * painel da Meta (Business Manager + Meta for Developers) até termos um
 * fluxo de onboarding próprio (Embedded Signup).
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class WhatsappCloudApiError extends Error {
  /** Status HTTP da resposta da Graph API, quando disponível. */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function cloudApiFetch(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${GRAPH_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const message = isTimeout
      ? "Graph API (Meta) não respondeu em 10s (timeout)."
      : error instanceof Error
        ? error.message
        : "Erro de rede desconhecido";
    throw new WhatsappCloudApiError(`Não foi possível conectar à Graph API da Meta (${message}).`);
  } finally {
    clearTimeout(timeoutId);
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
    const body = json as { error?: { message?: string; error_subcode?: number; code?: number } } | null;
    const message = body?.error?.message ?? raw ?? `HTTP ${response.status}`;
    throw new WhatsappCloudApiError(`Graph API respondeu ${response.status}: ${message}`, response.status);
  }

  return json;
}

type CloudApiSendResponse = { messages?: { id?: string }[] };

/** Extrai o `wamid...` da resposta de envio — usado pra reconhecer o eco de status (`sent`/`delivered`/`read`) no webhook, mesmo papel do `key.id` no Evolution API. */
function extractSentMessageId(response: unknown): string | undefined {
  return (response as CloudApiSendResponse | null)?.messages?.[0]?.id;
}

/** Envia uma mensagem de texto simples via Graph API (WhatsApp Business Platform oficial). */
export async function sendCloudApiTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<{ externalId?: string }> {
  const response = await cloudApiFetch(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  return { externalId: extractSentMessageId(response) };
}

/**
 * Envia um botão interativo (até 3, limite da própria Meta — igual ao
 * WhatsApp comum) — equivalente ao `sendButtonsMessage` do Evolution API.
 * Cada título de botão é limitado a 20 caracteres pela própria Meta; não
 * truncamos aqui (mesmo comportamento do adaptador Evolution — se estourar,
 * a Graph API rejeita e o erro sobe pro chamador).
 */
export async function sendCloudApiButtonsMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  title: string,
  buttons: string[]
): Promise<{ externalId?: string }> {
  const response = await cloudApiFetch(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: title },
        action: {
          buttons: buttons.map((label, index) => ({
            type: "reply",
            reply: { id: String(index), title: label },
          })),
        },
      },
    }),
  });
  return { externalId: extractSentMessageId(response) };
}

export type CloudApiListItem = { id: string; title: string; description?: string };

/** Envia uma mensagem de lista (até 10 itens, limite da própria Meta) — equivalente ao `sendListMessage` do Evolution API. */
export async function sendCloudApiListMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  title: string,
  buttonText: string,
  items: CloudApiListItem[]
): Promise<{ externalId?: string }> {
  const response = await cloudApiFetch(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: title },
        action: {
          button: buttonText,
          sections: [
            {
              title,
              rows: items.map((item) => ({
                id: item.id,
                title: item.title,
                description: item.description ?? "",
              })),
            },
          ],
        },
      },
    }),
  });
  return { externalId: extractSentMessageId(response) };
}

/**
 * Baixa os bytes de uma mídia recebida (imagem, áudio, etc.) — o webhook só
 * traz um `media id`, nunca a URL direta. Dois passos exigidos pela própria
 * Meta: (1) resolver o `id` numa URL temporária assinada (válida por poucos
 * minutos), (2) baixar essa URL com o MESMO token de autorização. Espelha o
 * papel de `getBase64FromMediaMessage` no Evolution API.
 */
export async function getCloudApiMediaBytes(
  accessToken: string,
  mediaId: string
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const meta = (await cloudApiFetch(`/${mediaId}`, accessToken, { method: "GET" })) as {
      url?: string;
      mime_type?: string;
    } | null;
    if (!meta?.url) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let fileResponse: Response;
    try {
      fileResponse = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!fileResponse.ok) return null;

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const mimetype = meta.mime_type ?? fileResponse.headers.get("content-type") ?? "application/octet-stream";
    return { base64: buffer.toString("base64"), mimetype };
  } catch (error) {
    console.warn("[whatsapp-cloud-api] Falha ao baixar mídia da mensagem:", error);
    return null;
  }
}
