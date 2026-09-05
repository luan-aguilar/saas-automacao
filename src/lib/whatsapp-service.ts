/**
 * Camada de envio de mensagens usada pelo motor de fluxo (`flow-engine.ts`).
 * Cada tenant usa um de dois provedores (`WhatsappConnection.provider`):
 *   - EVOLUTION: sessão não-oficial (Baileys) via `evolution-api.ts`,
 *     instância própria em `WhatsappConnection.externalSessionId`.
 *   - CLOUD_API: API oficial da Meta via `whatsapp-cloud-api.ts`, usando
 *     `cloudApiPhoneNumberId` + token de acesso (criptografado no banco).
 * `resolveSendTarget` decide qual usar uma única vez por envio — nenhuma das
 * 3 funções de envio abaixo precisa saber o provedor por conta própria.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import {
  sendTextMessage,
  sendButtonsMessage,
  sendListMessage,
  fetchInstancePhoneNumber,
  instanceNameFor,
  type EvolutionListItem,
  type EvolutionConnectionState,
} from "@/lib/evolution-api";
import {
  sendCloudApiTextMessage,
  sendCloudApiButtonsMessage,
  sendCloudApiListMessage,
  type CloudApiListItem,
} from "@/lib/whatsapp-cloud-api";
import type { WhatsappConnection } from "@prisma/client";

type SendTarget =
  | { provider: "EVOLUTION"; instanceName: string }
  | { provider: "CLOUD_API"; phoneNumberId: string; accessToken: string };

/** Resolve, uma única vez, qual provedor/credenciais usar pra enviar por este tenant — e avisa (sem lançar) se a conexão não estiver CONNECTED. */
async function resolveSendTarget(fromUserId: string): Promise<SendTarget> {
  const connection = await prisma.whatsappConnection.findUnique({ where: { userId: fromUserId } });

  if (connection?.status !== "CONNECTED") {
    console.warn(
      "[whatsapp-service] Enviando mensagem com conexão fora do status CONNECTED — pode falhar:",
      { fromUserId, status: connection?.status ?? "SEM_CONEXAO" }
    );
  }

  if (connection?.provider === "CLOUD_API") {
    if (!connection.cloudApiPhoneNumberId || !connection.cloudApiAccessTokenEncrypted) {
      throw new Error(
        `[whatsapp-service] Tenant ${fromUserId} está configurado como CLOUD_API mas falta phoneNumberId ou token de acesso.`
      );
    }
    return {
      provider: "CLOUD_API",
      phoneNumberId: connection.cloudApiPhoneNumberId,
      accessToken: decrypt(connection.cloudApiAccessTokenEncrypted),
    };
  }

  return { provider: "EVOLUTION", instanceName: connection?.externalSessionId ?? instanceNameFor(fromUserId) };
}

/**
 * Extrai o ID da mensagem devolvido pelo provedor ao enviar — usado para
 * reconhecer, quando o webhook ecoa essa mesma mensagem de volta (só existe
 * no Evolution API, como um evento `fromMe`), que ela já foi registrada por
 * nós (evita duplicar no histórico da Central de Atendimento — ver
 * `resolveOutboundFromMeMessage` no webhook). Extração best-effort: se o
 * formato não bater, simplesmente não achamos o ID e o webhook cai no
 * fallback por conteúdo+tempo. Só usado no caminho EVOLUTION — o adaptador
 * CLOUD_API já devolve o id pronto (`whatsapp-cloud-api.ts` não ecoa envio
 * próprio via webhook, então não precisa desse fallback).
 */
function extractSentMessageId(response: unknown): string | undefined {
  const data = response as { key?: { id?: string } } | null;
  return data?.key?.id;
}

/**
 * Envia uma mensagem de texto simples via WhatsApp para um número específico,
 * usando o provedor pareado pelo tenant (Evolution API ou API oficial da Meta).
 *
 * @param fromUserId  ID do usuário (tenant) cuja conexão deve ser usada para enviar.
 * @param toPhone     Número do destinatário (com DDI, ex: "5511999998888").
 * @param message     Texto da mensagem já formatado (variáveis já interpoladas).
 */
export async function sendWhatsappMessage(
  fromUserId: string,
  toPhone: string,
  message: string
): Promise<{ ok: true; externalId?: string } | { ok: false; error: string }> {
  try {
    const target = await resolveSendTarget(fromUserId);
    if (target.provider === "CLOUD_API") {
      const { externalId } = await sendCloudApiTextMessage(target.phoneNumberId, target.accessToken, toPhone, message);
      return { ok: true, externalId };
    }
    const response = await sendTextMessage(target.instanceName, toPhone, message);
    return { ok: true, externalId: extractSentMessageId(response) };
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
    const target = await resolveSendTarget(fromUserId);
    if (target.provider === "CLOUD_API") {
      await sendCloudApiButtonsMessage(target.phoneNumberId, target.accessToken, toPhone, title, buttons);
      return { ok: true };
    }
    await sendButtonsMessage(target.instanceName, toPhone, title, buttons);
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
    const target = await resolveSendTarget(fromUserId);
    if (target.provider === "CLOUD_API") {
      await sendCloudApiListMessage(target.phoneNumberId, target.accessToken, toPhone, title, buttonText, items as CloudApiListItem[]);
      return { ok: true };
    }
    await sendListMessage(target.instanceName, toPhone, title, buttonText, items);
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
