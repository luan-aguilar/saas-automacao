import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware "edge-safe": só usa authConfig (sem Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protege tudo, exceto assets estáticos, imagens, arquivos públicos
  // (qualquer caminho com extensão, ex: logo em public/), a rota de auth, os
  // webhooks externos (ex: Evolution API) e a rota de mídia recebida via
  // WhatsApp (fotos enviadas por contatos, servidas sem login — ver
  // `src/app/api/media/[id]/route.ts`, o link vai direto pro WhatsApp da
  // recepcionista do salão).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/webhooks|api/media|.*\\..*).*)"],
};
