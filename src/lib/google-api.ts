/**
 * Integração nativa com Google Calendar + Google Sheets, usada pelos blocos
 * "Agenda: Buscar Horários" / "Agenda: Confirmar Agendamento" do Construtor
 * de Fluxos (ver `flow-engine.ts`) — substitui a necessidade de uma
 * automação externa (n8n/Zapier) pra agendar reuniões e registrar leads.
 *
 * Autenticação: OAuth2 "server-side" (authorization code + refresh token) —
 * o tenant conecta a própria conta Google UMA vez (`/api/google/connect` ->
 * `/api/google/callback`), o refresh token fica guardado criptografado
 * (`GoogleIntegration.refreshTokenEncrypted`, ver `src/lib/encryption.ts`) e
 * o servidor renova o access token sozinho, indefinidamente, sem precisar de
 * nenhuma interação do usuário depois da primeira vez.
 *
 * `calendarId` não precisa ser "primary" — pode ser o e-mail de QUALQUER
 * agenda que a conta conectada tenha permissão de editar (ex: a agenda do
 * gestor comercial, compartilhada via Google Calendar) — a API do Google
 * Calendar já suporta isso nativamente por permissão (ACL), não por token.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`;
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes no .env.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

/** URL de consentimento do Google — `state` carrega o id do tenant, pra reconhecer de quem é o callback. */
export function getGoogleAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // necessário pra receber um refresh_token
    prompt: "consent", // força reconsentir mesmo se já autorizou antes — garante que um refresh_token novo sempre venha (o Google só devolve refresh_token na primeira vez que NÃO força prompt=consent)
    scope: SCOPES,
    state,
  });
}

/** Troca o `code` do callback OAuth pelos tokens + descobre o e-mail da conta conectada. */
export async function exchangeCodeForTokens(code: string): Promise<{ refreshToken: string; email: string | null }> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "O Google não retornou um refresh token. Isso acontece se a conta já tinha autorizado o app antes sem revogar — desconecte o acesso em myaccount.google.com/permissions e tente novamente."
    );
  }
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const info = await oauth2.userinfo.get();
    email = info.data.email ?? null;
  } catch {
    // Não crítico — a conexão funciona mesmo sem exibir o e-mail.
  }

  return { refreshToken: tokens.refresh_token, email };
}

/** Cliente OAuth2 autenticado para um tenant — renova o access token sozinho a cada chamada, via o refresh token salvo. */
async function getAuthenticatedClientForUser(userId: string) {
  const integration = await prisma.googleIntegration.findUnique({ where: { userId } });
  if (!integration) return null;

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decrypt(integration.refreshTokenEncrypted) });
  return { client, integration };
}

export async function saveGoogleIntegration(userId: string, refreshToken: string, email: string | null) {
  await prisma.googleIntegration.upsert({
    where: { userId },
    create: { userId, refreshTokenEncrypted: encrypt(refreshToken), googleEmail: email },
    update: { refreshTokenEncrypted: encrypt(refreshToken), googleEmail: email },
  });
}

export type TimeSlot = { start: Date; end: Date };

/**
 * Offset (em minutos) de um fuso IANA em relação a UTC, no instante dado —
 * calculado via `Intl` (funciona em qualquer runtime Node, sem depender de
 * biblioteca externa de timezone) em vez de `Date.setHours`, que usa o fuso
 * do PRÓPRIO SERVIDOR — normalmente UTC em produção (Vercel), o que geraria
 * horários comerciais errados pro tenant se usado direto (ex: "9h" viraria
 * 9h UTC = 6h em São Paulo).
 */
function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

/** Constrói o instante UTC correspondente a um horário local (ano/mês/dia/hora/minuto) num fuso IANA. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const approx = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const offsetMinutes = getTimezoneOffsetMinutes(approx, timeZone);
  return new Date(Date.UTC(year, month, day, hour, minute, 0) - offsetMinutes * 60000);
}

/** "Hoje" (ano/mês/dia) na perspectiva do fuso do tenant, não do servidor. */
function todayInTimezone(timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return { year: Number(map.year), month: Number(map.month) - 1, day: Number(map.day) };
}

/**
 * Gera candidatos a horário dentro do horário comercial, para os próximos
 * `daysAhead` dias ÚTEIS (pula sábado/domingo — feriados não são
 * considerados, limitação conhecida), e devolve os primeiros `slotsWanted`
 * que estiverem livres na agenda (via `freebusy.query`). Não agenda nada —
 * só consulta.
 */
