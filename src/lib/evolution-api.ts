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

export class EvolutionApiError extends Error {
  /** Status HTTP da resposta da Evolution API, quando disponível (ex: 404 = instância não existe). */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

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

/**
 * Timeout estrito para qualquer chamada à Evolution API. A VPS pode ficar
 * lenta ou travada (ex: instância presa reconectando) e, sem isso, uma
 * requisição de gerenciamento (logout/delete) podia ficar pendente por muito
 * tempo, segurando a resposta da rota e deixando a UI travada em estados
 * como "Desconectando...". 4s é suficiente para uma VPS saudável responder e
 * curto o bastante para nunca travar a experiência do usuário.
 */
const EVOLUTION_TIMEOUT_MS = 4000;

async function evolutionFetch(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = getEvolutionConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EVOLUTION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // Header oficial da Global API Key da Evolution API v2 — é o único
        // que ela espera para autenticação de gerenciamento de instância.
        // NÃO adicionar `Authentication: Bearer` aqui: a Evolution API tenta
        // validar esse header como um JWT de instância (não a chave global),
        // e responde 401 Unauthorized quando ele não é um JWT válido.
        apikey: apiKey,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const message = isTimeout
      ? `Evolution API não respondeu em ${EVOLUTION_TIMEOUT_MS}ms (timeout).`
      : error instanceof Error
        ? error.message
        : "Erro de rede desconhecido";
    throw new EvolutionApiError(`Não foi possível conectar à Evolution API (${message}).`);
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
    const body = json as { message?: unknown; error?: unknown } | null;
    const messageField = body?.message ?? body?.error;
    const message = Array.isArray(messageField)
      ? messageField.join(", ")
      : (messageField as string | undefined) ?? raw ?? `HTTP ${response.status}`;

    // 403 quase sempre significa que o header `apikey` (WHATSAPP_SERVICE_TOKEN)
    // não bate com a AUTHENTICATION_API_KEY configurada na Evolution API da
    // VPS — deixamos essa pista explícita no log em vez de um 403 genérico.
    const hint =
      response.status === 403
        ? " — verifique se WHATSAPP_SERVICE_TOKEN (.env) corresponde exatamente à AUTHENTICATION_API_KEY configurada na instância da Evolution API na VPS."
        : "";

    throw new EvolutionApiError(
      `Evolution API respondeu ${response.status}: ${message}${hint}`,
      response.status
    );
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
 * Eventos assinados no webhook da instância — ver `setWebhook`/`createInstance`.
 * Envia tanto o formato minúsculo-com-ponto (usado por algumas versões da
 * Evolution API v2) quanto o SCREAMING_SNAKE_CASE (usado por outras) para os
 * mesmos três eventos — a Evolution API ignora os nomes que não reconhece,
 * então isso cobre as duas variações sem risco de duplicar disparos.
 */
const WEBHOOK_EVENTS = [
  "messages.upsert",
  "messages.update",
  "connection.update",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
];

/**
 * Cria a instância do zero na Evolution API e retorna o QR Code gerado.
 *
 * Deliberadamente NÃO faz fallback para `/instance/connect/{instanceName}`
 * quando a criação falha (ex: "instância já existe") — esse fallback antigo
 * escondia um bug real: se a instância anterior ainda estivesse de fato
 * conectada na VPS (ex: uma desconexão anterior não foi bem-sucedida),
 * `/instance/connect` simplesmente reaproveitava a sessão já aberta e não
 * devolvia QR Code nenhum, fazendo a tela "Conectar" parecer travada e o
 * polling de status revalidar como "Conectado" logo em seguida.
 *
 * Por isso o chamador (`POST /api/whatsapp/connect`) deve sempre chamar
 * `deleteInstance(instanceName)` antes desta função, para garantir uma
 * criação limpa. Se ainda assim a criação falhar, o erro é propagado — é
 * melhor reportar isso claramente do que fingir sucesso reaproveitando uma
 * sessão desatualizada.
 *
 * Se `webhookUrl` for informado, o webhook já é embutido no próprio payload
 * de criação (algumas versões da Evolution API v2 aceitam isso e evitam uma
 * segunda chamada) — o chamador deve, de todo modo, também chamar
 * `setWebhook` explicitamente logo em seguida, já que nem toda versão honra
 * esse campo em `/instance/create`.
 */
export async function createInstance(instanceName: string, webhookUrl?: string): Promise<EvolutionQrResult> {
  const created = await evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...(webhookUrl
        ? {
            webhook: {
              url: webhookUrl,
              enabled: true,
              byEvents: false,
              base64: false,
              events: WEBHOOK_EVENTS,
            },
          }
        : {}),
    }),
  });

  return extractQr(created);
}

