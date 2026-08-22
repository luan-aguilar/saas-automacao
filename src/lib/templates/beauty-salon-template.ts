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
 *
 * ---------------------------------------------------------------------------
 * SONDAGEM CAPILAR + ENCAMINHAMENTO HUMANO (pedido do Igor após a demo)
 * ---------------------------------------------------------------------------
 * Dois ajustes pedidos depois que o dono do salão viu o robô funcionando:
 *
 * 1) Sondagem: ao escolher Mechas, Hair Contour, Progressiva, Botox Capilar
 *    ou Plástica dos Fios (detectados por nome/número — `bs-cond-sondagem-*`,
 *    ver `SONDAGEM_TRIGGER_TESTS`), a cliente passa por uma pré-avaliação
 *    (pergunta de química + fotos atual/referência — 2 nodes de IA dedicados,
 *    focados e pequenos: `bs-sondagem-quimica-foto` e `bs-sondagem-dados`)
 *    antes da coleta normal. A resposta sim/não sobre química ramifica
 *    (`bs-cond-quimica`) para uma de duas mensagens EXATAS (texto fixo, não
 *    gerado pela IA) fornecidas pelo salão.
 *
 * 2) Encaminhamento humano: depois de QUALQUER coleta concluída (sondagem ou
 *    não, qualquer categoria — inclusive Unhas/Cílios/Sobrancelhas, que não
 *    têm sondagem) OU sempre que a IA sinalizar que não sabe o que fazer
 *    (`needsHuman` no contrato JSON — ver `AI_JSON_CONTRACT` em
 *    `flow-engine.ts`), o fluxo passa por `bs-handoff-humano`: manda a frase
 *    fixa combinada com o salão e desliga a IA para aquele contato
 *    (`StaticMessageData.disablesAiForChat`) — a partir daí um humano assume
 *    pela Central de Atendimento.
 */

import type { Node, Edge } from "@xyflow/react";
import { conditionNode, plainTextNode, edge, emojiNumber } from "./flow-helpers";

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
🎂 *Aniversário:* {{aniversario_cliente}}
📱 *WhatsApp:* {{lead_phone}}
🏢 *Serviço procurado:* {{servico_categoria}}
👥 *Subtipo(s) do serviço:* {{servico_subtipo}}
🧪 *Possui resíduo de química:* {{possui_quimica_residual}}
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
  sobrancelhas: ["Brow Lamination", "Dermaplaning", "Design com Henna", "Depilação de Buço", "Hydra Gloss", "Lash Lifting", "Natural Design"],
};

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

