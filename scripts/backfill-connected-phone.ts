/**
 * Backfill único: preenche `Chat.connectedPhoneNumber` (campo novo, ver
 * schema.prisma) para conversas criadas ANTES desse campo existir, usando o
 * número atualmente conectado de cada tenant — preserva a visibilidade de
 * quem já está usando o sistema hoje (ex: Home Concept, KFG), já que sem
 * isso o filtro novo em GET /api/chats esconderia o histórico deles.
 *
 * Roda uma vez, manualmente: `npx tsx scripts/backfill-connected-phone.ts`
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const connections = await prisma.whatsappConnection.findMany({
    where: { phoneNumber: { not: null } },
    select: { userId: true, phoneNumber: true },
  });

  console.log(`Encontradas ${connections.length} conexão(ões) com número ativo.`);

  for (const conn of connections) {
    const result = await prisma.chat.updateMany({
      where: { userId: conn.userId, connectedPhoneNumber: null },
      data: { connectedPhoneNumber: conn.phoneNumber },
    });
    console.log(`Tenant ${conn.userId} (${conn.phoneNumber}): ${result.count} conversa(s) atualizada(s).`);
  }

  const stillNull = await prisma.chat.count({ where: { connectedPhoneNumber: null } });
  console.log(`Conversas que continuam sem número (tenant sem conexão ativa): ${stillNull}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
