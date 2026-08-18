/**
 * Camada de envio de mensagens usada pelo motor de fluxo (`flow-engine.ts`).
 * Internamente delega para o cliente da Evolution API (`evolution-api.ts`),
 * usando a instância já pareada do tenant (`WhatsappConnection.externalSessionId`).
 */

import { prisma } from "@/lib/prisma";
import type { WhatsappConnection } from "@prisma/client";
import {
  sendTextMessage,
  sendButtonsMessage,
  sendListMessage,
  fetchInstancePhoneNumber,
  instanceNameFor,
  type EvolutionListItem,
  type EvolutionConnectionState,
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

/**
 * Aplica ao registro do tenant uma mudança de estado de conexão vinda da
 * Evolution API — usada tanto pelo polling client-side (`GET
 * /api/whatsapp/status`, a cada ~3s enquanto a tela /whatsapp estiver
 * aberta) quanto pelo push do webhook (`CONNECTION_UPDATE`, disparado pela
 * Evolution API assim que o Baileys detecta a mudança, inclusive quando o
 * próprio celular desconecta o dispositivo vinculado — sem depender de
 * ninguém estar com a tela /whatsapp aberta no navegador para "descobrir"
 * isso). As duas chamadas compartilham esta mesma lógica de transição de
 * status para nunca divergir sobre o que cada estado da Evolution API
 * significa para o app.
 */
export async function syncConnectionState(
  userId: string,
  connection: WhatsappConnection,
  state: EvolutionConnectionState
): Promise<WhatsappConnection> {
  if (state === "open") {
    const phoneNumber =
      connection.phoneNumber ??
      (connection.externalSessionId ? await fetchInstancePhoneNumber(connection.externalSessionId) : null);

    return prisma.whatsappConnection.update({
      where: { userId },
      data: {
        status: "CONNECTED",
        phoneNumber: phoneNumber ?? connection.phoneNumber,
        qrCode: null,
        lastConnectedAt: new Date(),
      },
    });
  }

  if (state === "close" && connection.status !== "DISCONNECTED") {
    return prisma.whatsappConnection.update({
      where: { userId },
      data: { status: "DISCONNECTED", qrCode: null, lastDisconnectedAt: new Date() },
    });
  }

  if (state === "connecting" && connection.status === "CONNECTED") {
    // A instância caiu e a Evolution API está tentando reconectar sozinha.
    return prisma.whatsappConnection.update({
      where: { userId },
      data: { status: "CONNECTING" },
    });
  }

  // Para "connecting" com status já QR_PENDING/CONNECTING, ou "unknown",
  // mantemos como está — não há nada seguro a fazer com esses estados.
  return connection;
}
