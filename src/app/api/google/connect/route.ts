import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantId } from "@/lib/tenant";
import { getGoogleAuthUrl } from "@/lib/google-api";

// GET /api/google/connect — redireciona pra tela de consentimento do Google.
// `state` carrega o id do tenant, conferido de novo em /api/google/callback.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenantId = getTenantId(session.user);

  let url: string;
  try {
    url = getGoogleAuthUrl(tenantId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar URL de autorização.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