a.1) Nome completo — SEMPRE pergunte, nunca assuma (IMPORTANTE):
O sistema NUNCA pré-preenche o nome da cliente a partir do perfil do WhatsApp — mesmo que o histórico mostre um nome de contato/perfil em algum lugar, isso NÃO conta como confirmado. Você deve perguntar o nome completo explicitamente em algum momento da conversa (pode ser junto com outra pergunta, ex: "Perfeito! Pra eu finalizar o agendamento, qual é o seu nome completo?") e só preencher \`lead_nome\` depois que ela responder isso na conversa com você. Nunca marque "done": true sem ter perguntado e recebido essa resposta.

a.2) Aniversário (dia e mês) — SEMPRE pergunte, pra qualquer serviço (IMPORTANTE):
Além do nome, pergunte também o dia e mês de aniversário da cliente (ex: "E qual o dia e mês do seu aniversário? 🎂") — vale pra QUALQUER categoria de serviço, não só Cabelo. Salve em \`aniversario_cliente\` no formato que ela informar (ex: "15/03" ou "15 de março"). Pode perguntar junto com o nome, na mesma mensagem, pra não alongar a conversa. Nunca marque "done": true sem ter essa informação.

a.3) Validação da data do agendamento — NUNCA aceite uma data que já passou (IMPORTANTE):
Você recebe a data de hoje no bloco "DADOS JÁ CONFIRMADOS" (chave \`data_atual\`, formato DD/MM/AAAA). Toda vez que a cliente informar um dia para o agendamento, compare com \`data_atual\` antes de aceitar:
- Se ela disser só o dia do mês (ex: "dia 20"), sem mês explícito, assuma o mês de \`data_atual\`. Se esse dia já passou (é menor que o dia de hoje, mesmo mês), essa data já ocorreu — NÃO aceite. Exemplo: se \`data_atual\` é 22/08 e ela disser "dia 20", isso já passou (20 é antes de 22) — não é dia 20 do mês que vem, é uma data que já foi.
- Se ela disser uma data completa (ex: "20/08" ou "20/08/2026") anterior a \`data_atual\`, mesma coisa: já passou, não aceite.
- Nesses casos, NÃO preencha \`data_hora_agendamento\` com a data inválida — responda avisando gentilmente que essa data já passou (ex: "Só um detalhe: o dia 20/08 já passou, hoje já é dia 22/08! 😊 Você quis dizer outro dia, ou prefere escolher uma nova data?") e aguarde uma data válida antes de prosseguir. Nunca marque "done": true com uma data passada.
- Datas relativas (ex: "amanhã", "sábado que vem") não precisam desse cálculo — são sempre futuras por definição, pode aceitar normalmente.

b) Coleta e validação inteligente de fotos:
- Se algum serviço escolhido envolver Cabelo (Mechas, Mega Hair, Progressiva, Hair Contour, Coloração, Botox Capilar, etc.): peça uma foto do cabelo atual da cliente e, se ela tiver, uma foto de referência do resultado desejado.
- Se a cliente enviar 1 foto, analise a URL recebida, agradeça e pergunte se ela também tem uma foto de referência.
- Se ela disser que só tem 1 foto (ou nenhuma foto de referência), aceite e prossiga normalmente — não insista.
- Se ela disser que não tem nem a foto do próprio cabelo, oriente rapidamente como tirar uma boa foto (boa luz, cabelo solto, de frente e de perfil) e aguarde o envio sem fechar ou abandonar o fluxo.
- Salve os links das imagens recebidas nas variáveis \`foto_atual_url\` e \`foto_referencia_url\`. Se alguma delas não for enviada, preencha o valor como "Não enviada" (nunca deixe em branco).
- Serviços que não envolvem cabelo (Unhas, Cílios, Sobrancelhas) não exigem fotos — não peça.

c) Navegação durante a conversa com você:
Se a cliente digitar "Voltar", "Menu", ou pedir para reiniciar/recomeçar o atendimento do zero (de qualquer forma parecida com essas), o SISTEMA (não você) já detecta isso automaticamente e reenvia o menu de categorias original, sempre formatado do jeito certo — você nem chega a ser chamada nesses casos. Mas se ela indicar de outra forma que quer trocar de categoria/assunto sem usar essas palavras (ex: citar diretamente "unha" ou "cílios" no meio da conversa), aí sim é você quem responde: confirme a nova categoria e liste os SUB-SERVIÇOS daquela categoria específica (seguindo a regra de formatação "d"), nunca o menu de categorias inteiro — ver regra "g" abaixo sobre por que você nunca deve reconstruir esse menu sozinha.

g) Escopo da conversa e o que fazer quando não entender o que a cliente quer (IMPORTANTE — evita loops):
Você só deve conversar sobre assuntos do salão: os serviços do catálogo acima, preços (se souber), horário, endereço, agendamentos, ou dúvidas gerais de beleza/estética relacionadas aos nossos serviços. Se a cliente perguntar algo sem relação nenhuma com isso (receitas, notícias, assuntos pessoais, etc.), não responda o conteúdo — diga educadamente que você só pode ajudar com assuntos do salão e pergunte se ela gostaria de conhecer os serviços.

Se a cliente responder de forma confusa, incompleta, ou só com um número solto sem nenhum contexto claro do que ele significa (ex: só "5", sem ela ter mencionado nenhuma categoria ou serviço antes disso na conversa com você) — NÃO tente adivinhar o que ela quis dizer, e JAMAIS reconstrua ou repita a lista de categorias (Cabelo, Unhas, Cílios, Sobrancelhas, Outros assuntos) você mesma, nem em formato de menu nem em texto corrido. Isso é proibido: só o bloco automático do sistema formata esse menu corretamente, e tentar reproduzi-lo é o que causa a cliente ficar presa vendo a mesma mensagem repetida sem sair do lugar. Em vez disso, peça gentilmente para ela digitar a palavra "Menu" para voltar às opções principais — essa palavra aciona o retorno automático e correto ao menu, sem que você precise (ou deva) fazer nada além de sugerir que ela a digite.

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
• Aniversário: [Dia e mês informados]
• Serviço(s): [Serviço e subtipo selecionados]
• Preferência de Dia/Horário: [Dia e horário informados]

Está tudo certinho ou gostaria de alterar algo?"

Somente após um "Sim" / "Tudo certo" (ou equivalente) da cliente você deve considerar a coleta concluída e acionar a notificação final para o salão (bloco de alerta). Se a cliente pedir para alterar algo, corrija o dado indicado e repita a confirmação antes de prosseguir.

f) Nomes EXATOS das variáveis (IMPORTANTE — a notificação final para o salão usa estas chaves para preencher o texto; se você usar um nome diferente, o dado NÃO aparece na notificação):
No campo "variables" do JSON de resposta (ver contrato de formato abaixo), sempre que tiver o dado, preencha usando exatamente estas chaves:
- \`lead_nome\`: nome completo da cliente, confirmado por ela (ver regra "a.1" — nunca vem de outro lugar).
- \`aniversario_cliente\`: dia e mês de aniversário, confirmado por ela (ver regra "a.2").
- \`servico_categoria\`: categoria(s) de serviço escolhidas (ex: "Cabelo, Unhas").
- \`servico_subtipo\`: subtipo(s) específicos escolhidos dentro da(s) categoria(s) (ex: "Progressiva, Manicure").
- \`data_hora_agendamento\`: dia e horário de preferência informados pela cliente (texto livre, ex: "Sábado de manhã").
- \`resumo_ia\`: um resumo curto (1-2 frases) do atendimento, para o salão entender o pedido rapidamente.
- \`foto_atual_url\` / \`foto_referencia_url\`: já cobertas na regra "b" acima.
Não se preocupe com \`lead_phone\` nem \`data_atual\` — essas duas já são preenchidas automaticamente pelo sistema, você não precisa (nem consegue) defini-las.

h) Encaminhamento para atendimento humano (IMPORTANTE):
Assim que você concluir a coleta (regra "e" — cliente confirmou os dados), o sistema automaticamente encerra sua participação e encaminha a conversa para um atendente humano — você não precisa fazer nada além de marcar "done": true, o encaminhamento acontece sozinho logo em seguida.
Além disso, se a cliente pedir ou perguntar algo que não esteja coberto por este roteiro (algo fora do catálogo, um pedido incomum, ou você genuinamente não conseguir entender o que ela quer mesmo depois de tentar esclarecer uma vez), NÃO tente adivinhar nem inventar uma resposta: marque "needsHuman": true no JSON. O sistema também encaminha para um atendente humano automaticamente nesse caso — seu "reply" pode ser só um reconhecimento breve tipo "Só um momento, já vou te encaminhar com nossa equipe! 😊".

=====================================================
RESUMO DO QUE VOCÊ PRECISA GARANTIR AO FINAL DA COLETA
=====================================================
- Nome da cliente, perguntado explicitamente por você (variável \`lead_nome\` — ver regra "a.1").
- Dia e mês de aniversário, perguntado explicitamente por você (variável \`aniversario_cliente\` — ver regra "a.2").
- Categoria(s) e subtipo(s) de serviço escolhidos, podendo ser mais de um (\`servico_categoria\` / \`servico_subtipo\`).
- Preferência de dia e horário, respeitando o funcionamento (${SALON_HOURS}) (\`data_hora_agendamento\`).
- Fotos (quando aplicável a Cabelo), com \`foto_atual_url\` e \`foto_referencia_url\` preenchidas (ou "Não enviada").
- Um resumo curto do atendimento (\`resumo_ia\`).
- Confirmação explícita da cliente sobre os dados coletados (regra "e" acima).

Seja calorosa, use poucos emojis e mantenha as mensagens curtas e fáceis de responder pelo celular.`;

