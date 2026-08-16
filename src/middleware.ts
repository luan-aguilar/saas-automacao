import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware "edge-safe": só usa authConfig (sem Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protege tudo, exceto assets estáticos, imagens e a própria rota de auth
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
