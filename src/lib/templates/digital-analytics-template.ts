/**
 * Template pré-definido do Construtor de Fluxos para a própria Digital
 * Analytics — diagnóstico comercial gratuito via WhatsApp. Diferente do
 * `beauty-salon-template.ts` (liberado por cliente via `TemplateAccess`),
 * este NUNCA é concedido a nenhum CLIENTE: fica disponível só pra conta
 * MASTER, que automaticamente enxerga todo o `TEMPLATE_REGISTRY` sem
 * precisar de liberação (ver `getAvailableTemplates`).
 *
 * ---------------------------------------------------------------------------
 * DESENHO DO FLUXO
 * ---------------------------------------------------------------------------
 * TRIGGER (primeira mensagem, qualquer conteúdo — mesmo princípio do
 * `beauty-salon-template.ts`: não exige a palavra literal "oi")
 *   -> 6 perguntas em sequência, cada uma como um par
 *      [mensagem estática de texto exato] -> [node de IA dedicado que só
 *      capture AQUELA resposta específica]:
 *        1. Nome completo                -> `lead_nome`
 *        2. Segmento/ramo da empresa      -> `segmento_empresa`
 *        3. Quem atende (equipe/donos)    -> `quem_atende`
 *        4. Sistema/CRM usado             -> `sistema_crm`
 *        5. Investe em tráfego pago       -> `trafego_pago`
 *        6. Principal desafio comercial   -> `desafio_comercial`
 *      Cada node de IA sabe responder perguntas fora do roteiro usando a
 *      base de conhecimento da empresa (`KNOWLEDGE_BASE`, extraída do site
 *      https://digitalanalyticsmkt.vercel.app/) e depois retomar a mesma
 *      pergunta — nunca avança sem capturar o dado certo.
 *   -> Bloco nativo "Agenda: Buscar Horários" (`da-agenda-slots`): consulta a
 *      agenda Google conectada pelo tenant (ver Configurações → Integração
 *      Google / `GoogleIntegration`) e grava `slots_message` (texto pronto,
 *      numerado em emoji) e `slot_1_iso`/`slot_2_iso`/`slot_3_iso`.
 *   -> Mensagem com os 3 horários (texto puro, pausa esperando resposta)
 *   -> Node de IA que identifica qual das 3 opções o cliente escolheu
 *      (`escolha_horario` = "1"/"2"/"3")
 *   -> Bloco nativo "Agenda: Confirmar Agendamento" (`da-agenda-book`): cria
 *      o evento na agenda Google (com Google Meet), grava a linha na aba
 *      "Leads" da planilha configurada, e devolve `meet_link` +
 *      `horario_agendado_formatado`.
 *   -> Notificação/Alerta pro Lucas (gestor comercial) com os dados do lead.
 *   -> Mensagem final de confirmação pro cliente, com o link do Meet.
 *
 * ---------------------------------------------------------------------------
 * PRÉ-REQUISITO — CONECTAR O GOOGLE ANTES DE ATIVAR ESTE FLUXO
 * ---------------------------------------------------------------------------
 * Os blocos de Agenda dependem de uma conta Google conectada em
 * Configurações → Integração Google (OAuth — Calendar + Sheets), com a
 * agenda (`calendarId`, ex: o e-mail do Lucas, se a agenda dele estiver
 * compartilhada com a conta conectada) e a planilha (`spreadsheetId`)
 * configuradas. Sem isso, os blocos falham e o contato fica parado
 * aguardando um atendente. `da-alerta-lucas` nasce com `recipientPhones: [""]`
 * — configurar o WhatsApp do Lucas antes de ativar.
 */

import type { Node, Edge } from "@xyflow/react";
import { plainTextNode, edge } from "./flow-helpers";

export const DIGITAL_ANALYTICS_TEMPLATE_NAME = "Digital Analytics — Diagnóstico Comercial";

/**
 * Base de conhecimento da empresa (resumo do site
 * https://digitalanalyticsmkt.vercel.app/) — incluída em TODOS os nodes de
 * IA deste template, pra qualquer um deles conseguir responder uma pergunta
 * sobre a empresa sem perder o fio da coleta em andamento.
 */
