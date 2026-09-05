/**
 * Configura (ou atualiza) um tenant pra usar o provedor CLOUD_API (API
 * oficial do WhatsApp Business Platform da Meta) em vez do EVOLUTION padrão
 * — ver `WhatsappConnection.provider` em `prisma/schema.prisma` e
 * `src/lib/whatsapp-cloud-api.ts`. Não existe UI pra isso ainda (decisão
 * consciente: só a KFG usa isso até agora, não vale construir uma tela só
 * pro primeiro caso de uso).
 *
 * Uso: npx tsx scripts/set-cloud-api-credentials.ts <email-do-tenant> <phoneNumberId> <wabaId> <accessToken>
 *
 * O `accessToken` deve ser o token PERMANENTE de um System User (Meta
 * Business Suite → Configurações do Negócio → Usuários do sistema), não o
 * token temporário de 24h que o painel de teste do Meta for Developers
 * mostra por padrão.
 */
import { prisma } from "../src/lib/prisma";
import { encrypt } from "../src/lib/encryption";

async function main() {
  const [email, phoneNumberId, wabaId, accessToken] = process.argv.slice(2);

  if (!email || !phoneNumberId || !wabaId || !accessToken) {
    console.error(
      "Uso: npx tsx scripts/set-cloud-api-credentials.ts <email-do-tenant> <phoneNumberId> <wabaId> <accessToken>"
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    console.error(`Nenhum usuário encontrado com o e-mail ${email}.`);
    process.exit(1);
  }

  const connection = await prisma.whatsappConnection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: "CLOUD_API",
      status: "CONNECTED",
      cloudApiPhoneNumberId: phoneNumberId,
      cloudApiWabaId: wabaId,
      cloudApiAccessTokenEncrypted: encrypt(accessToken),
    },
    update: {
      provider: "CLOUD_API",
      status: "CONNECTED",
      cloudApiPhoneNumberId: phoneNumberId,
      cloudApiWabaId: wabaId,
      cloudApiAccessTokenEncrypted: encrypt(accessToken),
    },
  });

  console.log(`Tenant ${email} (${user.id}) configurado como CLOUD_API.`);
  console.log(`  phoneNumberId: ${connection.cloudApiPhoneNumberId}`);
  console.log(`  wabaId: ${connection.cloudApiWabaId}`);
  console.log("  accessToken: (criptografado no banco)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