export async function findAvailableSlots(
  userId: string,
  opts: {
    daysAhead: number;
    slotsWanted: number;
    slotDurationMinutes: number;
    businessHourStart: number; // ex: 9
    businessHourEnd: number; // ex: 18
    /** Não oferece horários a menos de X horas do momento atual. */
    minLeadHours: number;
  }
): Promise<{ ok: true; slots: TimeSlot[]; timezone: string } | { ok: false; error: string }> {
  const auth = await getAuthenticatedClientForUser(userId);
  if (!auth) return { ok: false, error: "Google Agenda não conectado para este tenant." };
  const { client, integration } = auth;

  const now = new Date();
  const earliestAllowed = new Date(now.getTime() + opts.minLeadHours * 60 * 60 * 1000);
  const timeZone = integration.timezone;

  // Monta a lista de dias úteis candidatos, contados no fuso do tenant (não
  // no fuso do servidor) — usa meio-dia UTC como cursor só pra navegar
  // ano/mês/dia sem se preocupar com hora, a conversão de verdade pro
  // horário comercial acontece depois, por slot, via `zonedTimeToUtc`.
  const today = todayInTimezone(timeZone);
  const businessDays: { year: number; month: number; day: number }[] = [];
  const cursor = new Date(Date.UTC(today.year, today.month, today.day, 12, 0, 0));
  while (businessDays.length < opts.daysAhead) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay(); // 0 = domingo, 6 = sábado
    if (weekday !== 0 && weekday !== 6) {
      businessDays.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth(), day: cursor.getUTCDate() });
    }
  }

  const firstDay = businessDays[0];
  const lastDay = businessDays[businessDays.length - 1];
  const windowStart = zonedTimeToUtc(firstDay.year, firstDay.month, firstDay.day, 0, 0, timeZone);
  const windowEnd = zonedTimeToUtc(lastDay.year, lastDay.month, lastDay.day, 23, 59, timeZone);

  const calendar = google.calendar({ version: "v3", auth: client });

  let busyPeriods: { start: string; end: string }[] = [];
  try {
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        timeZone: integration.timezone,
        items: [{ id: integration.calendarId }],
      },
    });
    busyPeriods = (freebusy.data.calendars?.[integration.calendarId]?.busy ?? []) as { start: string; end: string }[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[google-api] Falha ao consultar freebusy:", message);
    return { ok: false, error: `Falha ao consultar a agenda: ${message}` };
  }

  function overlapsBusy(start: Date, end: Date): boolean {
    return busyPeriods.some((busy) => start < new Date(busy.end) && end > new Date(busy.start));
  }

  const slots: TimeSlot[] = [];
  for (const day of businessDays) {
    if (slots.length >= opts.slotsWanted) break;
    for (let hour = opts.businessHourStart; hour < opts.businessHourEnd; hour += opts.slotDurationMinutes / 60) {
      if (slots.length >= opts.slotsWanted) break;
      const wholeHour = Math.floor(hour);
      const minutes = Math.round((hour - wholeHour) * 60);
      const start = zonedTimeToUtc(day.year, day.month, day.day, wholeHour, minutes, timeZone);
      const end = new Date(start.getTime() + opts.slotDurationMinutes * 60 * 1000);

      if (start < earliestAllowed) continue;
      if (overlapsBusy(start, end)) continue;
      slots.push({ start, end });
    }
  }

  return { ok: true, slots, timezone: timeZone };
}

/** Cria o evento (com Google Meet) na agenda conectada e devolve o link do Meet. */
export async function createCalendarEvent(
  userId: string,
  params: { summary: string; description: string; start: Date; end: Date }
): Promise<{ ok: true; eventLink: string; meetLink: string | null; timezone: string } | { ok: false; error: string }> {
  const auth = await getAuthenticatedClientForUser(userId);
  if (!auth) return { ok: false, error: "Google Agenda não conectado para este tenant." };
  const { client, integration } = auth;

  const calendar = google.calendar({ version: "v3", auth: client });

  try {
    const response = await calendar.events.insert({
      calendarId: integration.calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.start.toISOString(), timeZone: integration.timezone },
        end: { dateTime: params.end.toISOString(), timeZone: integration.timezone },
        conferenceData: {
          createRequest: {
            requestId: `flow-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetEntry = response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
    return {
      ok: true,
      eventLink: response.data.htmlLink ?? "",
      meetLink: meetEntry?.uri ?? null,
      timezone: integration.timezone,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[google-api] Falha ao criar evento:", message);
    return { ok: false, error: `Falha ao criar o evento na agenda: ${message}` };
  }
}

/**
 * Acrescenta uma linha ao final de uma aba da planilha conectada — `sheet`
 * escolhe entre a aba de leads ou a de sessões configurada em
 * `GoogleIntegration` (ver seção "Integração Google" em Configurações), não
 * um nome de aba cru, pra sempre respeitar o que o tenant configurou.
 */
export async function appendSheetRow(
  userId: string,
  params: { sheet: "leads" | "sessions"; values: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getAuthenticatedClientForUser(userId);
  if (!auth) return { ok: false, error: "Google Agenda não conectado para este tenant." };
  const { client, integration } = auth;

  if (!integration.spreadsheetId) {
    return { ok: false, error: "Nenhuma planilha configurada para este tenant." };
  }

  const sheetName = params.sheet === "leads" ? integration.leadsSheetName : integration.sessionsSheetName;
  const sheets = google.sheets({ version: "v4", auth: client });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: integration.spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [params.values] },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[google-api] Falha ao gravar na planilha:", message);
    return { ok: false, error: `Falha ao gravar na planilha: ${message}` };
  }
}
