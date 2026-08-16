import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
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
        };
      },
    }),
  ],
});
