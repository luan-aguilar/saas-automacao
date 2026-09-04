import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getConnectionState } from "@/lib/evolution-api";
import { syncConnectionState } from "@/lib/whatsapp-service";
import { ClientTable } from "@/components/clients/client-table";

export default async function ClientsPage() {
  const session = await auth();
  if (session?.user.role !== "MASTER") {
    redirect("/dashboard");
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENTE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      whatsappConnection: true,
    },
  });

  // `WhatsappConnection.status` só era corrigido de verdade quando a Evolution
  // API conseguia entregar o evento CONNECTION_UPDATE pro nosso webhook — em
  // uma API não-oficial (Baileys) isso às vezes falha silenciosamente, e o
  // MASTER via um status desatualizado nesta lista (ex: cliente conectado de
  // verdade aparecendo como "DISCONNECTED"). Igual ao que `GET
  // /api/whatsapp/status` já faz pro próprio tenant, consultamos a Evolution
  // API ao vivo pra cada cliente com instância pareada sempre que o MASTER
  // abre esta tela — `allSettled` pra uma Evolution API lenta/fora do ar não
  // travar a lista inteira, cada cliente mantém o último status conhecido se
  // a checagem dele falhar.
  const withLiveStatus = await Promise.allSettled(
    clients.map(async (client) => {
      const connection = client.whatsappConnection;
      if (!connection?.externalSessionId) return client;
      const state = await getConnectionState(connection.externalSessionId);
      const synced = await syncConnectionState(client.id, connection, state);
      return { ...client, whatsappConnection: synced };
    })
  );

  const clientsWithLiveStatus = clients.map((client, i) => {
    const result = withLiveStatus[i];
    return result.status === "fulfilled" ? result.value : client;
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Clientes</h2>
        <p className="text-sm text-muted-foreground">
          Crie, edite e desative contas de clientes. Ao criar, uma senha temporária é gerada para
          envio via WhatsApp.
        </p>
      </div>
      <ClientTable
        initialClients={clientsWithLiveStatus.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
    </div>
  );
}
