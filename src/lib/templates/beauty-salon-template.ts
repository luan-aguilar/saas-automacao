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
 * Historicamente esse template usava um único node de "Lista" do WhatsApp
 * para mostrar as categorias — mas mensagens de Lista têm um bug conhecido e
 * não corrigido na Evolution API (erro `this.isZero is not a function`,
 * reproduzido em v2.3.7 E v2.3.6, issue fechada como "not planned" pelos
 * mantenedores: github.com/EvolutionAPI/evolution-api/issues/2390). Botões
 * (`sendButtons`) funcionam normalmente, mas têm limite de 3 opções — por
 * isso as 4 categorias são paginadas em duas telas de botões que se
 * conectam num loop (ver `NAVEGAÇÃO DE CATEGORIAS` abaixo).
 *
 * O fluxo é dividido em três camadas:
 *
 * 1) NAVEGAÇÃO DE CATEGORIAS (botões, 2 páginas) — `bs-pagina1`/`bs-pagina2`.
 *    Página 1: Cabelo | Unhas | Mais opções ➡️
 *    Página 2: Cílios | Sobrancelhas | ⬅️ Voltar
 *    "Mais opções" e "Voltar" ficam num loop entre as duas páginas até a
 *    cliente escolher uma categoria de verdade.
 *
 *    IMPORTANTE: a cliente pode digitar qualquer texto livre em vez de
 *    clicar num botão — a cadeia de condições checa explicitamente CADA
 *    uma das 3 opções da página (nunca "por eliminação"), e se nenhuma
 *    bater, cai num node de retry (`bs-pagina1-retry`/`bs-pagina2-retry`)
 *    que reenvia os mesmos botões. Antes desta correção, uma resposta que
 *    não batia com nada era tratada por eliminação binária como se fosse a
 *    última opção da página (ex: "bom dia" virava "Unhas" por engano).
 *
 * 2) SUB-SERVIÇOS EM TEXTO PURO (`bs-sub-*`) — assim que uma categoria é
 *    escolhida, envia o catálogo completo daquela categoria como texto
 *    simples, um sub-serviço por linha (sem botões — a API de botões do
 *    WhatsApp não comporta listas longas). Segue automaticamente para a IA.
 *
 * 3) NÓ DE IA (`bs-ia-coleta`) — assume a conversa em texto corrido logo
 *    depois do catálogo ser exibido. O `customPrompt` (constante
 *    `AI_COLLECTION_PROMPT`) mantém o catálogo completo das 4 categorias
 *    (para validar o que a cliente digitar, mesmo se ela mencionar mais de
 *    uma categoria) e as regras de interação (múltiplos serviços, coleta de
 *    fotos, confirmação obrigatória antes do alerta final).
 *
 * TRIGGER (primeira mensagem)
 *   -> Página 1 (Cabelo | Unhas | Mais opções)
 *        -> [Mais opções] Página 2 (Cílios | Sobrancelhas | Voltar)
 *             -> [Voltar] Página 1 (loop)
 *             -> [Cílios/Sobrancelhas] Sub-serviços (texto) -> IA
 *        -> [Cabelo/Unhas] Sub-serviços (texto) -> IA
 *   -> IA (Agente de coleta, texto corrido) -> Notificação de lead qualificado
 *
 * O roteamento usa blocos de Condição (`condition`) avaliando a variável
 * `ultima_resposta` (texto do botão clicado mais recentemente pelo contato).
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

