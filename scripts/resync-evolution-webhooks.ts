/**
 * Reconfigura o webhook (lista de eventos assinados) de TODAS as instâncias
 * já conectadas via Evolution API (provider EVOLUTION), sem precisar
 * desconectar/reparear o WhatsApp de ninguém.
 *
 * Necessário sempre que `WEBHOOK_EVENTS` (em `src/lib/evolution-api.ts`)
 * ganha um evento novo — instâncias já conectadas continuam com a lista
 * antiga até alguém chamar `setWebhook` de novo, e isso não acontece
 * sozinho (só roda dentro do fluxo de `POST /api/whatsapp/connect`).
 *
 * Uso: npx tsx scripts/resync-evolution-webhooks.ts
 */
import { prisma } from "../src/lib/prisma";
import { setWebhook } from "../src/lib/evolution-api";

async function main() {
  const webhookUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/webhooks/whatsapp`
    : "https://saas-automacao-eight.vercel.app/api/webhooks/whatsapp";

  const connections = await prisma.whatsappConnection.findMany({
    where: { provider: "EVOLUTION", externalSessionId: { not: null } },
    include: { user: { select: { name: true, email: true } } },
  });

  if (connections.length === 0) {
    console.log("Nenhuma conexão Evolution API encontrada.");
    return;
  }

  for (const connection of connections) {
    if (!connection.externalSessionId) continue;
    try {
      await setWebhook(connection.externalSessionId, webhookUrl);
      console.log(`OK: ${connection.user.name} (${connection.user.email}) — instância ${connection.externalSessionId}`);
    } catch (error) {
      console.error(`FALHOU: ${connection.user.name} (${connection.user.email}) —`, error);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
