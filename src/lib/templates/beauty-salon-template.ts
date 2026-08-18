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
 * Este template já passou por duas gerações de navegação abandonadas por
 * bugs reais e comprovados em teste ao vivo na Evolution API/Baileys:
 *
 *   1ª geração — node de "Lista" do WhatsApp: erro `this.isZero is not a
 *      function` ao enviar (github.com/EvolutionAPI/evolution-api/issues/2390).
 *   2ª geração — botões (`sendButtons`), paginados em 2 telas (limite de 3
 *      opções por mensagem): a chamada retorna sucesso e chega a ser aceita
 *      pelo servidor do WhatsApp ("SERVER_ACK"), mas a mensagem às vezes
 *      nunca é entregue ao destinatário — nem no celular.
 *
 * A versão atual usa TEXTO PURO com `waitForReply: true` (ver
 * `StaticMessageData` em `src/components/flows/nodes/types.ts` — permite que
 * uma mensagem de texto simples pause o fluxo esperando resposta, sem
 * depender de botões/lista). Texto puro não tem limite de opções por
 * mensagem, então as 5 opções (4 categorias + "Outros assuntos") cabem numa
 * ÚNICA tela — não precisa mais de paginação.
 *
 * O fluxo é dividido em três camadas:
 *
 * 1) MENU DE CATEGORIAS (`bs-menu`, texto puro, `waitForReply: true`) — as 5
 *    opções de uma vez: 1-Cabelo, 2-Unhas, 3-Cílios, 4-Sobrancelhas,
 *    5-Outros assuntos. A cliente pode responder com o número OU o nome por
 *    extenso — a cadeia de condições checa explicitamente CADA opção (nunca
 *    "por eliminação"), e se nenhuma bater, cai em `bs-menu-retry` (reenvia
 *    o mesmo menu). Antes desta correção (num design anterior deste
 *    template), uma resposta que não batia com nada era tratada por
 *    eliminação binária como se fosse a última opção — esse bug não existe
 *    mais aqui.
 *
 * 2) SUB-SERVIÇOS EM TEXTO PURO E NUMERADO (`bs-sub-*`) — assim que uma
 *    categoria é escolhida, envia o catálogo NUMERADO daquela categoria
 *    (sem a opção solta "Outros" — quem quiser outro assunto já escolhe
 *    isso no menu principal) e TAMBÉM pausa esperando resposta
 *    (`waitForReply: true`). Isso é importante: como o node já espera a
 *    cliente responder ANTES de acionar a IA, o primeiro turno da IA já
 *    recebe a resposta de verdade da cliente (ex: "quero manicure e um
 *    alongamento") em vez de só o clique no menu anterior — por isso a IA
 *    não precisa mais mandar uma saudação genérica logo em seguida
 *    ("Oi! Que bom ter você aqui...") duplicando mensagem.
 *
 * 3) NÓ DE IA (`bs-ia-coleta`) — assume a conversa em texto corrido já com a
 *    resposta real da cliente em mãos (ou, se ela escolheu "Outros
 *    assuntos", sem nenhum catálogo prévio — nesse caso específico a IA
 *    ainda precisa cumprimentar e perguntar como ajudar, é o único cenário
 *    em que isso faz sentido). O `customPrompt` (constante
 *    `AI_COLLECTION_PROMPT`) mantém o catálogo completo das 4 categorias
 *    (para validar o que a cliente digitar) e as regras de interação
 *    (múltiplos serviços, coleta de fotos, confirmação obrigatória antes do
 *    alerta final).
 *
 * TRIGGER (primeira mensagem)
 *   -> Menu (1-Cabelo | 2-Unhas | 3-Cílios | 4-Sobrancelhas | 5-Outros assuntos)
 *        -> [Outros assuntos] IA (sem catálogo prévio — cumprimenta e pergunta)
 *        -> [Cabelo/Unhas/Cílios/Sobrancelhas] Sub-serviços (texto numerado,
 *           pausa esperando resposta) -> IA (já com a resposta real da cliente)
 *   -> IA (Agente de coleta, texto corrido) -> Notificação de lead qualificado
 *
 * O roteamento usa blocos de Condição (`condition`) avaliando a variável
 * `ultima_resposta` (texto da resposta mais recente do contato).
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
 * Catálogo de sub-serviços por categoria — usado tanto nas mensagens de
 * texto numerado quanto no prompt da IA. Sem a opção solta "Outros": quem
 * tem um pedido fora do catálogo já escolhe "Outros assuntos" no menu
 * principal, que vai direto para a IA sem passar por um catálogo específico.
 */
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
  ],
  cilios: [
    "Extensão de Cílios – Técnica Fox Eyes",
    "Extensão de Cílios – Demais técnicas",
    "Manutenção – Técnica Fox Eyes",
    "Manutenção – Demais técnicas",
  ],
  sobrancelhas: ["Brow Lamination", "Dermaplaning", "Design com Henna", "Epilação de Buço", "Hydra Gloss", "Lash Lifting", "Natural Design"],
};