/** Catálogo de sub-serviços por categoria — usado tanto nas mensagens de texto puro quanto no prompt da IA. */
const SUB_SERVICES: Record<"cabelo" | "unhas" | "cilios" | "sobrancelhas", string[]> = {
  cabelo: [
    "Avaliação para Mechas",
    "Avaliação para Mega Hair",
    "Mechas",
    "Mega Hair",
    "Hair Contour",
    "Coloração",
    "Botox Capilar",
    "Progressiva",
    "Detox Capilar",
    "Corte",
    "Escova",
    "Babyliss",
    "Tratamentos e Cronogramas Capilares",
    "Nutrição",
    "Hidratação",
    "Matização",
    "Plástica dos Fios",
    "Selagem",
    "Ozonioterapia Capilar",
    "Decapagem",
    "Tonalização",
    "Maquiagem",
    "Penteado",
    "Outros",
  ],
  unhas: [
    "Manicure",
    "Pedicure",
    "Alongamento em Gel",
    "Alongamento em Fibra",
    "Manutenção (15 a 20 dias)",
    "Manutenção (acima de 30 dias)",
    "Banho de Gel",
    "Blindagem das Mãos",
    "Blindagem dos Pés",
    "Decoração (mãos ou pés)",
    "Esmaltação em Gel (mãos)",
    "Esmaltação em Gel (pés)",
    "Esmaltação Tradicional",
    "Colocação de Unhas Postiças",
    "Spa dos Pés",
    "Outros",
  ],
  cilios: [
    "Extensão de Cílios – Técnica Fox Eyes",
    "Extensão de Cílios – Demais técnicas",
    "Manutenção – Técnica Fox Eyes",
    "Manutenção – Demais técnicas",
    "Outros",
  ],
  sobrancelhas: [
    "Brow Lamination",
    "Dermaplaning",
    "Design com Henna",
    "Epilação de Buço",
    "Hydra Gloss",
    "Lash Lifting",
    "Natural Design",
    "Outros",
  ],
};

/** Monta a mensagem de texto puro (um sub-serviço por linha) enviada logo após a escolha da categoria. */
function subServiceMessage(categoryLabel: string, category: keyof typeof SUB_SERVICES): string {
  return `Ótimo! Esses são os serviços de ${categoryLabel} que trabalhamos:\n\n${SUB_SERVICES[category].join("\n")}`;
}

/**
 * System prompt do "Agente de Coleta" (nó de Resposta IA). Assume a conversa
 * em texto corrido logo depois do catálogo de sub-serviços (texto puro) ser
 * exibido — por isso a instrução abaixo não pede pra IA "apresentar" a
 * lista de novo, só perguntar o que a cliente escolheu. O catálogo completo
 * das 4 categorias continua aqui para a IA validar o que for digitado,
 * mesmo que a cliente cite algo de outra categoria.
 */
const AI_COLLECTION_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. A cliente acabou de escolher uma categoria de serviço (Cabelo, Unhas, Cílios ou Sobrancelhas) e JÁ RECEBEU, em uma mensagem separada, a lista completa dos sub-serviços dessa categoria (um por linha). A partir daqui, VOCÊ assume a conversa inteiramente por texto corrido: comece com uma mensagem curta e calorosa perguntando qual(is) sub-serviço(s) da lista ela deseja (NÃO repita a lista — ela já viu), e conduza toda a coleta de informações necessárias para o agendamento.

=====================================================
CATÁLOGO COMPLETO DE SUB-SERVIÇOS (use exatamente estas opções — não invente novas; serve para você validar o que a cliente disser, mesmo que ela cite outra categoria)
=====================================================

💇‍♀️ CABELO:
${SUB_SERVICES.cabelo.join(", ")}.

💅 UNHAS:
${SUB_SERVICES.unhas.join(", ")}.

👁️ CÍLIOS:
${SUB_SERVICES.cilios.join(", ")}.

✏️ SOBRANCELHAS:
${SUB_SERVICES.sobrancelhas.join(", ")}.

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

c) Navegação e "Voltar" durante a conversa com você:
Se a cliente digitar "Voltar", "Menu", "Voltar ao menu" ou indicar de qualquer forma que quer trocar de categoria/assunto, oriente-a gentilmente e reapresente as 4 categorias em texto (Cabelo, Unhas, Cílios, Sobrancelhas), permitindo que ela escolha de novo por texto (nesse ponto da conversa não há mais botões — a navegação por botões só existe antes de você entrar na conversa).

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
  value: string,
  operator: "CONTAINS" | "EQUALS" = "CONTAINS"
): Node {
  return {
    id,
    type: "condition",
    position,
    data: { label, variable: "ultima_resposta", operator, value },
  };
}