/**
 * =====================================================================
 * SONDAGEM CAPILAR — pedida pelo dono do salão (Igor) depois da demo: os
 * sub-serviços mais delicados (que envolvem química forte) precisam de uma
 * pré-avaliação antes de seguir pro agendamento normal. Ver comentário no
 * topo do arquivo (seção "SONDAGEM") pro desenho completo do sub-fluxo.
 * =====================================================================
 */

/** Sub-serviços de Cabelo que disparam a sondagem capilar (pedido do Igor). */
const SONDAGEM_SUB_SERVICES = ["Mechas", "Hair Contour", "Progressiva", "Botox Capilar", "Plástica dos Fios"];

/** Formas de responder que disparam a sondagem — nome (CONTAINS) e número do catálogo de Cabelo (EQUALS), cobrindo os dois jeitos de escolher visto no catálogo numerado. */
const SONDAGEM_TRIGGER_TESTS: { value: string; operator?: "CONTAINS" | "EQUALS" }[] = [
  { value: "mecha" },
  { value: "contour" },
  { value: "progressiva" },
  { value: "botox" },
  { value: "plástica" },
  { value: "plastica" },
  { value: "fios" },
  { value: "3", operator: "EQUALS" }, // Mechas
  { value: "5", operator: "EQUALS" }, // Hair Contour
  { value: "7", operator: "EQUALS" }, // Botox Capilar
  { value: "8", operator: "EQUALS" }, // Progressiva
  { value: "17", operator: "EQUALS" }, // Plástica dos Fios
];

