/**
 * Camada de envio de mensagens usada pelo motor de fluxo (`flow-engine.ts`).
 * Internamente delega para o cliente da Evolution API (`evolution-api.ts`),
 * usando a instância já pareada do tenant (`WhatsappConnection.externalSessionId`).
 */

import { prisma } from "@/lib/prisma";
import { sendTextMessage, instanceNameFor } from "@/lib/evolution-api";

/**
 * Envia uma mensagem de texto simples via WhatsApp para um número específico,
 * usando a instância da Evolution API pareada por um determinado usuário (tenant).
 *
 * @param fromUserId  ID do usuário (tenant) cuja instância deve ser usada para enviar.
 * @param toPhone     Número do destinatário (com DDI, ex: "5511999998888").
 * @param message     Texto da mensagem já formatado (variáveis já interpoladas).
 */
export async function sendWhatsappMessage(
  fromUserId: string,
  toPhone: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const connection = await prisma.whatsappConnection.findUnique({ where: { userId: fromUserId } });
    const instanceName = connection?.externalSessionId ?? instanceNameFor(fromUserId);

    if (connection?.status !== "CONNECTED") {
      console.warn(
        "[whatsapp-service] Enviando mensagem com instância fora do status CONNECTED — pode falhar:",
        { fromUserId, status: connection?.status ?? "SEM_CONEXAO" }
      );
    }

    await sendTextMessage(instanceName, toPhone, message);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[whatsapp-service] Erro ao enviar mensagem:", errorMessage);
    return { ok: false, error: errorMessage };
  }
}