const KNOWLEDGE_BASE = `=====================================================
SOBRE A DIGITAL ANALYTICS (use isso pra responder dúvidas do cliente)
=====================================================
A Digital Analytics é especializada em automação comercial, CRM e engenharia de vendas. Posicionamento: "as empresas não precisam de mais leads, mas de parar de perder os que já chegam."

MÉTODO E3 (Estratégia | Estrutura | Escala) — implementação em 90 dias, dividida em 3 meses:
1. ESTRATÉGIA (mês 1): mapeamento completo do funil comercial, roteiros de follow-up automatizado, padronização de processos de venda, posicionamento de marca. Inclui diagnóstico estratégico, auditoria de dados e plano de implementação.
2. ESTRUTURA (mês 2): implementação de CRM integrado, integrações nativas de dados, arquitetura de IA personalizada, gatilhos automatizados de atendimento, treinamento da equipe.
3. ESCALA (mês 3): ativação e otimização de tráfego pago, qualificação de leads, previsibilidade de faturamento, crescimento previsível.

PÚBLICO-ALVO: empresas que já têm operação comercial e equipe de vendas formada, buscando crescimento escalável e previsibilidade — NÃO é para quem ainda não tem nenhuma operação comercial rodando.

DIFERENCIAIS: infraestrutura integrada (CRM + IA + automações num sistema único), foco em não perder leads que já chegam (retenção), abordagem que trata estratégia/estrutura/escala juntas, time especializado em dados/estratégia comercial/tráfego pago.

PROBLEMAS QUE RESOLVEM: leads sem resposta/esfriando, atendimento lento, falta de CRM (informação dispersa em WhatsApp/blocos de notas), equipe sem processo padronizado, falta de follow-up, tráfego pago que atrai leads desqualificados, falta de indicadores pra decisão, faturamento instável mês a mês.

PREÇO: não há valor fixo público — depende de diagnóstico e proposta customizada (é justamente esse diagnóstico gratuito que esta conversa está agendando). Não invente valores.

PRÉ-REQUISITOS: o cliente precisa já ter equipe/operação comercial formada, e a fase de Escala pressupõe investimento em tráfego pago.

TIME: Luan Sant'ana (tecnologia, CRM, IA e desenvolvimento), Lucas Cincea (estratégia comercial e crescimento), Raphael Cavalcante (marketing, audiovisual e tráfego pago).

PRÓXIMO PASSO: sempre encaminhar pro diagnóstico comercial gratuito (que é exatamente o que esta conversa está fazendo).`;

/**
 * Gera o prompt de um node de IA dedicado a capturar UM ÚNICO dado
 * específico — mesmo princípio dos nodes pequenos e focados da sondagem
 * capilar do `beauty-salon-template.ts` (mais fácil de acertar e ajustar do
 * que um único prompt gigante tentando coletar tudo de uma vez).
 */
function fieldCollectionPrompt(params: {
  fieldDescription: string;
  variableName: string;
  extraInstructions?: string;
}): string {
  return `Você é o assistente virtual de vendas da Digital Analytics, conduzindo um diagnóstico comercial gratuito pelo WhatsApp. O cliente acabou de receber uma pergunta específica, e a mensagem mais recente dele é a resposta a essa pergunta — mas também pode ser uma dúvida sobre a empresa ou algo fora de contexto.

${KNOWLEDGE_BASE}

=====================================================
SUA ÚNICA TAREFA AGORA
=====================================================
Capturar ${params.fieldDescription} na variável \`${params.variableName}\`.
${params.extraInstructions ?? ""}

=====================================================
REGRAS (siga exatamente nesta ordem de prioridade)
=====================================================
a) Se a mensagem do cliente for uma resposta válida pra essa pergunta específica: salve em \`${params.variableName}\`, marque "done": true. No "reply", apenas um reconhecimento breve (ex: "Perfeito!", "Entendido!") — NÃO faça a próxima pergunta você mesmo, o próximo bloco do sistema já cuida disso automaticamente.

b) Se o cliente fizer uma pergunta sobre a Digital Analytics, os serviços, o Método E3, preço, prazo, etc.: responda a dúvida usando SOMENTE as informações da base de conhecimento acima (nunca invente dado que não está lá — se não souber algo específico, diga que isso é detalhado na conversa com o gestor comercial). Logo em seguida, repita a pergunta original pra não perder o fio da coleta. Marque "done": false.

c) Se o cliente responder qualquer outra coisa fora de contexto (cumprimento solto, mensagem confusa, assunto aleatório sem relação com a Digital Analytics): responda com gentileza e repita a pergunta original. Marque "done": false.

d) Seja objetivo, profissional e cordial — poucas mensagens, direto ao ponto, é uma conversa de WhatsApp.`;
}