export type EvolutionConnectionState = "open" | "connecting" | "close" | "unknown";

/**
 * Consulta o estado atual da instância (`open` = conectado, `close` =
 * desconectado/sem sessão). Se a Evolution API responder 404 (instância não
 * existe mais — ex: foi apagada em uma desconexão anterior), tratamos isso
 * como `"close"`: não há nenhuma chave de sessão ativa do Baileys para esse
 * tenant, então do ponto de vista do app é exatamente o mesmo que "fechado".
 * Outros erros (rede, 5xx) continuam sendo propagados, para o chamador poder
 * distinguir "sem sessão" de "Evolution API instável agora".
 */
export async function getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
  let data: { instance?: { state?: string }; state?: string } | null;
  try {
    data = (await evolutionFetch(`/instance/connectionState/${instanceName}`, {
      method: "GET",
    })) as { instance?: { state?: string }; state?: string } | null;
  } catch (error) {
    if (error instanceof EvolutionApiError && error.status === 404) return "close";
    throw error;
  }

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

/**
 * Envia uma mensagem com botões de resposta rápida (até 3, limite do próprio
 * WhatsApp). `buttons` é a lista de textos exibidos em cada botão — o `id` de
 * cada botão é o índice (como string), usado depois para reconhecer qual
 * opção o contato escolheu na resposta.
 */
export async function sendButtonsMessage(
  instanceName: string,
  phone: string,
  title: string,
  buttons: string[]
) {
  return evolutionFetch(`/message/sendButtons/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      title,
      buttons: buttons.map((label, index) => ({
        type: "reply",
        displayText: label,
        id: String(index),
      })),
    }),
  });
}

export type EvolutionListItem = { id: string; title: string; description?: string };

/**
 * Envia uma mensagem de lista (até 10 itens, limite do próprio WhatsApp).
 * Todos os itens são agrupados em uma única seção — o Construtor de Fluxos
 * hoje não modela seções separadas.
 */
export async function sendListMessage(
  instanceName: string,
  phone: string,
  title: string,
  buttonText: string,
  items: EvolutionListItem[]
) {
  return evolutionFetch(`/message/sendList/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      title,
      buttonText,
      sections: [
        {
          title,
          rows: items.map((item) => ({
            title: item.title,
            description: item.description ?? "",
            rowId: item.id,
          })),
        },
      ],
    }),
  });
}

/**
 * Configura (ou atualiza) a URL de webhook da instância na Evolution API,
 * para que ela avise esta aplicação quando o contato mandar uma mensagem
 * (`MESSAGES_UPSERT`), quando uma mensagem enviada mudar de status
 * (`MESSAGES_UPDATE`) ou quando a conexão da instância mudar de estado
 * (`CONNECTION_UPDATE`). Chamado automaticamente ao criar/conectar a
 * instância — ver `POST /api/whatsapp/connect`.
 */
export async function setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
  await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS,
      },
    }),
  });
}

/**
 * Encerra a sessão da instância na Evolution API (logout do WhatsApp).
 *
 * Importante: isso apenas fecha o socket do Baileys — as credenciais da
 * sessão (auth state) continuam salvas no storage da Evolution API, então a
 * instância pode se RECONECTAR SOZINHA automaticamente pouco depois (o
 * Baileys tenta restabelecer a conexão usando as credenciais em cache). Para
 * uma desconexão definitiva, use `deleteInstance` também (ver
 * `/api/whatsapp/disconnect`).
 */
export async function logoutInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
}

/**
 * Apaga a instância por completo na Evolution API, destruindo as
 * credenciais/tokens de sessão salvos (auth state do Baileys). Ao contrário
 * de `logoutInstance`, isso impede que a instância se reconecte sozinha,
 * pois não sobra nenhuma sessão em cache para reutilizar — a próxima conexão
 * exige um novo QR Code do zero (via `createInstance`).
 */
export async function deleteInstance(instanceName: string): Promise<void> {
  await evolutionFetch(`/instance/delete/${instanceName}`, { method: "DELETE" });
}