/** Node de mensagem estática em texto puro (sem botões/lista) — sempre segue automaticamente para o próximo node. */
function plainTextNode(id: string, position: { x: number; y: number }, label: string, message: string): Node {
  return {
    id,
    type: "staticMessage",
    position,
    data: { label, message, interactiveType: "buttons", buttons: [] },
  };
}

function edge(id: string, source: string, target: string, sourceHandle?: "yes" | "no"): Edge {
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
    position: { x: 600, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  // PÁGINA 1 de categorias (botões, máx. 3) — Cabelo, Unhas e "Mais opções"
  // pra ver a página 2. Botões funcionam de verdade na Evolution API;
  // mensagens de Lista têm um bug conhecido (ver comentário no topo do arquivo).
  {
    id: "bs-pagina1",
    type: "staticMessage",
    position: { x: 600, y: 160 },
    data: {
      label: "Categorias — Página 1",
      message:
        "Olá, maravilhosa! 🤩 Seja bem-vinda ao Home Concept! Escolha abaixo a categoria de serviço que você procura:\n\n_Não está vendo os botões? Responda com o número:_\n1️⃣ Cabelo   2️⃣ Unhas   3️⃣ Mais opções",
      interactiveType: "buttons",
      buttons: ["💇‍♀️ Cabelo", "💅 Unhas", "Mais opções ➡️"],
    },
  },

  conditionNode("bs-cond-pag1-maisopcoes", { x: 600, y: 320 }, "Clicou em 'Mais opções'?", "Mais opções"),
  conditionNode("bs-cond-pag1-cabelo", { x: 380, y: 460 }, "Escolheu Cabelo?", "Cabelo"),
  conditionNode("bs-cond-pag1-unhas", { x: 200, y: 600 }, "Escolheu Unhas?", "Unhas"),

  // Fallback por número — os botões do WhatsApp têm um bug conhecido do
  // Baileys/Evolution API onde não renderizam no WhatsApp Web/Desktop
  // (mensagem "Não foi possível carregar a mensagem"), mesmo funcionando
  // normalmente no celular. Antes de desistir e cair no retry, checa se a
  // cliente digitou o número da opção (1/2/3) em vez de clicar no botão.
  conditionNode("bs-cond-pag1-digito1", { x: 20, y: 680 }, "Digitou '1' (Cabelo)?", "1", "EQUALS"),
  conditionNode("bs-cond-pag1-digito2", { x: -160, y: 720 }, "Digitou '2' (Unhas)?", "2", "EQUALS"),
  conditionNode("bs-cond-pag1-digito3", { x: -340, y: 760 }, "Digitou '3' (Mais opções)?", "3", "EQUALS"),

  // Retry da página 1 — cai aqui quando a resposta não bateu com NENHUM dos 3
  // botões nem com o número correspondente (ex: a cliente digitou um texto
  // livre qualquer). Reenvia as mesmas opções, em vez de "adivinhar" a
  // categoria por eliminação (foi exatamente esse bug que fez um "bom dia"
  // ser tratado como se fosse "Unhas" antes desta correção).
  {
    id: "bs-pagina1-retry",
    type: "staticMessage",
    position: { x: -340, y: 900 },
    data: {
      label: "Categorias — Página 1 (não entendi)",
      message:
        "Desculpe, não entendi 🙏 Toque em uma das opções abaixo ou responda com o número:\n1️⃣ Cabelo   2️⃣ Unhas   3️⃣ Mais opções",
      interactiveType: "buttons",
      buttons: ["💇‍♀️ Cabelo", "💅 Unhas", "Mais opções ➡️"],
    },
  },

  // PÁGINA 2 de categorias — Cílios, Sobrancelhas e "Voltar" pra página 1
  // (loop entre as duas páginas até a cliente escolher uma categoria).
  {
    id: "bs-pagina2",
    type: "staticMessage",
    position: { x: 820, y: 460 },
    data: {
      label: "Categorias — Página 2",
      message:
        "Mais categorias disponíveis:\n\n_Não está vendo os botões? Responda com o número:_\n1️⃣ Cílios   2️⃣ Sobrancelhas   3️⃣ Voltar",
      interactiveType: "buttons",
      buttons: ["👁️ Cílios", "✏️ Sobrancelhas", "⬅️ Voltar"],
    },
  },

  conditionNode("bs-cond-pag2-voltar", { x: 820, y: 600 }, "Clicou em 'Voltar'?", "Voltar"),
  conditionNode("bs-cond-pag2-cilios", { x: 1040, y: 740 }, "Escolheu Cílios?", "Cílios"),
  conditionNode("bs-cond-pag2-sobrancelhas", { x: 1220, y: 880 }, "Escolheu Sobrancelhas?", "Sobrancelhas"),

  // Fallback por número da página 2 — mesmo princípio do fallback da página 1.
  conditionNode("bs-cond-pag2-digito1", { x: 1400, y: 1000 }, "Digitou '1' (Cílios)?", "1", "EQUALS"),
  conditionNode("bs-cond-pag2-digito2", { x: 1580, y: 1040 }, "Digitou '2' (Sobrancelhas)?", "2", "EQUALS"),
  conditionNode("bs-cond-pag2-digito3", { x: 1760, y: 1080 }, "Digitou '3' (Voltar)?", "3", "EQUALS"),

  // Retry da página 2 — mesmo princípio do retry da página 1 acima.
  {
    id: "bs-pagina2-retry",
    type: "staticMessage",
    position: { x: 1760, y: 1220 },
    data: {
      label: "Categorias — Página 2 (não entendi)",
      message:
        "Desculpe, não entendi 🙏 Toque em uma das opções abaixo ou responda com o número:\n1️⃣ Cílios   2️⃣ Sobrancelhas   3️⃣ Voltar",
      interactiveType: "buttons",
      buttons: ["👁️ Cílios", "✏️ Sobrancelhas", "⬅️ Voltar"],
    },
  },

  // Sub-serviços em texto puro (um por linha) — seguem automaticamente pra IA.
  plainTextNode("bs-sub-cabelo", { x: 100, y: 620 }, "Sub-serviços — Cabelo", subServiceMessage("Cabelo", "cabelo")),
  plainTextNode("bs-sub-unhas", { x: 380, y: 640 }, "Sub-serviços — Unhas", subServiceMessage("Unhas", "unhas")),
  plainTextNode("bs-sub-cilios", { x: 940, y: 900 }, "Sub-serviços — Cílios", subServiceMessage("Cílios", "cilios")),
  plainTextNode(
    "bs-sub-sobrancelhas",
    { x: 1180, y: 900 },
    "Sub-serviços — Sobrancelhas",
    subServiceMessage("Sobrancelhas", "sobrancelhas")
  ),

  // NÓ DE IA — Agente de coleta (Resposta IA). Assume a conversa por texto
  // corrido assim que o catálogo de sub-serviços (texto puro) é exibido.
  {
    id: "bs-ia-coleta",
    type: "aiResponse",
    position: { x: 600, y: 1080 },
    data: {
      label: "Agente de coleta (IA) — catálogo completo",
      useGlobalPrompt: false,
      customPrompt: AI_COLLECTION_PROMPT,
    },
  },

  // NÓ DE ALERTA — Notificação do lead qualificado para o dono do salão.
  {
    id: "bs-lead-alert",
    type: "alertNotification",
    position: { x: 600, y: 1240 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhone: "",
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("bs-e-trigger-pagina1", "bs-trigger", "bs-pagina1"),
  edge("bs-e-pagina1-cond-maisopcoes", "bs-pagina1", "bs-cond-pag1-maisopcoes"),
  // O retry da página 1 reentra na MESMA cadeia de condições da página 1 original.
  edge("bs-e-pagina1retry-cond-maisopcoes", "bs-pagina1-retry", "bs-cond-pag1-maisopcoes"),

  // Página 1: "Mais opções" -> página 2; senão checa Cabelo -> senão checa Unhas
  // -> se não bateu com NENHUM dos 3 botões, reenvia as opções (retry) em vez
  // de adivinhar a categoria.
  edge("bs-e-cond-maisopcoes-yes", "bs-cond-pag1-maisopcoes", "bs-pagina2", "yes"),
  edge("bs-e-cond-maisopcoes-no", "bs-cond-pag1-maisopcoes", "bs-cond-pag1-cabelo", "no"),
  edge("bs-e-cond-cabelo-yes", "bs-cond-pag1-cabelo", "bs-sub-cabelo", "yes"),
  edge("bs-e-cond-cabelo-no", "bs-cond-pag1-cabelo", "bs-cond-pag1-unhas", "no"),
  edge("bs-e-cond-unhas-yes", "bs-cond-pag1-unhas", "bs-sub-unhas", "yes"),
  // Nenhum dos 3 textos bateu — antes de desistir, checa o fallback por número.
  edge("bs-e-cond-unhas-no", "bs-cond-pag1-unhas", "bs-cond-pag1-digito1", "no"),
  edge("bs-e-pag1digito1-yes", "bs-cond-pag1-digito1", "bs-sub-cabelo", "yes"),
  edge("bs-e-pag1digito1-no", "bs-cond-pag1-digito1", "bs-cond-pag1-digito2", "no"),
  edge("bs-e-pag1digito2-yes", "bs-cond-pag1-digito2", "bs-sub-unhas", "yes"),
  edge("bs-e-pag1digito2-no", "bs-cond-pag1-digito2", "bs-cond-pag1-digito3", "no"),
  edge("bs-e-pag1digito3-yes", "bs-cond-pag1-digito3", "bs-pagina2", "yes"),
  edge("bs-e-pag1digito3-no", "bs-cond-pag1-digito3", "bs-pagina1-retry", "no"),

  edge("bs-e-pagina2-cond-voltar", "bs-pagina2", "bs-cond-pag2-voltar"),
  // O retry da página 2 reentra na MESMA cadeia de condições da página 2 original.
  edge("bs-e-pagina2retry-cond-voltar", "bs-pagina2-retry", "bs-cond-pag2-voltar"),

  // Página 2: "Voltar" -> volta pra página 1 (loop); senão checa Cílios -> senão
  // checa Sobrancelhas -> se não bateu com nenhum, reenvia as opções (retry).
  edge("bs-e-cond-voltar-yes", "bs-cond-pag2-voltar", "bs-pagina1", "yes"),
  edge("bs-e-cond-voltar-no", "bs-cond-pag2-voltar", "bs-cond-pag2-cilios", "no"),
  edge("bs-e-cond-cilios-yes", "bs-cond-pag2-cilios", "bs-sub-cilios", "yes"),
  edge("bs-e-cond-cilios-no", "bs-cond-pag2-cilios", "bs-cond-pag2-sobrancelhas", "no"),
  edge("bs-e-cond-sobrancelhas-yes", "bs-cond-pag2-sobrancelhas", "bs-sub-sobrancelhas", "yes"),
  // Nenhum dos 3 textos bateu — antes de desistir, checa o fallback por número.
  edge("bs-e-cond-sobrancelhas-no", "bs-cond-pag2-sobrancelhas", "bs-cond-pag2-digito1", "no"),
  edge("bs-e-pag2digito1-yes", "bs-cond-pag2-digito1", "bs-sub-cilios", "yes"),
  edge("bs-e-pag2digito1-no", "bs-cond-pag2-digito1", "bs-cond-pag2-digito2", "no"),
  edge("bs-e-pag2digito2-yes", "bs-cond-pag2-digito2", "bs-sub-sobrancelhas", "yes"),
  edge("bs-e-pag2digito2-no", "bs-cond-pag2-digito2", "bs-cond-pag2-digito3", "no"),
  edge("bs-e-pag2digito3-yes", "bs-cond-pag2-digito3", "bs-pagina1", "yes"),
  edge("bs-e-pag2digito3-no", "bs-cond-pag2-digito3", "bs-pagina2-retry", "no"),

  // As 4 categorias convergem no mesmo Agente de Coleta (IA).
  edge("bs-e-sub-cabelo-ia", "bs-sub-cabelo", "bs-ia-coleta"),
  edge("bs-e-sub-unhas-ia", "bs-sub-unhas", "bs-ia-coleta"),
  edge("bs-e-sub-cilios-ia", "bs-sub-cilios", "bs-ia-coleta"),
  edge("bs-e-sub-sobrancelhas-ia", "bs-sub-sobrancelhas", "bs-ia-coleta"),

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
