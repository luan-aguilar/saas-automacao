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
 * ---------------------------------------------------------------------------
 * DIVISÃO DE RESPONSABILIDADES (importante para quem for editar este arquivo)
 * ---------------------------------------------------------------------------
 * O fluxo é deliberadamente dividido em duas camadas bem separadas:
 *
 * 1) NÓ DE LISTA (WhatsApp, `bs-categorias`) — a ÚNICA interface "clicável"
 *    do fluxo. Mostra exclusivamente as 4 categorias principais + a opção
 *    "Informações e Endereço" (5 itens no total). Ele NÃO lista sub-serviços
 *    — isso é proposital, pois a API de lista do WhatsApp tem espaço/
 *    caracteres limitados e o catálogo completo (com dezenas de sub-serviços
 *    por categoria) não caberia de forma legível em botões/lista.
 *
 * 2) NÓ DE IA (`bs-ia-coleta`) — assume a conversa em texto corrido assim que
 *    a cliente escolhe uma categoria na lista. É o `customPrompt` deste nó
 *    (constante `AI_COLLECTION_PROMPT` abaixo) que contém o catálogo
 *    completo de sub-serviços, as informações gerais do salão e as regras de
 *    interação (múltiplos serviços, coleta/validação de fotos, navegação
 *    "Voltar", confirmação obrigatória antes de notificar o salão).
 *
 * TRIGGER (primeira mensagem)
 *   -> NO_1 Lista de categorias (Cabelo | Unhas | Cílios | Sobrancelhas | Informações e Endereço)
 *        -> [Informações e Endereço] mensagem estática com endereço/horários/avaliação gratuita
 *        -> [qualquer categoria de serviço] NO_IA Agente de coleta (texto fluido, catálogo completo)
 *             -> NO_ALERTA Notificação de lead qualificado para o dono do salão
 *
 * O roteamento da escolha da lista usa um bloco de Condição (`condition`)
 * avaliando a variável `ultima_resposta` (resposta/título selecionado mais
 * recente do contato) — o mesmo padrão já usado no restante do Construtor de
 * Fluxos.
 */

import type { Node, Edge } from "@xyflow/react";

export const BEAUTY_SALON_TEMPLATE_NAME = "Salão de Beleza / Estética — Home Concept";

const SALON_ADDRESS = "Home Concept - Alameda São Caetano, 71 – Bairro Jardim, Santo André/SP";
const SALON_HOURS = "Terça a sábado, das 09h às 18h (exceto feriados)";

/**
 * Mensagem de notificação de lead qualificado enviada para o número do dono
 * do salão (nó de alerta final). Formato exigido — não alterar o
 * texto/emoji/ordem dos campos sem necessidade, pois é o modelo acordado com
 * o cliente. Inclui os links das fotos coletadas pela IA (quando aplicável).
 */
const LEAD_NOTIFICATION_MESSAGE = `🔥 *NOVO LEAD QUALIFICADO* 🔥
📅 *Data:* {{data_atual}}
👤 *Nome:* {{lead_nome}}
📱 *WhatsApp:* {{lead_phone}}
🏢 *Serviço procurado:* {{servico_categoria}}
👥 *Subtipo(s) do serviço:* {{servico_subtipo}}
⏰ *Agendamento solicitado:* {{data_hora_agendamento}}
📸 *Foto Cabelo Atual:* {{foto_atual_url}}
📸 *Foto Referência:* {{foto_referencia_url}}
🎯 *Resumo do Atendimento:* {{resumo_ia}}`;

/**
 * System prompt do "Agente de Coleta" (nó de Resposta IA). Assume a conversa
 * em texto corrido assim que a cliente escolhe uma categoria na lista do
 * WhatsApp — é aqui, e não na interface de botões/lista, que vive o catálogo
 * completo de sub-serviços e as regras de atendimento.
 */
const AI_COLLECTION_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. A cliente acabou de escolher uma categoria de serviço em uma lista do WhatsApp (Cabelo, Unhas, Cílios ou Sobrancelhas). A partir daqui, VOCÊ assume a conversa inteiramente por texto corrido: apresente os sub-serviços da categoria escolhida (usando o catálogo abaixo) para a cliente escolher, e conduza toda a coleta de informações necessárias para o agendamento.

