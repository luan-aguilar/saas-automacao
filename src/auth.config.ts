import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

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

      // Somente MASTER pode acessar /clients e /templates
      if (
        (pathname.startsWith("/clients") || pathname.startsWith("/templates")) &&
        auth.user.role !== "MASTER"
      ) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      // Funcionário (conta de equipe criada pelo dono do tenant) não edita o
      // fluxo de automação — só o dono decide como o robô conversa.
      if (pathname.startsWith("/flows") && auth.user.role === "FUNCIONARIO") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      // "Minha Equipe" é só do dono do tenant (CLIENTE) — MASTER audita pelo
      // detalhe do cliente em /clients, e um FUNCIONARIO não gerencia outros.
      if (pathname.startsWith("/team") && auth.user.role !== "CLIENTE") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.tenantOwnerId = user.tenantOwnerId;
      }
      return token;
    },
    session({ session, token }) {
      // O NextAuth v5 (beta) nem sempre propaga corretamente a extensão de
      // tipos de `next-auth/jwt` (declarada em `src/types/next-auth.d.ts`)
      // para o parâmetro `token` deste callback, fazendo o TypeScript
      // enxergar `token.id`/`token.role`/`token.mustChangePassword` como
      // `unknown`. Como esses campos são preenchidos por nós mesmos no
      // callback `jwt` abaixo, fazemos o cast explícito aqui.
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.tenantOwnerId = token.tenantOwnerId as string | null;
      }
      return session;
    },
  },
  providers: [], // providers reais são definidos em src/auth.ts
} satisfies NextAuthConfig;
