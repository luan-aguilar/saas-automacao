/**
 * Camada de envio de mensagens usada pelo motor de fluxo (`flow-engine.ts`).
 * Internamente delega para o cliente da Evolution API (`evolution-api.ts`),
 * usando a instância já pareada do tenant (`WhatsappConnection.externalSessionId`).
 */

import { prisma } from "@/lib/prisma";
import {
  sendTextMessage,
  sendButtonsMessage,
  sendListMessage,
  instanceNameFor,
  type EvolutionListItem,
} from "@/lib/evolution-api";

/** Resolve o nome de instância do tenant e avisa (sem lançar) se ela não estiver conectada. */
async function resolveInstance(fromUserId: string): Promise<string> {
  const connection = await prisma.whatsappConnection.findUnique({ where: { userId: fromUserId } });
  const instanceName = connection?.externalSessionId ?? instanceNameFor(fromUserId);

  if (connection?.status !== "CONNECTED") {
    console.warn(
      "[whatsapp-service] Enviando mensagem com instância fora do status CONNECTED — pode falhar:",
      { fromUserId, status: connection?.status ?? "SEM_CONEXAO" }
    );
  }

  return instanceName;
}

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
    const instanceName = await resolveInstance(fromUserId);
    await sendTextMessage(instanceName, toPhone, message);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[whatsapp-service] Erro ao enviar mensagem:", errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/** Envia uma mensagem com botões de resposta rápida (até 3) para o contato do tenant. */
export async function sendWhatsappButtons(
  fromUserId: string,
  toPhone: string,
  title: string,
  buttons: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const instanceName = await resolveInstance(fromUserId);
    await sendButtonsMessage(instanceName, toPhone, title, buttons);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[whatsapp-service] Erro ao enviar mensagem com botões:", errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/** Envia uma mensagem de lista (até 10 itens) para o contato do tenant. */
export async function sendWhatsappList(
  fromUserId: string,
  toPhone: string,
  title: string,
  buttonText: string,
  items: EvolutionListItem[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const instanceName = await resolveInstance(fromUserId);
    await sendListMessage(instanceName, toPhone, title, buttonText, items);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[whatsapp-service] Erro ao enviar mensagem de lista:", errorMessage);
    return { ok: false, error: errorMessage };
  }
}
