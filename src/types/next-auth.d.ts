import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
      // Preenchido só para role FUNCIONARIO — ver `src/lib/tenant.ts`.
      tenantOwnerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    mustChangePassword: boolean;
    tenantOwnerId: string | null;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword: boolean;
    tenantOwnerId: string | null;
    // Ver `sessionVersion` em `prisma/schema.prisma` e o callback `jwt` de
    // `src/auth.ts` — usados só pra checagem de "deslogar de todas as sessões".
    sessionVersion?: number;
    sessionRevoked?: boolean;
  }
}