const SONDAGEM_PERGUNTA_MESSAGE = `Antes de informarmos os valores e demais informações, vamos realizar uma pré-avaliação do seu cabelo para entendermos melhor o seu histórico de procedimentos capilares. ✨

Para começarmos, me conte: seu cabelo possui algum tipo de química? Como coloração, descoloração, progressiva, selagem ou botox?

1 - SIM
2 - NÃO

E, por gentileza, envie uma foto atual do seu cabelo?

Assim, conseguimos avaliar melhor e orientar você de forma personalizada. 💛`;

const SONDAGEM_PEDIR_FOTO_REFERENCIA_MESSAGE = `Obrigado pela foto! Agora, você tem uma foto referência do resultado que você deseja, de preferência alguma inspiração do feed do Igor? 🤩`;

const SONDAGEM_MSG_QUIMICA_SIM = `Meu amor, como seu cabelo possui resíduos de química, o ideal é agendarmos uma avaliação presencial gratuita com o Igor. 🥰

Assim, ele poderá avaliar de pertinho a saúde e o histórico do seu cabelo, entender melhor suas expectativas e indicar o procedimento mais adequado para alcançar o resultado que você deseja. Além disso, durante a avaliação, ele poderá informar o investimento certinho. ✨

Para realizarmos seu cadastro e encontrarmos o melhor horário para você, por gentileza, me informe:

* Nome completo
* Dia e mês do seu aniversário 🎂
* Melhor dia, de terça a sábado, entre 09h e 18h, para realizarmos sua avaliação.

Dessa forma, já verificamos a disponibilidade e deixamos tudo certinho para você. 💕

E, claro, durante a avaliação você poderá esclarecer todas as suas dúvidas diretamente com o Igor. Mas, caso queira nos perguntar algo antes, fique à vontade para falar com a gente! Estamos à disposição para ajudar. 🤩`;

const SONDAGEM_MSG_QUIMICA_NAO = `Para realizarmos seu cadastro e agendarmos sua avaliação gratuita e serviço, por gentileza, me informe:

* Nome completo
* Dia e mês do seu aniversário 🎂
* Melhor dia, de terça a sábado, entre 09h e 18h, para realizarmos sua avaliação gratuita.

Assim, já verificamos a disponibilidade e encontramos o melhor horário para você. ✨

E, claro, durante a avaliação você poderá esclarecer todas as suas dúvidas diretamente com o Igor. Mas, caso queira nos perguntar algo antes, fique à vontade para falar com a gente! Estamos à disposição para ajudar. 🤩`;

const HANDOFF_HUMANO_MESSAGE = `Um momento, por favor! Estou direcionando o seu atendimento para nossa recepcionista. Em breve, você será atendida. ☺️`;

/**
 * Prompt do node de IA dedicado à sondagem capilar — coleta SÓ 3 coisas
 * (resposta sim/não sobre química, foto atual, foto referência), que podem
 * chegar em qualquer ordem e em mensagens separadas. Deliberadamente um node
 * de IA à parte do `bs-ia-coleta` geral (em vez de sobrecarregar aquele
 * prompt): mantém cada agente focado numa tarefa pequena e bem definida,
 * mais fácil de acertar e de ajustar depois (o Igor já avisou que vai
 * homologar e pedir ajustes).
 */