=====================================================
CATÁLOGO COMPLETO DE SUB-SERVIÇOS (use exatamente estas opções — não invente novas)
=====================================================

💇‍♀️ CABELO:
Avaliação para Mechas, Avaliação para Mega Hair, Mechas, Mega Hair, Hair Contour, Coloração, Botox Capilar, Progressiva, Detox Capilar, Corte, Escova, Babyliss, Tratamentos e Cronogramas Capilares, Nutrição, Hidratação, Matização, Plástica dos Fios, Selagem, Ozonioterapia Capilar, Decapagem, Tonalização, Maquiagem, Penteado, Outros.

💅 UNHAS:
Manicure, Pedicure, Alongamento em Gel, Alongamento em Fibra, Manutenção (15 a 20 dias), Manutenção (acima de 30 dias), Banho de Gel, Blindagem das Mãos, Blindagem dos Pés, Decoração (mãos ou pés), Esmaltação em Gel (mãos), Esmaltação em Gel (pés), Esmaltação Tradicional, Colocação de Unhas Postiças, Spa dos Pés, Outros.

👁️ CÍLIOS:
Extensão de Cílios – Técnica Fox Eyes, Extensão de Cílios – Demais técnicas, Manutenção – Técnica Fox Eyes, Manutenção – Demais técnicas, Outros.

✏️ SOBRANCELHAS:
Brow Lamination, Dermaplaning, Design com Henna, Epilação de Buço, Hydra Gloss, Lash Lifting, Natural Design, Outros.

ℹ️ INFORMAÇÕES GERAIS (use se a cliente perguntar, mesmo dentro do fluxo de coleta):
- Horários: ${SALON_HOURS}.
- Avaliação: Gratuita.
- Endereço: ${SALON_ADDRESS}.

=====================================================
REGRAS DE INTERAÇÃO (seja resiliente e à prova de erros — a cliente pode responder de forma inesperada a qualquer momento)
=====================================================

a) Múltiplos serviços:
Entenda se a cliente deseja agendar mais de um serviço (ex: "Quero fazer Corte e Manicure") e registre todos os serviços/subtipos mencionados, mesmo que sejam de categorias diferentes.