const GREETING_MESSAGE = `Oi! 👋 Para começar, qual é o seu nome completo?

Assim já agilizo aqui o seu diagnóstico comercial gratuito. 🎯`;

const ASK_SEGMENTO_MESSAGE = `Perfeito, *{{lead_nome}}*! 🎯

Em qual segmento/ramo sua empresa atua? (ex: estética, e-commerce, serviços B2B, restaurante, etc.)`;

const ASK_QUEM_ATENDE_MESSAGE = `Perfeito — obrigado! 🎯

Sua equipe comercial atende os clientes ou os proprietários ainda fazem esse atendimento/vendas?
1️⃣ - Equipe Comercial
2️⃣ - Proprietários
3️⃣ - Ambos`;

const ASK_CRM_MESSAGE = `Vocês usam algum sistema ou CRM para gerenciar leads e agendamentos? (ex: WhatsApp como principal, planilha, Pipedrive, etc.)`;

const ASK_TRAFEGO_MESSAGE = `Perfeito! 🚀

Vocês investem em tráfego pago (Facebook/Instagram/Google) ou dependem majoritariamente de indicações e redes sociais orgânicas?
1️⃣ - Sim, investimos
2️⃣ - Só orgânico
3️⃣ - Investimento Misto`;

const ASK_DESAFIO_MESSAGE = `Qual o principal desafio comercial que vocês enfrentam hoje na empresa?`;

const ASK_HORARIO_MESSAGE = `Encontrei esses horários disponíveis para o seu diagnóstico comercial gratuito:

{{slots_message}}

Qual horário fica melhor para você? Responda com o número da opção.`;