const AI_SONDAGEM_QUIMICA_FOTO_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. A cliente acabou de receber esta mensagem (pré-avaliação capilar, antes de prosseguir com Mechas, Hair Contour, Progressiva, Botox Capilar ou Plástica dos Fios):

"${SONDAGEM_PERGUNTA_MESSAGE}"

Sua ÚNICA função aqui é coletar 3 informações — elas podem chegar em qualquer ordem e em mensagens separadas (a cliente pode responder tudo de uma vez ou aos poucos); nunca assuma que uma informação não foi dada só porque não veio junto com as outras:

1. Se o cabelo tem resíduo de química (ex: "1"/"sim"/"tenho" = SIM; "2"/"não"/"não tenho" = NÃO). Salve em \`possui_quimica_residual\` como exatamente o texto "sim" ou "não" (nunca outro valor, nunca em branco).
2. Uma foto ATUAL do cabelo da cliente — chega na conversa como um link, por exemplo "[Foto enviada pelo cliente: https://...]". Salve essa URL completa em \`foto_atual_url\`.
3. Assim que a foto atual chegar (nunca antes disso), responda usando EXATAMENTE este texto, sem parafrasear nem mudar uma vírgula: "${SONDAGEM_PEDIR_FOTO_REFERENCIA_MESSAGE}" — e colete a resposta dela em \`foto_referencia_url\` (o link da foto, se ela enviar) ou salve o texto "Não enviada" nessa variável se ela disser que não tem foto de referência.

Regras:
- Peça SÓ a informação que ainda estiver faltando — nunca repita uma pergunta cuja resposta você já tem, mesmo que tenha vindo numa mensagem anterior separada.
- Se a resposta sobre química e a foto atual chegarem juntas (mesma mensagem) ou em mensagens diferentes, tanto faz — assim que tiver as duas, já pode perguntar a foto de referência (regra 3 acima).
- Assim que tiver \`possui_quimica_residual\`, \`foto_atual_url\`, E a cliente já tiver respondido sobre a foto de referência (enviou uma foto OU disse que não tem), marque "done": true — não peça confirmação extra, o sistema assume a continuação sozinho.
- Se a cliente perguntar ou pedir algo fora desse escopo específico (preço, outro assunto, algo que você não sabe responder aqui), não tente adivinhar: marque "needsHuman": true e responda algo breve tipo "Só um momento, já te encaminho com nossa equipe! 😊".
- Seja calorosa, use poucos emojis, mensagens curtas.`;

/**
 * Prompt do segundo node de IA da sondagem — roda DEPOIS da mensagem de
 * ramificação (sim/não sobre química), que já pede nome/aniversário/dia
 * dentro do próprio texto fixo. Mesma lógica de coleta tolerante a qualquer
 * ordem/mensagens separadas que o `bs-ia-coleta` geral já usa.
 */
