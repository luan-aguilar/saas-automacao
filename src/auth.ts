import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          console.log("[AUTH] Credenciais em formato inválido:", parsed.error.flatten().fieldErrors);
          return null;
        }

        // Normaliza o e-mail (minúsculas + sem espaços) para evitar falsos
        // negativos por diferença de caixa/espaço entre o que foi digitado e
        // o que está salvo no banco (Postgres compara strings exatamente).
        const email = parsed.data.email.toLowerCase().trim();
        const password = parsed.data.password;

        console.log("[AUTH] Tentando login para:", email);

        const user = await prisma.user.findUnique({ where: { email } });
        console.log("[AUTH] Usuário encontrado no banco?:", !!user);

        if (!user) {
          return null;
        }

        if (user.status !== "ACTIVE") {
          console.log("[AUTH] Usuário encontrado, mas está INATIVO:", user.email);
          return null;
        }

        // Campo correto conforme prisma/schema.prisma (model User): passwordHash.
        console.log("[AUTH] Hash de senha presente no registro do usuário?:", !!user.passwordHash);

        // bcryptjs (puro JS, compatível com o runtime Node.js das funções da Vercel).
        const isValid = await bcrypt.compare(password, user.passwordHash);
        console.log("[AUTH] Senha bate?:", isValid);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          tenantOwnerId: user.tenantOwnerId,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Sobrescreve `jwt`/`session` só NESTA instância (Node runtime, usada por
    // `auth()` em API routes/server components) pra checar revogação de
    // sessão contra o banco — o middleware roda em Edge Runtime e usa uma
    // instância separada de `NextAuth(authConfig)` sem essa checagem (não dá
    // pra importar Prisma lá, ver comentário em `auth.config.ts`). Na
    // prática isso significa que uma sessão revogada continua passando pelo
    // gate de navegação do middleware, mas toda chamada de API/servidor que
    // dependa de `session.user.id` passa a falhar como "não autenticado" —
    // suficiente pro objetivo de segurança (cortar o acesso a dados), mesmo
    // sem um redirect imediato pro /login.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user) {
        // Login novo: grava a versão vigente da sessão pra comparar depois.
        token.sessionVersion = params.user.sessionVersion;
        token.sessionRevoked = false;
        return token;
      }
      // Só MASTER paga o custo de uma consulta ao banco a cada request —
      // hoje só o Luan usa esse botão, não vale gerar essa consulta extra
      // pra todo login de CLIENTE/FUNCIONARIO.
      if (token.role === "MASTER" && typeof token.id === "string" && typeof token.sessionVersion === "number") {
        const current = await prisma.user.findUnique({ where: { id: token.id }, select: { sessionVersion: true } });
        token.sessionRevoked = !current || current.sessionVersion !== token.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sessionRevoked) {
        // Não popula os dados de sessão -- rotas que checam `session.user.id`
        // antes de agir tratam isso como "não autenticado" e recusam.
        return session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.tenantOwnerId = token.tenantOwnerId as string | null;
      }
      return session;
    },
  },
});
