/**
 * Template pré-definido do Construtor de Fluxos para o nicho
 * "Salão de Beleza / Estética".
 *
 * Contém a estrutura completa (nodes + edges) pronta para ser carregada no
 * canvas do React Flow com um clique (botão "Carregar Template: Salão de
 * Beleza" em `src/components/flows/flow-builder.tsx`) e, a partir daí, salva
 * e conectada normalmente ao WhatsApp do tenant (mesmo fluxo de
 * salvar/ativar usado por qualquer outro fluxo).
 *
 * Fluxo modelado:
 *   TRIGGER (primeira mensagem)
 *     -> NO_1 Boas-vindas (botões: Ver Serviços/Preços | Endereço e Horários | Falar com Atendente)
 *       -> [Ver Serviços/Preços] NO_2 Lista de categorias (Cabelo | Unhas | Cílios | Sobrancelhas)
 *            -> [Cabelo] NO_3 Sondagem/pré-avaliação -> NO_4 Agente de coleta (IA)
 *            -> [demais categorias] NO_4 Agente de coleta (IA) diretamente
 *              -> NO_5 Notificação de lead qualificado para o dono do salão
 *       -> [Endereço e Horários] mensagem com endereço/horário de atendimento
 *       -> [Falar com Atendente] mensagem de transferência + alerta para o salão
 *
 * O roteamento por opção escolhida usa blocos de Condição (`condition`)
 * avaliando a variável `ultima_resposta` (resposta mais recente do contato)
 * — o mesmo padrão já usado no restante do Construtor de Fluxos.
 */

import type { Node, Edge } from "@xyflow/react";

export const BEAUTY_SALON_TEMPLATE_NAME = "Salão de Beleza / Estética — Home Concept";

const SALON_ADDRESS = "Alameda São Caetano, 71 – Bairro Jardim, Santo André/SP";
const SALON_HOURS = "Terça a Sábado, das 09h às 18h";

/**
 * Mensagem de notificação de lead qualificado enviada para o número do dono
 * do salão (bloco NO_5). Formato exigido — não alterar o texto/emoji sem
 * necessidade, pois é o modelo acordado com o cliente.
 */
const LEAD_NOTIFICATION_MESSAGE = `🔥 *NOVO LEAD QUALIFICADO* 🔥
📅 *Data:* {{data_atual}}
👤 *Nome:* {{lead_nome}}
📱 *WhatsApp:* {{lead_phone}}
🏢 *Serviço procurado:* {{servico_categoria}}
👥 *Subtipo do serviço:* {{servico_subtipo}}
⏰ *Agendamento solicitado:* {{data_hora_agendamento}}
🎯 *Resumo do atendimento:* {{resumo_ia}}`;

/** System prompt do bloco "Agente de Coleta" (NO_4, Resposta IA). */
const AI_COLLECTION_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. Sua função nesta etapa da conversa é conduzir uma coleta de informações amigável e objetiva com a cliente, sem inventar preços ou disponibilidade. Siga estes passos, adaptando-se ao ritmo da conversa:

1. Identifique o nome da cliente (pergunte educadamente se ainda não souber).
2. Confirme se ela deseja agendar mais de um serviço na mesma visita.
3. Colete a preferência de dia e horário para o agendamento, lembrando que o atendimento funciona de ${SALON_HOURS}.
4. Informe o endereço do salão quando for pertinente: ${SALON_ADDRESS}.