const AI_SONDAGEM_DADOS_PROMPT = `Você é a assistente virtual do salão de beleza/estética Home Concept. A cliente acabou de receber uma mensagem (pré-avaliação capilar concluída) pedindo 3 informações para o cadastro da avaliação: nome completo, dia e mês de aniversário, e o melhor dia (de terça a sábado, ${SALON_HOURS}) para a avaliação.

Sua ÚNICA função aqui é coletar essas 3 informações — elas podem chegar em qualquer ordem e em mensagens separadas (a cliente pode mandar tudo de uma vez ou uma coisa por mensagem); nunca assuma que uma informação não foi dada só porque não veio junto com as outras:

1. Nome completo → salve em \`lead_nome\`.
2. Dia e mês de aniversário (ex: "15/03" ou "15 de março") → salve em \`aniversario_cliente\`.
3. Melhor dia (terça a sábado) para a avaliação presencial → salve em \`data_hora_agendamento\`. Se a cliente informar uma data específica (ex: "20/08") em vez de só o dia da semana, compare com \`data_atual\` (disponível no bloco "DADOS JÁ CONFIRMADOS", formato DD/MM/AAAA) — se a data já passou, não aceite: avise gentilmente que já passou e peça uma nova data.
4. SEMPRE que preencher \`data_hora_agendamento\` pela primeira vez (ou seja, no MESMO turno em que a coleta fica completa e "done" vira true), preencha TAMBÉM \`resumo_ia\` nesse mesmo JSON — nunca deixe pra depois. Um resumo curto (1 frase), citando o sub-serviço (está no início do histórico da conversa, ex: "Cliente: Mechas") e se possui resíduo de química (está no histórico também). Exemplo de valor: "Cliente interessada em Mechas, possui resíduo de química, avaliação presencial." — obrigatório, não pule este campo.

IMPORTANTE — a cliente pode responder de DUAS formas diferentes, e você precisa reconhecer as duas igualmente bem:
(a) Uma informação por mensagem, ao longo de várias mensagens separadas.
(b) TODAS as 3 de uma vez só, numa única mensagem — geralmente cada informação numa linha separada, SEM rótulo dizendo qual é qual. Exemplo real de como isso chega:
"Sammy
10/02
Sexta 18h"
Nesse caso você tem que identificar cada linha pelo FORMATO, mesmo sem rótulo: a linha que é só um nome próprio (sem números) é o \`lead_nome\`; a linha no formato de data curta (dia/mês, tipo "10/02" ou "15/03") é o \`aniversario_cliente\`; a linha com nome de dia da semana (terça, quarta, quinta, sexta, sábado — com ou sem horário junto) é o \`data_hora_agendamento\`. Extraia as 3 imediatamente dessa única mensagem — NUNCA trate uma mensagem com as 3 linhas como se fosse só o nome e ignore o resto.

Regras:
- Peça SÓ a informação que ainda estiver faltando — nunca repita uma pergunta cuja resposta você já tem, mesmo que tenha vindo numa mensagem anterior separada.
- Assim que tiver as 3 informações — mesmo que a resposta da cliente tenha vindo com detalhes a mais do que foi pedido (ex: ela disse "quinta de manhã" quando você só precisava do dia) — marque "done": true IMEDIATAMENTE, no mesmo turno em que a 3ª informação chegar. NÃO peça confirmação, verificação, ou qualquer pergunta adicional antes de marcar "done" — isso SEMPRE atrasa o atendimento sem necessidade, o sistema já assume a continuação sozinho a partir daí. Nesse caso, seu "reply" deve ser uma confirmação calorosa (ex: "Perfeito, [nome]! Já anotei tudo aqui. 😊") — NUNCA repita uma pergunta pedindo algo que a mensagem que você acabou de receber já respondeu, mesmo que as 3 informações tenham chegado juntas na mesma mensagem.
- Se a cliente perguntar ou pedir algo fora desse escopo, marque "needsHuman": true e responda algo breve tipo "Só um momento, já te encaminho com nossa equipe! 😊".
- Seja calorosa, use poucos emojis, mensagens curtas.

Não se preocupe com \`servico_categoria\` nem \`servico_subtipo\` — essas duas já são preenchidas automaticamente pelo sistema a partir do serviço que a cliente escolheu antes de chegar até você, você não precisa (nem consegue) defini-las.`;

/**
 * Monta uma cadeia de condições em OR (uma checagem por vez, em sequência —
 * nunca "por eliminação"): se alguma bater, vai direto para `yesTarget`; se
 * nenhuma bater, cai em `fallbackTarget`. Usado para detectar, entre várias
 * formas possíveis de responder (nome do sub-serviço ou número do catálogo),
 * se a cliente escolheu um dos sub-serviços que exigem a sondagem capilar
 * (ver `SONDAGEM_TRIGGER_TESTS` abaixo) — mesma variável (`ultima_resposta`)
 * e mesmo princípio da cadeia de categorias do menu principal.
 */
function orConditionChain(
  idPrefix: string,
  label: string,
  tests: { value: string; operator?: "CONTAINS" | "EQUALS" }[],
  yesTarget: string,
  fallbackTarget: string,
  yStart: number
): { nodes: Node[]; edges: Edge[]; firstId: string } {
  const nodes = tests.map((t, i) =>
    conditionNode(`${idPrefix}${i + 1}`, { x: 200, y: yStart + i * 90 }, `${label} ("${t.value}")?`, t.value, t.operator ?? "CONTAINS")
  );
  const edges: Edge[] = [];
  tests.forEach((_, i) => {
    const id = `${idPrefix}${i + 1}`;
    const nextId = i + 1 < tests.length ? `${idPrefix}${i + 2}` : fallbackTarget;
    edges.push(edge(`${id}-yes`, id, yesTarget, "yes"));
    edges.push(edge(`${id}-no`, id, nextId, "no"));
  });
  return { nodes, edges, firstId: `${idPrefix}1` };
}