const KEYCAP_DIGITS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

/**
 * Converte um número inteiro positivo numa sequência de emojis de "keycap"
 * (ex: 7 -> "7️⃣", 23 -> "2️⃣3️⃣"). Não existe um emoji nativo para números de
 * dois dígitos, então a convenção usada (a mesma que a IA recebe instrução de
 * seguir no prompt) é encadear um emoji por dígito, sem espaço entre eles.
 */
function emojiNumber(n: number): string {
  return String(n)
    .split("")
    .map((digit) => KEYCAP_DIGITS[Number(digit)])
    .join("");
}

/**
 * Monta a mensagem de texto puro e NUMERADO (com emojis de número, ex: 1️⃣ 2️⃣
 * 3️⃣) enviada logo após a escolha da categoria — já inclui a pergunta final
 * ("Quais sub-serviços você gostaria de agendar?") dentro da própria
 * mensagem, para a IA não precisar mandar essa pergunta de novo como uma
 * segunda mensagem separada.
 */
function subServiceMessage(categoryLabel: string, category: keyof typeof SUB_SERVICES): string {
  const numbered = SUB_SERVICES[category].map((item, index) => `${emojiNumber(index + 1)} ${item}`).join("\n");
  return `Ótimo! Esses são os serviços de ${categoryLabel} que trabalhamos:\n\n${numbered}\n\nQuais sub-serviços você gostaria de agendar? Pode me dizer o número ou o nome — se precisar de ajuda, estou à disposição! 😊`;
}

/**
 * System prompt do "Agente de Coleta" (nó de Resposta IA). Duas situações
 * diferentes podem trazer a cliente até aqui (ver instrução inicial do
 * prompt): ela já respondeu com o(s) sub-serviço(s) escolhidos (não precisa
 * cumprimentar de novo) ou escolheu "Outros assuntos" e ainda não disse nada
 * específico (aí sim a IA cumprimenta e pergunta). O catálogo completo das 4
 * categorias continua aqui para a IA validar o que for digitado, mesmo que a
 * cliente cite algo de outra categoria.
 */
const AI_COLLECTION_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. A cliente já recebeu uma mensagem anterior — o catálogo numerado da categoria escolhida (Cabelo, Unhas, Cílios ou Sobrancelhas), ou um convite genérico caso ela tenha escolhido "Outros assuntos" — e a mensagem mais recente dela JÁ É a resposta real, dizendo o que ela quer. NÃO cumprimente nem pergunte de novo o que ela quer — confirme rapidamente o que ela disse e siga direto para a coleta das próximas informações (regras abaixo).

A partir daqui, você assume a conversa inteiramente por texto corrido e conduz toda a coleta de informações necessárias para o agendamento.

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

c) Navegação durante a conversa com você:
Se a cliente digitar "Voltar" ou "Menu", o SISTEMA (não você) já detecta isso automaticamente e reenvia o menu de categorias original, sempre formatado do mesmo jeito — você nem chega a ser chamada nesses casos. Mas se ela indicar de outra forma que quer trocar de categoria/assunto sem usar essas palavras (ex: citar diretamente "unha" ou "cílios" no meio da conversa), aí sim é você quem responde: confirme a nova categoria e siga a coleta normalmente para ela, seguindo a regra de formatação abaixo (regra "d") se precisar listar os sub-serviços de novo.