Seja calorosa, use poucos emojis e mantenha as mensagens curtas. Ao final, resuma o que foi coletado para confirmar com a cliente antes de encerrar esta etapa.`;

function textNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  message: string,
  buttons: string[] = []
): Node {
  return {
    id,
    type: "staticMessage",
    position,
    data: { label, message, interactiveType: "buttons", buttons },
  };
}

function conditionNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  value: string
): Node {
  return {
    id,
    type: "condition",
    position,
    data: { label, variable: "ultima_resposta", operator: "CONTAINS", value },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: "yes" | "no"
): Edge {
  return {
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    type: "deletable",
    animated: true,
  };
}

const NODES: Node[] = [
  // TRIGGER — dispara em qualquer primeira mensagem recebida.
  {
    id: "bs-trigger",
    type: "trigger",
    position: { x: 520, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  // NO_1 — Boas-vindas + botões.
  textNode(
    "bs-welcome",
    { x: 480, y: 160 },
    "Boas-vindas",
    "Olá, maravilhosa! 🤩 Seja bem-vinda ao Home Concept. Como posso te ajudar hoje?",
    ["Ver Serviços/Preços", "Endereço e Horários", "Falar com Atendente"]
  ),

  // Roteamento da escolha de NO_1.
  conditionNode("bs-cond-servicos", { x: 480, y: 340 }, "Escolheu Ver Serviços/Preços?", "Serviços"),

  // NO_2 — List Message com as categorias de serviço.
  {
    id: "bs-categorias",
    type: "staticMessage",
    position: { x: 140, y: 520 },
    data: {
      label: "Categorias de serviço",
      message:
        "Perfeito! 💇‍♀️ Aqui estão nossas categorias de serviços. Escolha uma opção abaixo para ver mais detalhes:",
      interactiveType: "list",
      buttons: [],
      listButtonText: "Ver Opções de Serviços",
      listItems: [
        { id: "cabelo", title: "Cabelo", description: "Mechas, Mega Hair, Progressiva, Corte, Tratamentos..." },
        { id: "unhas", title: "Unhas", description: "Manicure, Alongamento Gel/Fibra, Banho de Gel..." },
        { id: "cilios", title: "Cílios", description: "Extensão Fox Eyes, Lash Lifting..." },
        { id: "sobrancelhas", title: "Sobrancelhas", description: "Brow Lamination, Design com Henna..." },
      ],
    },
  },

  // Ramo "Endereço e Horários".
  conditionNode("bs-cond-endereco", { x: 800, y: 520 }, "Escolheu Endereço e Horários?", "Endereço"),
  textNode(
    "bs-endereco-msg",
    { x: 800, y: 700 },
    "Endereço e horários",
    `📍 Estamos na ${SALON_ADDRESS}.\n\n🕐 Horário de atendimento: ${SALON_HOURS}.\n\nSe quiser, posso te ajudar a agendar um horário agora mesmo! 😉`
  ),

  // Ramo "Falar com Atendente" (o que sobrar depois de descartar Serviços/Endereço).
  textNode(
    "bs-transfer-msg",
    { x: 1080, y: 700 },
    "Transferência para atendente",
    "Só um instantinho! 💬 Já vou te conectar com uma de nossas atendentes."
  ),
  {
    id: "bs-transfer-alert",
    type: "alertNotification",
    position: { x: 1080, y: 880 },
    data: {
      label: "Alerta: atendimento humano solicitado",
      recipientPhone: "",
      message: "🙋 *Cliente pediu atendimento humano*\n📱 *WhatsApp:* {{lead_phone}}\n🕐 *Horário:* {{data_atual}}",
    },
  },

  // Ramo "Cabelo": pré-avaliação antes do agente de coleta.
  conditionNode("bs-cond-cabelo", { x: 140, y: 700 }, "Escolheu a categoria Cabelo?", "Cabelo"),

  // NO_3 — Sondagem e pré-avaliação (Cabelo/Progressiva).
  textNode(
    "bs-pre-avaliacao",
    { x: -40, y: 880 },
    "Pré-avaliação (Cabelo)",
    "Maravilhosa! 🤩 Antes de passar valores, realizamos uma pré-avaliação gratuita. Seu cabelo possui alguma química (coloração, descoloração, progressiva, selagem, botox)? Para eu te orientar certinho, envie por aqui uma foto do seu cabelo atual e, se tiver, uma foto de referência do resultado que você deseja. 📸"
  ),

  // NO_4 — Agente de coleta (Resposta IA).
  {
    id: "bs-ia-coleta",
    type: "aiResponse",
    position: { x: 300, y: 1060 },
    data: {
      label: "Agente de coleta (IA)",
      useGlobalPrompt: false,
      customPrompt: AI_COLLECTION_PROMPT,
    },
  },

  // NO_5 — Notificação do lead qualificado para o dono do salão.
  {
    id: "bs-lead-alert",
    type: "alertNotification",
    position: { x: 300, y: 1240 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhone: "",
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("bs-e-trigger-welcome", "bs-trigger", "bs-welcome"),
  edge("bs-e-welcome-cond-servicos", "bs-welcome", "bs-cond-servicos"),

  // "Ver Serviços/Preços" -> lista de categorias.
  edge("bs-e-cond-servicos-yes", "bs-cond-servicos", "bs-categorias", "yes"),
  // Caso contrário, verifica se foi "Endereço e Horários".
  edge("bs-e-cond-servicos-no", "bs-cond-servicos", "bs-cond-endereco", "no"),

  edge("bs-e-cond-endereco-yes", "bs-cond-endereco", "bs-endereco-msg", "yes"),
  // Última opção restante: "Falar com Atendente".
  edge("bs-e-cond-endereco-no", "bs-cond-endereco", "bs-transfer-msg", "no"),
  edge("bs-e-transfer-msg-alert", "bs-transfer-msg", "bs-transfer-alert"),

  // Categorias -> verifica se é "Cabelo" (única com pré-avaliação dedicada).
  edge("bs-e-categorias-cond-cabelo", "bs-categorias", "bs-cond-cabelo"),
  edge("bs-e-cond-cabelo-yes", "bs-cond-cabelo", "bs-pre-avaliacao", "yes"),
  edge("bs-e-cond-cabelo-no", "bs-cond-cabelo", "bs-ia-coleta", "no"),
  edge("bs-e-pre-avaliacao-ia", "bs-pre-avaliacao", "bs-ia-coleta"),

  edge("bs-e-ia-coleta-alert", "bs-ia-coleta", "bs-lead-alert"),
];

/**
 * Retorna uma cópia independente (deep clone) dos nodes/edges do template,
 * pronta para ser jogada diretamente em `setNodes`/`setEdges` do Construtor
 * de Fluxos. Usamos clone via JSON para garantir que cada carregamento do
 * template gere objetos novos (evitando dois fluxos compartilharem a mesma
 * referência de array/objeto em memória).
 */
export function createBeautySalonTemplate(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(NODES)) as Node[],
    edges: JSON.parse(JSON.stringify(EDGES)) as Edge[],
  };
}
