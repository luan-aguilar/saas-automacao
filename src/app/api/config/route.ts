import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, maskKey } from "@/lib/encryption";

const configSchema = z.object({
  openaiApiKey: z.string().optional(), // vazio = manter a key atual
  systemPrompt: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  aiEnabledDefault: z.boolean(),
});

// GET /api/config — retorna a config do usuário logado (sem expor a API key em texto puro)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const config = await prisma.config.findUnique({ where: { userId: session.user.id } });

  return NextResponse.json({
    config: config
      ? {
          hasApiKey: Boolean(config.openaiApiKeyEncrypted),
          apiKeyPreview: config.openaiApiKeyLast4 ? `sk-...${config.openaiApiKeyLast4}` : null,
          systemPrompt: config.systemPrompt,
          model: config.model,
          temperature: config.temperature,
          aiEnabledDefault: config.aiEnabledDefault,
        }
      : null,
  });
}

// POST /api/config — salva a API key (criptografada) e o system prompt
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { openaiApiKey, systemPrompt, model, temperature, aiEnabledDefault } = parsed.data;

  const data: Record<string, unknown> = {
    systemPrompt,
    model,
    temperature,
    aiEnabledDefault,
  };

  if (openaiApiKey && openaiApiKey.trim().length > 0) {
    data.openaiApiKeyEncrypted = encrypt(openaiApiKey.trim());
    data.openaiApiKeyLast4 = openaiApiKey.trim().slice(-4);
  }

  await prisma.config.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