d) Formatação de qualquer lista de opções (IMPORTANTE):
Toda vez que você apresentar uma lista de opções para a cliente escolher — os sub-serviços de uma categoria que ela citou depois de já estar conversando com você, ou as categorias ao reapresentá-las (regra "c"), ou qualquer outra lista — formate SEMPRE em lista numerada usando EMOJIS de número, nunca números seguidos de ponto, um item por linha, exatamente assim:
1️⃣ Primeiro item
2️⃣ Segundo item
3️⃣ Terceiro item
Emojis de cada dígito (0 a 9): 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣. Para números de dois dígitos (10 em diante, ex: a lista de Cabelo tem 23 itens), não existe um emoji único — junte o emoji de cada dígito sem espaço entre eles: 10 = "1️⃣0️⃣", 23 = "2️⃣3️⃣". NUNCA use "1.", "2)", "-" ou qualquer outro estilo de marcador em vez do emoji, e NUNCA liste várias opções em um parágrafo corrido separado por vírgulas — no WhatsApp isso vira um bloco de texto gigante e ilegível pelo celular. Isso vale mesmo que o catálogo desta mensagem esteja escrito em vírgulas — a formatação de vírgulas aqui é só para você consultar, não para copiar no formato de resposta.

e) Confirmação obrigatória dos dados:
ANTES de disparar a notificação final para o salão, você DEVE exibir esta mensagem de confirmação (preenchendo os colchetes com os dados já coletados) e aguardar a resposta da cliente:

"Maravilhosa, podemos confirmar os dados do seu agendamento? 🤩

• Nome: [Nome do cliente]
• Serviço(s): [Serviço e subtipo selecionados]
• Preferência de Dia/Horário: [Dia e horário informados]

Está tudo certinho ou gostaria de alterar algo?"

Somente após um "Sim" / "Tudo certo" (ou equivalente) da cliente você deve considerar a coleta concluída e acionar a notificação final para o salão (bloco de alerta). Se a cliente pedir para alterar algo, corrija o dado indicado e repita a confirmação antes de prosseguir.

