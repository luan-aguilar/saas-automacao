import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";

// POST /api/google/disconnect — remove a conexão Google do tenant. Não
// revoga o token no lado do Google (o usuário pode fazer isso em
// myaccount.google.com/permissions se quiser) — só apaga o registro local,
// mesma filosofia do "Desconectar" do WhatsApp.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);
  await prisma.googleIntegration.deleteMany({ where: { userId: tenantId } });

  return NextResponse.json({ ok: true });
}
