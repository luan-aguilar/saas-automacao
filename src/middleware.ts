import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware "edge-safe": só usa authConfig (sem Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protege tudo, exceto assets estáticos, imagens, a rota de auth e os
  // webhooks externos (ex: Evolution API) — estes últimos não têm cookie de
  // sessão e são autenticados por token próprio (ver src/app/api/webhooks/*).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/webhooks).*)"],
};
