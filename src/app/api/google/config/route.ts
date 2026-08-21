import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

// GET /api/google/config — status da conexão + configuração atual (agenda/planilha).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  const integration = await prisma.googleIntegration.findUnique({ where: { userId: tenantId } });

  return NextResponse.json({
    connected: !!integration,
    googleEmail: integration?.googleEmail ?? null,
    calendarId: integration?.calendarId ?? "primary",
    timezone: integration?.timezone ?? "America/Sao_Paulo",
    spreadsheetId: integration?.spreadsheetId ?? "",
    leadsSheetName: integration?.leadsSheetName ?? "Leads",
    sessionsSheetName: integration?.sessionsSheetName ?? "Sessoes",
  });
}

const configSchema = z.object({
  calendarId: z.string().min(1),
  timezone: z.string().min(1),
  spreadsheetId: z.string().optional(),
  leadsSheetName: z.string().min(1),
  sessionsSheetName: z.string().min(1),
});

// POST /api/google/config — atualiza qual agenda consultar e qual planilha/abas usar.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  const existing = await prisma.googleIntegration.findUnique({ where: { userId: tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Conecte sua conta Google primeiro." }, { status: 400 });
  }

  const body = await request.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  await prisma.googleIntegration.update({
    where: { userId: tenantId },
    data: {
      calendarId: parsed.data.calendarId,
      timezone: parsed.data.timezone,
      spreadsheetId: parsed.data.spreadsheetId || null,
      leadsSheetName: parsed.data.leadsSheetName,
      sessionsSheetName: parsed.data.sessionsSheetName,
    },
  });

  return NextResponse.json({ ok: true });
}