const NODES: Node[] = [
  {
    id: "da-trigger",
    type: "trigger",
    position: { x: 600, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  // 1) NOME
  plainTextNode("da-ask-nome", { x: 600, y: 140 }, "Pergunta: nome completo", GREETING_MESSAGE, true),
  {
    id: "da-ai-nome",
    type: "aiResponse",
    position: { x: 600, y: 280 },
    data: {
      label: "Captura (IA) — nome completo",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "o nome completo da pessoa",
        variableName: "lead_nome",
        extraInstructions:
          "Aceite qualquer nome plausível (nome e sobrenome, ou até só um primeiro nome). Se a resposta claramente NÃO for um nome (ex: uma pergunta, uma saudação solta como 'oi', ou texto sem sentido pra ser um nome), NÃO trate como nome válido — siga a regra (b) ou (c) abaixo.",
      }),
    },
  },

  // 2) SEGMENTO
  plainTextNode("da-ask-segmento", { x: 600, y: 420 }, "Pergunta: segmento da empresa", ASK_SEGMENTO_MESSAGE, true),
  {
    id: "da-ai-segmento",
    type: "aiResponse",
    position: { x: 600, y: 560 },
    data: {
      label: "Captura (IA) — segmento da empresa",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "o segmento/ramo de atuação da empresa do cliente (ex: estética, e-commerce, serviços B2B, restaurante, etc.)",
        variableName: "segmento_empresa",
      }),
    },
  },

  // 3) QUEM ATENDE
  plainTextNode("da-ask-quem-atende", { x: 600, y: 700 }, "Pergunta: quem atende", ASK_QUEM_ATENDE_MESSAGE, true),
  {
    id: "da-ai-quem-atende",
    type: "aiResponse",
    position: { x: 600, y: 840 },
    data: {
      label: "Captura (IA) — quem atende",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "quem faz o atendimento/vendas na empresa do cliente",
        variableName: "quem_atende",
        extraInstructions:
          'O cliente pode responder só com o número (1, 2 ou 3) ou por texto livre (ex: "equipe comercial", "proprietários", "ambos", "os dois", "eu mesmo e minha equipe"). Independente de como ele responder, salve SEMPRE um destes três valores EXATOS em `quem_atende`: "Equipe Comercial", "Proprietários" ou "Ambos" — nunca outro texto.',
      }),
    },
  },

  // 4) CRM
  plainTextNode("da-ask-crm", { x: 600, y: 980 }, "Pergunta: sistema/CRM", ASK_CRM_MESSAGE, true),
  {
    id: "da-ai-crm",
    type: "aiResponse",
    position: { x: 600, y: 1120 },
    data: {
      label: "Captura (IA) — sistema/CRM",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "qual sistema ou CRM a empresa usa hoje para gerenciar leads e agendamentos (ex: WhatsApp, planilha, Pipedrive, RD Station, ou 'nenhum'/'não usamos nada')",
        variableName: "sistema_crm",
      }),
    },
  },

  // 5) TRÁFEGO PAGO
  plainTextNode("da-ask-trafego", { x: 600, y: 1260 }, "Pergunta: tráfego pago", ASK_TRAFEGO_MESSAGE, true),
  {
    id: "da-ai-trafego",
    type: "aiResponse",
    position: { x: 600, y: 1400 },
    data: {
      label: "Captura (IA) — tráfego pago",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "se a empresa investe em tráfego pago ou depende de orgânico/indicações",
        variableName: "trafego_pago",
        extraInstructions:
          'O cliente pode responder só com o número (1, 2 ou 3) ou por texto livre. Independente de como ele responder, salve SEMPRE um destes três valores EXATOS em `trafego_pago`: "Sim, investimos", "Só orgânico" ou "Investimento Misto" — nunca outro texto.',
      }),
    },
  },

  // 6) DESAFIO COMERCIAL
  plainTextNode("da-ask-desafio", { x: 600, y: 1540 }, "Pergunta: desafio comercial", ASK_DESAFIO_MESSAGE, true),
  {
    id: "da-ai-desafio",
    type: "aiResponse",
    position: { x: 600, y: 1680 },
    data: {
      label: "Captura (IA) — desafio comercial",
      useGlobalPrompt: false,
      customPrompt: fieldCollectionPrompt({
        fieldDescription: "o principal desafio comercial que a empresa do cliente enfrenta hoje, em texto livre",
        variableName: "desafio_comercial",
      }),
    },
  },

  // ===== AGENDA (nativa — Google Calendar/Sheets, ver src/lib/google-api.ts) =====
  {
    id: "da-agenda-slots",
    type: "googleCalendarSlots",
    position: { x: 600, y: 1820 },
    data: {
      label: "Agenda: Buscar Horários",
      daysAhead: 3,
      slotsWanted: 3,
      slotDurationMinutes: 60,
      businessHourStart: 9,
      businessHourEnd: 18,
      minLeadHours: 2,
    },
  },

  plainTextNode("da-ask-horario", { x: 600, y: 1960 }, "Apresenta horários disponíveis", ASK_HORARIO_MESSAGE, true),
  {
    id: "da-ai-escolha-horario",
    type: "aiResponse",
    position: { x: 600, y: 2100 },
    data: {
      label: "Captura (IA) — horário escolhido",
      useGlobalPrompt: false,
      customPrompt: `Você é o assistente virtual de vendas da Digital Analytics. O cliente acabou de receber 3 opções de horário para o diagnóstico comercial gratuito, numeradas 1️⃣, 2️⃣ e 3️⃣, e a mensagem mais recente dele é a resposta.

${KNOWLEDGE_BASE}

=====================================================
SUA ÚNICA TAREFA AGORA
=====================================================
Identificar qual das 3 opções (1, 2 ou 3) o cliente escolheu e salvar em \`escolha_horario\` como exatamente o texto "1", "2" ou "3" (nunca outro valor).

=====================================================
REGRAS
=====================================================
a) Se o cliente respondeu claramente com um número (1, 2 ou 3) ou de forma que só possa corresponder a uma das 3 opções (ex: repetiu o horário de uma delas): salve em \`escolha_horario\`, marque "done": true, "reply" com um reconhecimento breve (ex: "Perfeito!").
b) Se o cliente fizer uma pergunta sobre a Digital Analytics/os serviços: responda usando a base de conhecimento acima e repita as 3 opções pra ele escolher. Marque "done": false.
c) Se a resposta não corresponder claramente a nenhuma das 3 opções: peça gentilmente pra ele responder só com o número da opção (1, 2 ou 3). Marque "done": false.
d) Seja objetivo e cordial — mensagens curtas.`,
    },
  },

  {
    id: "da-agenda-book",
    type: "googleCalendarBook",
    position: { x: 600, y: 2240 },
    data: {
      label: "Agenda: Confirmar Agendamento",
      eventTitleTemplate: "Diagnóstico Comercial - {{lead_nome}}",
      eventDescriptionTemplate:
        "Segmento: {{segmento_empresa}}\nQuem atende: {{quem_atende}}\nCRM: {{sistema_crm}}\nTráfego pago: {{trafego_pago}}\nDesafio: {{desafio_comercial}}\nWhatsApp: {{lead_phone}}",
      sheetRowTemplate: `{{lead_nome}}
{{lead_phone}}
{{segmento_empresa}}
{{quem_atende}}
{{sistema_crm}}
{{trafego_pago}}
{{desafio_comercial}}
{{horario_agendado_formatado}}
{{data_atual}}
{{meet_link}}`,
    },
  },

  // Notifica o Lucas (gestor comercial) — número a configurar (nasce vazio, ver comentário no topo do arquivo).
  {
    id: "da-alerta-lucas",
    type: "alertNotification",
    position: { x: 600, y: 2380 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhones: [""],
      message: `🔥 *NOVO LEAD QUALIFICADO* 🔥

📅 *Data:* {{data_atual}}
👤 *Nome:* {{lead_nome}}
📱 *WhatsApp:* {{lead_phone}}
🏢 *Segmento:* {{segmento_empresa}}

👥 *Quem Atende:* {{quem_atende}}
💻 *Sistema/CRM:* {{sistema_crm}}
📈 *Tráfego Pago:* {{trafego_pago}}
🎯 *Desafio Comercial:* {{desafio_comercial}}

⏰ *Horário Diagnóstico:* {{horario_agendado_formatado}}
🔗 *Link Google Meet:* {{meet_link}}`,
    },
  },

  plainTextNode(
    "da-msg-confirmacao",
    { x: 600, y: 2520 },
    "Mensagem final de confirmação",
    `Pronto — sua conversa foi agendada para {{horario_agendado_formatado}}. 🚀

O convite com o link do Google Meet:
{{meet_link}}

Por favor, esteja presente nesse link no dia e horário combinado. Até lá! 🙌`,
    false
  ),
];

