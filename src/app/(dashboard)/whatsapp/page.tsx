import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { QrDisplay } from "@/components/whatsapp/qr-display";

export default async function WhatsappPage() {
  const session = await auth();
  const connection = await prisma.whatsappConnection.findUnique({
    where: { userId: session!.user.id },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Conexão WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Pareie o número que o robô utilizará para enviar e receber mensagens.
        </p>
      </div>

      <QrDisplay
        initial={{
          status: connection?.status ?? "DISCONNECTED",
          phoneNumber: connection?.phoneNumber ?? null,
          qrCode: connection?.status === "QR_PENDING" ? connection?.qrCode ?? null : null,
          qrExpiresAt: connection?.qrExpiresAt?.toISOString() ?? null,
          lastConnectedAt: connection?.lastConnectedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
