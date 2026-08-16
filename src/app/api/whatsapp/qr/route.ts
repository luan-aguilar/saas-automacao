import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint de WEBHOOK — chamado pelo serviço externo responsável por manter a
 * sessão do WhatsApp (Baileys / whatsapp-web.js), que roda fora da Vercel
 * (ex: Railway, Fly.io, VPS) pois precisa de um processo Node.js persistente
 * com conexão WebSocket contínua — isso não é possível em funções serverless.
 *
 * Fluxo esperado:
 * 1. O usuário clica em "Conectar" na tela /whatsapp.
 * 2. O frontend chama o serviço externo (WHATSAPP_SERVICE_URL) pedindo uma nova sessão.
 * 3. O serviço externo gera o QR Code e faz POST aqui para atualizarmos o banco.
 * 4. O frontend (em polling ou via socket.io) reflete o novo QR Code na tela.
 * 5. Quando o usuário escaneia e o WhatsApp conecta, o serviço externo faz um
 *    novo POST com status "CONNECTED" e o número de telefone pareado.
 */
const webhookSchema = z.object({
  userId: z.string(),
  status: z.enum(["CONNECTING", "QR_PENDING", "CONNECTED", "DISCONNECTED", "ERROR"]),
  qrCode: z.string().optional(), // data URL base64 do QR code (ex: "data:image/png;base64,...")
  phoneNumber: z.string().optional(),
  externalSessionId: z.string().optional(),
});

export async function POST(request: Request) {
  const token = request.headers.get("x-webhook-token");
  if (!token || token !== process.env.WHATSAPP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, status, qrCode, phoneNumber, externalSessionId } = parsed.data;

  await prisma.whatsappConnection.upsert({
    where: { userId },
    create: {
      userId,
      status,
      qrCode: qrCode ?? null,
      qrExpiresAt: qrCode ? new Date(Date.now() + 60_000) : null,
      phoneNumber: phoneNumber ?? null,
      externalSessionId: externalSessionId ?? null,
      lastConnectedAt: status === "CONNECTED" ? new Date() : null,
    },
    update: {
      status,
      ...(qrCode ? { qrCode, qrExpiresAt: new Date(Date.now() + 60_000) } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(externalSessionId ? { externalSessionId } : {}),
      ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}),
      ...(status === "DISCONNECTED" ? { lastDisconnectedAt: new Date() } : {}),
    },
  });

  // TODO: emitir evento via socket.io para atualizar a tela em tempo real
  // ao invés de depender apenas do polling do frontend.

  return NextResponse.json({ ok: true });
}
