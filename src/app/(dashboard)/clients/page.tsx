import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
      whatsappConnection: { select: { status: true, phoneNumber: true } },
    },
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
        initialClients={clients.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
    </div>
  );
}
