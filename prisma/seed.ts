/**
 * Seed do usuário MASTER (admin) do sistema.
 *
 * Idempotente: usa `upsert` pelo e-mail (SEED_MASTER_EMAIL). Se o usuário
 * ainda não existir, ele é criado; se já existir, a senha é FORÇADAMENTE
 * atualizada para o valor de SEED_MASTER_PASSWORD (novo hash bcrypt),
 * garantindo acesso mesmo que a senha atual tenha sido perdida/esquecida.
 *
 * Execute com: npm run db:seed  (ou: npx prisma db seed)
 */
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PROMPT =
  "Você é um assistente virtual educado e objetivo. Responda de forma clara e curta.";

async function main() {
  // Normalizado (minúsculas + sem espaços) para bater exatamente com a
  // normalização feita no login (src/auth.ts) — Postgres compara strings
  // exatamente, então uma diferença de caixa aqui causaria "e-mail ou senha
  // inválidos" mesmo com a senha certa.
  const email = (process.env.SEED_MASTER_EMAIL ?? "admin@suaempresa.com").toLowerCase().trim();
  const password = process.env.SEED_MASTER_PASSWORD ?? "TrocarSenha123!";

  if (!process.env.SEED_MASTER_EMAIL || !process.env.SEED_MASTER_PASSWORD) {
    console.warn(
      "Aviso: SEED_MASTER_EMAIL e/ou SEED_MASTER_PASSWORD não definidos no .env — usando valores padrão."
    );
  }

  // Nunca armazenamos a senha em texto puro — apenas o hash bcrypt vai para o banco.
  const passwordHash = await bcrypt.hash(password, 10);

  const existed = Boolean(await prisma.user.findUnique({ where: { email }, select: { id: true } }));

  const master = await prisma.user.upsert({
    where: { email },
    create: {
      name: "Administrador",
      email,
      passwordHash,
      role: Role.MASTER,
      status: UserStatus.ACTIVE,
      // Como esta é a senha definitiva escolhida via .env (não uma senha
      // temporária gerada pelo sistema), não forçamos troca no primeiro acesso.
      mustChangePassword: false,
      config: {
        create: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
      },
      whatsappConnection: {
        create: {},
      },
    },
    update: {
      passwordHash,
      role: Role.MASTER,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  if (existed) {
    console.log(`Usuário MASTER já existia — senha atualizada com sucesso.`);
  } else {
    console.log("Usuário MASTER criado com sucesso.");
  }
  console.log(`  Email: ${master.email}`);
  console.log(`  Role:  ${master.role}`);
  console.log("  A senha em texto puro não é armazenada — apenas o hash bcrypt foi salvo no banco.");
}

main()
  .catch((e) => {
    console.error("Falha ao rodar o seed do usuário MASTER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