f) Nomes EXATOS das variáveis (IMPORTANTE — a notificação final para o salão usa estas chaves para preencher o texto; se você usar um nome diferente, o dado NÃO aparece na notificação):
No campo "variables" do JSON de resposta (ver contrato de formato abaixo), sempre que tiver o dado, preencha usando exatamente estas chaves:
- \`lead_nome\`: nome completo da cliente, confirmado por ela.
- \`servico_categoria\`: categoria(s) de serviço escolhidas (ex: "Cabelo, Unhas").
- \`servico_subtipo\`: subtipo(s) específicos escolhidos dentro da(s) categoria(s) (ex: "Progressiva, Manicure").
- \`data_hora_agendamento\`: dia e horário de preferência informados pela cliente (texto livre, ex: "Sábado de manhã").
- \`resumo_ia\`: um resumo curto (1-2 frases) do atendimento, para o salão entender o pedido rapidamente.
- \`foto_atual_url\` / \`foto_referencia_url\`: já cobertas na regra "b" acima.
Não se preocupe com \`lead_phone\` nem \`data_atual\` — essas duas já são preenchidas automaticamente pelo sistema, você não precisa (nem consegue) defini-las.

=====================================================
RESUMO DO QUE VOCÊ PRECISA GARANTIR AO FINAL DA COLETA
=====================================================
- Nome da cliente (variável \`lead_nome\`).
- Categoria(s) e subtipo(s) de serviço escolhidos, podendo ser mais de um (\`servico_categoria\` / \`servico_subtipo\`).
- Preferência de dia e horário, respeitando o funcionamento (${SALON_HOURS}) (\`data_hora_agendamento\`).
- Fotos (quando aplicável a Cabelo), com \`foto_atual_url\` e \`foto_referencia_url\` preenchidas (ou "Não enviada").
- Um resumo curto do atendimento (\`resumo_ia\`).
- Confirmação explícita da cliente sobre os dados coletados (regra "e" acima).

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

/** Node de mensagem estática em texto puro (sem botões/lista). */
function plainTextNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  message: string,
  waitForReply = false
): Node {
  return {
    id,
    type: "staticMessage",
    position,
    data: { label, message, buttons: [], waitForReply },
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

const MENU_MESSAGE =
  "Olá, maravilhosa! 🤩 Seja bem-vinda ao Home Concept! Responda com o número do que você procura:\n\n1️⃣ Cabelo\n2️⃣ Unhas\n3️⃣ Cílios\n4️⃣ Sobrancelhas\n5️⃣ Outros assuntos";

const MENU_RETRY_MESSAGE =
  "Desculpe, não entendi 🙏 Por favor, responda só com o número:\n1️⃣ Cabelo\n2️⃣ Unhas\n3️⃣ Cílios\n4️⃣ Sobrancelhas\n5️⃣ Outros assuntos";

const NODES: Node[] = [
  // TRIGGER — dispara em qualquer primeira mensagem recebida.
  {
    id: "bs-trigger",
    type: "trigger",
    position: { x: 600, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  // MENU ÚNICO — as 5 opções de uma vez (texto puro não tem limite de 3
  // opções como botões, então não precisa mais de paginação).
  plainTextNode("bs-menu", { x: 600, y: 160 }, "Menu de categorias", MENU_MESSAGE, true),

  conditionNode("bs-cond-cabelo", { x: 600, y: 320 }, "Escolheu Cabelo?", "Cabelo"),
  conditionNode("bs-cond-unhas", { x: 600, y: 460 }, "Escolheu Unhas?", "Unhas"),
  conditionNode("bs-cond-cilios", { x: 600, y: 600 }, "Escolheu Cílios?", "Cílios"),
  conditionNode("bs-cond-sobrancelhas", { x: 600, y: 740 }, "Escolheu Sobrancelhas?", "Sobrancelhas"),
  conditionNode("bs-cond-outros", { x: 600, y: 880 }, "Escolheu Outros assuntos?", "Outros"),

  // Fallback por número — cobre quem responde só com o dígito em vez do nome.
  conditionNode("bs-cond-digito1", { x: 200, y: 320 }, "Digitou '1' (Cabelo)?", "1", "EQUALS"),
  conditionNode("bs-cond-digito2", { x: 200, y: 460 }, "Digitou '2' (Unhas)?", "2", "EQUALS"),
  conditionNode("bs-cond-digito3", { x: 200, y: 600 }, "Digitou '3' (Cílios)?", "3", "EQUALS"),
  conditionNode("bs-cond-digito4", { x: 200, y: 740 }, "Digitou '4' (Sobrancelhas)?", "4", "EQUALS"),
  conditionNode("bs-cond-digito5", { x: 200, y: 880 }, "Digitou '5' (Outros assuntos)?", "5", "EQUALS"),

  // Retry — cai aqui quando a resposta não bateu com NENHUMA das 5 opções
  // (nem por nome, nem por número). Reenvia o mesmo menu, em vez de
  // "adivinhar" a categoria por eliminação.
  plainTextNode("bs-menu-retry", { x: 200, y: 1020 }, "Menu (não entendi)", MENU_RETRY_MESSAGE, true),

  // Transição para "Outros assuntos" — PAUSA esperando a resposta real da
  // cliente antes de acionar a IA (mesmo princípio dos catálogos de
  // sub-serviços). Sem essa pausa, a IA receberia o próprio "5"/"Outros
  // assuntos" (o texto que selecionou esta opção no menu) como se fosse o
  // primeiro pedido da cliente, e tentava "adivinhar" um sub-serviço a
  // partir disso — foi exatamente esse bug encontrado em teste ao vivo.
  plainTextNode(
    "bs-outros-transicao",
    { x: 600, y: 1020 },
    "Outros assuntos — transição",
    "Sem problemas! 😊 Me conta como posso te ajudar.",
    true
  ),

  // Sub-serviços em texto numerado — pausam esperando a resposta da cliente
  // (`waitForReply: true`), para o primeiro turno da IA já receber a
  // resposta real dela, sem precisar de uma saudação genérica duplicada.
  plainTextNode("bs-sub-cabelo", { x: 900, y: 320 }, "Sub-serviços — Cabelo", subServiceMessage("Cabelo", "cabelo"), true),
  plainTextNode("bs-sub-unhas", { x: 900, y: 460 }, "Sub-serviços — Unhas", subServiceMessage("Unhas", "unhas"), true),
  plainTextNode("bs-sub-cilios", { x: 900, y: 600 }, "Sub-serviços — Cílios", subServiceMessage("Cílios", "cilios"), true),
  plainTextNode(
    "bs-sub-sobrancelhas",
    { x: 900, y: 740 },
    "Sub-serviços — Sobrancelhas",
    subServiceMessage("Sobrancelhas", "sobrancelhas"),
    true
  ),

  // NÓ DE IA — Agente de coleta (Resposta IA).
  {
    id: "bs-ia-coleta",
    type: "aiResponse",
    position: { x: 900, y: 1020 },
    data: {
      label: "Agente de coleta (IA) — catálogo completo",
      useGlobalPrompt: false,
      customPrompt: AI_COLLECTION_PROMPT,
      // "Menu"/"Voltar" devolvem o controle pro menu de categorias (node
      // estático, `bs-menu`) SEM chamar a IA — garante formatação 100%
      // consistente (emojis nos números, etc.), já que pedir pra IA
      // reformatar isso sozinha às vezes falha (foi exatamente o bug
      // relatado: ela reapresentou a lista sem os emojis numerados, e depois
      // os sub-serviços de Cílios sem numeração nenhuma).
      exitKeywords: ["menu", "voltar ao menu", "voltar pro menu", "voltar para o menu", "voltar"],
      exitTargetNodeId: "bs-menu",
    },
  },

  // NÓ DE ALERTA — Notificação do lead qualificado para o dono do salão.
  {
    id: "bs-lead-alert",
    type: "alertNotification",
    position: { x: 900, y: 1180 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhone: "",
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("bs-e-trigger-menu", "bs-trigger", "bs-menu"),
  edge("bs-e-menu-cond-cabelo", "bs-menu", "bs-cond-cabelo"),
  // O retry reentra na MESMA cadeia de condições do menu original.
  edge("bs-e-menuretry-cond-cabelo", "bs-menu-retry", "bs-cond-cabelo"),

  // Checa cada categoria por nome, em sequência — nunca por eliminação.
  edge("bs-e-cond-cabelo-yes", "bs-cond-cabelo", "bs-sub-cabelo", "yes"),
  edge("bs-e-cond-cabelo-no", "bs-cond-cabelo", "bs-cond-unhas", "no"),
  edge("bs-e-cond-unhas-yes", "bs-cond-unhas", "bs-sub-unhas", "yes"),
  edge("bs-e-cond-unhas-no", "bs-cond-unhas", "bs-cond-cilios", "no"),
  edge("bs-e-cond-cilios-yes", "bs-cond-cilios", "bs-sub-cilios", "yes"),
  edge("bs-e-cond-cilios-no", "bs-cond-cilios", "bs-cond-sobrancelhas", "no"),
  edge("bs-e-cond-sobrancelhas-yes", "bs-cond-sobrancelhas", "bs-sub-sobrancelhas", "yes"),
  edge("bs-e-cond-sobrancelhas-no", "bs-cond-sobrancelhas", "bs-cond-outros", "no"),
  // "Outros assuntos" -> transição (pausa) -> IA (não existe catálogo pra esse caso).
  edge("bs-e-cond-outros-yes", "bs-cond-outros", "bs-outros-transicao", "yes"),
  edge("bs-e-cond-outros-no", "bs-cond-outros", "bs-cond-digito1", "no"),

  // Nenhum nome bateu — checa o fallback por número.
  edge("bs-e-digito1-yes", "bs-cond-digito1", "bs-sub-cabelo", "yes"),
  edge("bs-e-digito1-no", "bs-cond-digito1", "bs-cond-digito2", "no"),
  edge("bs-e-digito2-yes", "bs-cond-digito2", "bs-sub-unhas", "yes"),
  edge("bs-e-digito2-no", "bs-cond-digito2", "bs-cond-digito3", "no"),
  edge("bs-e-digito3-yes", "bs-cond-digito3", "bs-sub-cilios", "yes"),
  edge("bs-e-digito3-no", "bs-cond-digito3", "bs-cond-digito4", "no"),
  edge("bs-e-digito4-yes", "bs-cond-digito4", "bs-sub-sobrancelhas", "yes"),
  edge("bs-e-digito4-no", "bs-cond-digito4", "bs-cond-digito5", "no"),
  edge("bs-e-digito5-yes", "bs-cond-digito5", "bs-outros-transicao", "yes"),
  edge("bs-e-digito5-no", "bs-cond-digito5", "bs-menu-retry", "no"),

  // As 4 categorias + "Outros assuntos" convergem no mesmo Agente de Coleta (IA).
  edge("bs-e-sub-cabelo-ia", "bs-sub-cabelo", "bs-ia-coleta"),
  edge("bs-e-sub-unhas-ia", "bs-sub-unhas", "bs-ia-coleta"),
  edge("bs-e-sub-cilios-ia", "bs-sub-cilios", "bs-ia-coleta"),
  edge("bs-e-sub-sobrancelhas-ia", "bs-sub-sobrancelhas", "bs-ia-coleta"),
  edge("bs-e-outros-transicao-ia", "bs-outros-transicao", "bs-ia-coleta"),

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
