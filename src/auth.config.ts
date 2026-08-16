import type { NextAuthConfig } from "next-auth";

/**
 * Configuração "edge-safe" do NextAuth — usada pelo middleware (Edge Runtime).
 * NÃO importe Prisma/bcrypt aqui, pois o middleware roda no Edge Runtime e
 * essas libs dependem de APIs Node.js. A lógica de autenticação (Credentials
 * provider) fica em `src/auth.ts`, que roda em Node.js normal.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isPublicRoute = pathname === "/login" || pathname.startsWith("/api/auth");
      if (isPublicRoute) return true;

      if (!isLoggedIn) return false;

      // Somente MASTER pode acessar /clientes
      if (pathname.startsWith("/clients") && auth.user.role !== "MASTER") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
  providers: [], // providers reais são definidos em src/auth.ts
} satisfies NextAuthConfig;
