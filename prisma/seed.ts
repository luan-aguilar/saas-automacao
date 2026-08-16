/**
 * Seed inicial: cria o primeiro usuário MASTER (admin) do sistema.
 * Execute com: npm run db:seed
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_MASTER_EMAIL ?? "admin@suaempresa.com";
  const password = process.env.SEED_MASTER_PASSWORD ?? "TrocarSenha123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuário MASTER já existe: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const master = await prisma.user.create({
    data: {
      name: "Administrador",
      email,
      passwordHash,
      role: Role.MASTER,
      mustChangePassword: true,
      config: {
        create: {
          systemPrompt:
            "Você é um assistente virtual educado e objetivo. Responda de forma clara e curta.",
        },
      },
      whatsappConnection: {
        create: {},
      },
    },
  });

  console.log("Usuário MASTER criado com sucesso:");
  console.log(`  Email: ${master.email}`);
  console.log(`  Senha temporária: ${password}`);
  console.log("  Troque a senha no primeiro acesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