b) Coleta e validação inteligente de fotos:
- Se algum serviço escolhido envolver Cabelo (Mechas, Mega Hair, Progressiva, Hair Contour, Coloração, Botox Capilar, etc.): peça uma foto do cabelo atual da cliente e, se ela tiver, uma foto de referência do resultado desejado.
- Se a cliente enviar 1 foto, analise a URL recebida, agradeça e pergunte se ela também tem uma foto de referência.
- Se ela disser que só tem 1 foto (ou nenhuma foto de referência), aceite e prossiga normalmente — não insista.
- Se ela disser que não tem nem a foto do próprio cabelo, oriente rapidamente como tirar uma boa foto (boa luz, cabelo solto, de frente e de perfil) e aguarde o envio sem fechar ou abandonar o fluxo.
- Salve os links das imagens recebidas nas variáveis \`foto_atual_url\` e \`foto_referencia_url\`. Se alguma delas não for enviada, preencha o valor como "Não enviada" (nunca deixe em branco).
- Serviços que não envolvem cabelo (Unhas, Cílios, Sobrancelhas) não exigem fotos — não peça.

c) Navegação e botão "Voltar":
Se a cliente digitar "Voltar", "Menu", "Voltar ao menu" ou indicar de qualquer forma que clicou na categoria errada ou quer trocar de assunto, oriente-a gentilmente e reapresente as opções principais em texto (as mesmas 4 categorias + Informações e Endereço), permitindo que ela escolha de novo por texto.

d) Confirmação obrigatória dos dados:
ANTES de disparar a notificação final para o salão, você DEVE exibir esta mensagem de confirmação (preenchendo os colchetes com os dados já coletados) e aguardar a resposta da cliente:

"Maravilhosa, podemos confirmar os dados do seu agendamento? 🤩

• Nome: [Nome do cliente]
• Serviço(s): [Serviço e subtipo selecionados]
• Preferência de Dia/Horário: [Dia e horário informados]

Está tudo certinho ou gostaria de alterar algo?"

Somente após um "Sim" / "Tudo certo" (ou equivalente) da cliente você deve considerar a coleta concluída e acionar a notificação final para o salão (bloco de alerta). Se a cliente pedir para alterar algo, corrija o dado indicado e repita a confirmação antes de prosseguir.

=====================================================
RESUMO DO QUE VOCÊ PRECISA GARANTIR AO FINAL DA COLETA
=====================================================
- Nome da cliente.
- Categoria(s) e subtipo(s) de serviço escolhidos (podendo ser mais de um).
- Preferência de dia e horário, respeitando o funcionamento (${SALON_HOURS}).
- Fotos (quando aplicável a Cabelo), com \`foto_atual_url\` e \`foto_referencia_url\` preenchidas (ou "Não enviada").
- Confirmação explícita da cliente sobre os dados coletados (regra "d" acima).

Seja calorosa, use poucos emojis e mantenha as mensagens curtas e fáceis de responder pelo celular.`;

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
    position: { x: 480, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  // NO_1 — ÚNICA interface de botões/lista do WhatsApp neste fluxo: mostra
  // apenas as 4 categorias principais + "Informações e Endereço" (5 itens).
  // O catálogo completo de sub-serviços NÃO fica aqui — fica no prompt da IA
  // (nó `bs-ia-coleta`), que assume a conversa em texto corrido.
  {
    id: "bs-categorias",
    type: "staticMessage",
    position: { x: 480, y: 160 },
    data: {
      label: "Categorias (Lista WhatsApp)",
      message:
        "Olá, maravilhosa! 🤩 Seja bem-vinda ao Home Concept! Escolha abaixo a categoria de serviço que você procura:",
      interactiveType: "list",
      buttons: [],
      listButtonText: "Ver Categorias",
      listItems: [
        { id: "cabelo", title: "💇‍♀️ Cabelo", description: "Mechas, Mega Hair, Progressiva, Corte e mais" },
        { id: "unhas", title: "💅 Unhas", description: "Manicure, Pedicure, Alongamento e mais" },
        { id: "cilios", title: "👁️ Cílios", description: "Extensão Fox Eyes, Manutenção e mais" },
        { id: "sobrancelhas", title: "✏️ Sobrancelhas", description: "Design, Henna, Lash Lifting e mais" },
        { id: "informacoes", title: "ℹ️ Informações e Endereço", description: "Horários, avaliação e localização" },
      ],
    },
  },

  // Roteamento da escolha de NO_1: "Informações e Endereço" é a única opção
  // respondida sem envolver a IA — as outras 4 (categorias de serviço) vão
  // direto para o Agente de coleta em texto.
  conditionNode("bs-cond-informacoes", { x: 480, y: 340 }, "Escolheu Informações e Endereço?", "Informações"),

  // Ramo "Informações e Endereço".
  {
    id: "bs-info-msg",
    type: "staticMessage",
    position: { x: 760, y: 520 },
    data: {
      label: "Informações e Endereço",
      message: `📍 ${SALON_ADDRESS}\n\n🕐 Horário de atendimento: ${SALON_HOURS}.\n\n✅ A avaliação é gratuita! Se quiser, posso te ajudar a agendar um horário agora mesmo. 😉`,
      interactiveType: "buttons",
      buttons: [],
    },
  },

  // NO_IA — Agente de coleta (Resposta IA). Assume a conversa por texto
  // corrido assim que a cliente escolhe uma categoria de serviço na lista.
  {
    id: "bs-ia-coleta",
    type: "aiResponse",
    position: { x: 200, y: 520 },
    data: {
      label: "Agente de coleta (IA) — catálogo completo",
      useGlobalPrompt: false,
      customPrompt: AI_COLLECTION_PROMPT,
    },
  },

  // NO_ALERTA — Notificação do lead qualificado para o dono do salão.
  {
    id: "bs-lead-alert",
    type: "alertNotification",
    position: { x: 200, y: 700 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhone: "",
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("bs-e-trigger-categorias", "bs-trigger", "bs-categorias"),
  edge("bs-e-categorias-cond-informacoes", "bs-categorias", "bs-cond-informacoes"),

  // "Informações e Endereço" -> mensagem estática (fim do fluxo).
  edge("bs-e-cond-informacoes-yes", "bs-cond-informacoes", "bs-info-msg", "yes"),
  // Qualquer categoria de serviço -> Agente de coleta (IA).
  edge("bs-e-cond-informacoes-no", "bs-cond-informacoes", "bs-ia-coleta", "no"),

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