const EDGES: Edge[] = [
  edge("da-e-trigger-ask-nome", "da-trigger", "da-ask-nome"),
  edge("da-e-ask-nome-ai-nome", "da-ask-nome", "da-ai-nome"),
  edge("da-e-ai-nome-ask-segmento", "da-ai-nome", "da-ask-segmento"),
  edge("da-e-ask-segmento-ai-segmento", "da-ask-segmento", "da-ai-segmento"),
  edge("da-e-ai-segmento-ask-quem-atende", "da-ai-segmento", "da-ask-quem-atende"),
  edge("da-e-ask-quem-atende-ai-quem-atende", "da-ask-quem-atende", "da-ai-quem-atende"),
  edge("da-e-ai-quem-atende-ask-crm", "da-ai-quem-atende", "da-ask-crm"),
  edge("da-e-ask-crm-ai-crm", "da-ask-crm", "da-ai-crm"),
  edge("da-e-ai-crm-ask-trafego", "da-ai-crm", "da-ask-trafego"),
  edge("da-e-ask-trafego-ai-trafego", "da-ask-trafego", "da-ai-trafego"),
  edge("da-e-ai-trafego-ask-desafio", "da-ai-trafego", "da-ask-desafio"),
  edge("da-e-ask-desafio-ai-desafio", "da-ask-desafio", "da-ai-desafio"),
  edge("da-e-ai-desafio-agenda-slots", "da-ai-desafio", "da-agenda-slots"),
  edge("da-e-agenda-slots-ask-horario", "da-agenda-slots", "da-ask-horario"),
  edge("da-e-ask-horario-ai-escolha", "da-ask-horario", "da-ai-escolha-horario"),
  edge("da-e-ai-escolha-agenda-book", "da-ai-escolha-horario", "da-agenda-book"),
  edge("da-e-agenda-book-alerta-lucas", "da-agenda-book", "da-alerta-lucas"),
  edge("da-e-alerta-lucas-msg-confirmacao", "da-alerta-lucas", "da-msg-confirmacao"),
];

/**
 * Retorna uma cópia independente (deep clone) dos nodes/edges do template —
 * mesmo princípio do `createBeautySalonTemplate`.
 */
export function createDigitalAnalyticsTemplate(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(NODES)) as Node[],
    edges: JSON.parse(JSON.stringify(EDGES)) as Edge[],
  };
}
