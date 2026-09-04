import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/profile/logout-all-sessions — invalida QUALQUER sessão (JWT) já
 * aberta da própria conta MASTER que chamou este endpoint, incrementando
 * `sessionVersion`. Existe porque os ex-sócios do Luan tinham login/senha do
 * MASTER antes da separação — trocar a senha não derruba sessões já abertas
 * (NextAuth aqui usa JWT stateless), então isso cobre esse buraco.
 *
 * Restrito a MASTER de propósito (é o único caso de uso hoje) e só afeta o
 * PRÓPRIO usuário que chama — nunca invalida sessão de outro MASTER, CLIENTE
 * ou FUNCIONARIO. Ver checagem de `sessionVersion` no callback `jwt` de
 * `src/auth.ts`.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "MASTER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
