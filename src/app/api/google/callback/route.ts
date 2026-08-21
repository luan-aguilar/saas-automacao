import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantId } from "@/lib/tenant";
import { exchangeCodeForTokens, saveGoogleIntegration } from "@/lib/google-api";

// GET /api/google/callback — recebe o `code` do Google, troca por um
// refresh token e salva no tenant. Sempre redireciona de volta para
// /settings (com um parâmetro indicando sucesso/erro pra UI mostrar).
export async function GET(request: NextRequest) {
  const session = await auth();
  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  if (!session?.user) {
    settingsUrl.searchParams.set("google_error", "Sessão expirada — faça login novamente e tente conectar de novo.");
    return NextResponse.redirect(settingsUrl);
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    settingsUrl.searchParams.set("google_error", "Conexão cancelada.");
    return NextResponse.redirect(settingsUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const tenantId = getTenantId(session.user);

  if (!code || state !== tenantId) {
    settingsUrl.searchParams.set("google_error", "Falha na verificação da conexão — tente novamente.");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code);
    await saveGoogleIntegration(tenantId, refreshToken, email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao conectar com o Google.";
    console.error("[google/callback] Falha ao trocar código por tokens:", message);
    settingsUrl.searchParams.set("google_error", message);
    return NextResponse.redirect(settingsUrl);
  }

  settingsUrl.searchParams.set("google_connected", "1");
  return NextResponse.redirect(settingsUrl);
}