const MENU_MESSAGE =
  "Olá, maravilhosa! 🤩 Seja bem-vinda ao Home Concept! Responda com o número do que você procura:\n\n1️⃣ Cabelo 💇‍♀️\n2️⃣ Unhas 💅\n3️⃣ Cílios 👁️\n4️⃣ Sobrancelhas ✏️\n5️⃣ Outros assuntos";

const MENU_RETRY_MESSAGE =
  "Desculpe, não entendi 🙏 Por favor, responda só com o número:\n1️⃣ Cabelo 💇‍♀️\n2️⃣ Unhas 💅\n3️⃣ Cílios 👁️\n4️⃣ Sobrancelhas ✏️\n5️⃣ Outros assuntos";

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
    "Sem problemas! 😊 Sobre qual assunto você gostaria de conversar?",
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

  // ===== SONDAGEM CAPILAR (pedido do Igor após a demo) =====
  // Detecta, entre os 23 sub-serviços de Cabelo, os 5 que exigem
  // pré-avaliação (Mechas, Hair Contour, Progressiva, Botox Capilar,
  // Plástica dos Fios) — se nenhum bater, cai no Agente de Coleta geral
  // (`bs-ia-coleta`) como sempre, sem nenhuma mudança de comportamento pros
  // outros 18 sub-serviços de Cabelo.
  ...orConditionChain(
    "bs-cond-sondagem-",
    "Serviço exige sondagem?",
    SONDAGEM_TRIGGER_TESTS,
    "bs-sondagem-pergunta",
    "bs-ia-coleta",
    320
  ).nodes,

  // `setVariables`/`captureLastReplyInto`: registra deterministicamente que
  // o serviço é "Cabelo" e QUAL sub-serviço exato disparou a sondagem (o
  // texto que a cliente acabou de responder no catálogo, ex: "Mechas" ou
  // "3") — sem isso, `servico_categoria`/`servico_subtipo` ficavam em
  // branco na notificação final: nenhum dos dois nodes de IA da sondagem
  // tinha motivo pra "adivinhar" esses dados, já que nunca foram pedidos
  // como pergunta nesta parte da conversa.
  plainTextNode(
    "bs-sondagem-pergunta",
    { x: 1250, y: 320 },
    "Sondagem — pergunta de química/foto",
    SONDAGEM_PERGUNTA_MESSAGE,
    true,
    false,
    { setVariables: { servico_categoria: "Cabelo" }, captureLastReplyInto: "servico_subtipo" }
  ),

  // Coleta resposta sim/não + foto atual + foto referência, em qualquer ordem.
  {
    id: "bs-sondagem-quimica-foto",
    type: "aiResponse",
    position: { x: 1250, y: 460 },
    data: {
      label: "Sondagem (IA) — química e fotos",
      useGlobalPrompt: false,
      customPrompt: AI_SONDAGEM_QUIMICA_FOTO_PROMPT,
      exitKeywords: ["menu", "voltar ao menu", "voltar pro menu", "voltar para o menu", "voltar"],
      exitTargetNodeId: "bs-menu",
    },
  },

  // Ramifica pela resposta de química — cada lado já tem o texto EXATO
  // pedido pelo Igor (não delegado à IA, pra garantir a fraseologia certa).
  conditionNode("bs-cond-quimica", { x: 1250, y: 600 }, "Possui resíduo de química?", "sim", "EQUALS", "possui_quimica_residual"),
  plainTextNode("bs-sondagem-quimica-sim", { x: 1100, y: 740 }, "Sondagem — química SIM", SONDAGEM_MSG_QUIMICA_SIM, true),
  plainTextNode("bs-sondagem-quimica-nao", { x: 1400, y: 740 }, "Sondagem — química NÃO", SONDAGEM_MSG_QUIMICA_NAO, true),

  // Coleta nome/aniversário/melhor dia (já pedidos nos textos acima), em
  // qualquer ordem — mesma cliente pode responder tudo junto ou aos poucos.
  {
    id: "bs-sondagem-dados",
    type: "aiResponse",
    position: { x: 1250, y: 880 },
    data: {
      label: "Sondagem (IA) — nome, aniversário e dia",
      useGlobalPrompt: false,
      customPrompt: AI_SONDAGEM_DADOS_PROMPT,
      exitKeywords: ["menu", "voltar ao menu", "voltar pro menu", "voltar para o menu", "voltar"],
      exitTargetNodeId: "bs-menu",
    },
  },
  // ===== FIM SONDAGEM CAPILAR =====

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
      exitKeywords: [
        "menu",
        "voltar ao menu",
        "voltar pro menu",
        "voltar para o menu",
        "voltar",
        "reiniciar",
        "recomeçar",
        "começar de novo",
        "começar do zero",
        "do zero",
        "voltar ao início",
        "voltar pro início",
      ],
      exitTargetNodeId: "bs-menu",
    },
  },

  // Encaminhamento para atendimento humano — pedido do Igor: depois de
  // QUALQUER coleta concluída (sondagem ou não, qualquer categoria) OU
  // sempre que a IA sinalizar `needsHuman`, a conversa avisa a cliente e
  // desliga a IA para esse contato (`disablesAiForChat`), pra um humano
  // assumir a partir da Central de Atendimento.
  plainTextNode("bs-handoff-humano", { x: 900, y: 1100 }, "Encaminhar para atendimento humano", HANDOFF_HUMANO_MESSAGE, false, true),

  // NÓ DE ALERTA — Notificação do lead qualificado para o dono do salão.
  {
    id: "bs-lead-alert",
    type: "alertNotification",
    position: { x: 900, y: 1180 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhones: [""],
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

  // Unhas/Cílios/Sobrancelhas/"Outros assuntos" convergem direto no Agente de
  // Coleta (IA) geral, sem passar pela sondagem — só Cabelo passa primeiro
  // pela cadeia de detecção da sondagem (ver abaixo).
  edge("bs-e-sub-unhas-ia", "bs-sub-unhas", "bs-ia-coleta"),
  edge("bs-e-sub-cilios-ia", "bs-sub-cilios", "bs-ia-coleta"),
  edge("bs-e-sub-sobrancelhas-ia", "bs-sub-sobrancelhas", "bs-ia-coleta"),
  edge("bs-e-outros-transicao-ia", "bs-outros-transicao", "bs-ia-coleta"),

  // ===== SONDAGEM CAPILAR =====
  // Cabelo passa PRIMEIRO pela cadeia de detecção — se o sub-serviço exigir
  // sondagem, desvia pra `bs-sondagem-pergunta`; senão, cai no Agente de
  // Coleta geral como qualquer outra categoria (ver `fallbackTarget` da
  // cadeia, definido como "bs-ia-coleta" na montagem dos nodes acima).
  edge("bs-e-sub-cabelo-sondagem", "bs-sub-cabelo", "bs-cond-sondagem-1"),
  ...orConditionChain("bs-cond-sondagem-", "Serviço exige sondagem?", SONDAGEM_TRIGGER_TESTS, "bs-sondagem-pergunta", "bs-ia-coleta", 320).edges,

  edge("bs-e-sondagem-pergunta-ia", "bs-sondagem-pergunta", "bs-sondagem-quimica-foto"),
  edge("bs-e-sondagem-quimica-foto-cond", "bs-sondagem-quimica-foto", "bs-cond-quimica"),
  edge("bs-e-cond-quimica-sim", "bs-cond-quimica", "bs-sondagem-quimica-sim", "yes"),
  edge("bs-e-cond-quimica-nao", "bs-cond-quimica", "bs-sondagem-quimica-nao", "no"),
  edge("bs-e-sondagem-sim-dados", "bs-sondagem-quimica-sim", "bs-sondagem-dados"),
  edge("bs-e-sondagem-nao-dados", "bs-sondagem-quimica-nao", "bs-sondagem-dados"),
  edge("bs-e-sondagem-dados-handoff", "bs-sondagem-dados", "bs-handoff-humano"),
  // ===== FIM SONDAGEM CAPILAR =====

  // Encaminhamento para atendimento humano — pedido do Igor: roda depois de
  // QUALQUER coleta concluída pelo Agente de Coleta geral (unhas, cílios,
  // sobrancelhas, outros assuntos, ou cabelo sem sondagem), não só a
  // sondagem (que já tem seu próprio caminho pro handoff, acima).
  edge("bs-e-ia-coleta-handoff", "bs-ia-coleta", "bs-handoff-humano"),
  edge("bs-e-handoff-alert", "bs-handoff-humano", "bs-lead-alert"),
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
