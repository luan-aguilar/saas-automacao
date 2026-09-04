/**
 * Template pré-definido do Construtor de Fluxos para a Klan Tattoo (estúdio
 * de tatuagem e piercing em São Caetano do Sul, também organizadora da
 * Tattoo Week — ver pesquisa que embasou este template nas fontes citadas
 * na conversa). Terceiro cliente real da plataforma, totalmente
 * independente de `beauty-salon-template.ts` e `kfg-template.ts` — nenhum
 * dos dois é alterado por este arquivo.
 *
 * ---------------------------------------------------------------------------
 * CONTEXTO DO NEGÓCIO
 * ---------------------------------------------------------------------------
 * Apesar do nome "Klan TATTOO", o Luan informou que PIERCING responde por
 * ~80% do faturamento — por isso o menu principal trata os dois como
 * ofertas de primeira classe (não "tatuagem, e piercing como opção
 * secundária"), mas os dois fluxos são bem diferentes:
 *   - TATUAGEM: orçamento é subjetivo (depende da referência, tamanho,
 *     região) — vale a pena um fluxo mais rico coletando referência
 *     (com IA de visão de verdade, ver `analyzeAttachedImages` em
 *     `flow-engine.ts`) e devolvendo uma ESTIMATIVA calculada.
 *   - PIERCING: preço é bem mais padronizado por tipo/joia — não faz
 *     sentido fingir uma fórmula sem saber a tabela real da Klan, então o
 *     fluxo só qualifica (qual piercing, qual joia) e encaminha pra um
 *     humano confirmar valor/agenda.
 *   - OUTROS (barbearia, micropigmentação, escola de tatuagem e qualquer
 *     outra dúvida): coleta livre + encaminha — sem inventar cardápio de
 *     serviços que eu não tenho detalhe real pra descrever com precisão.
 *
 * ---------------------------------------------------------------------------
 * DESENHO DO FLUXO
 * ---------------------------------------------------------------------------
 * TRIGGER (primeira mensagem)
 *   -> Boas-vindas + "Qual seu nome?" (texto fixo, pausa)
 *   -> Captura do nome (IA dedicada, mesmo padrão validado no Salão de
 *      Beleza/KFG: node pequeno e focado é mais confiável que um genérico)
 *   -> Menu principal (texto fixo, numerado): 1-Tatuagem, 2-Piercing,
 *      3-Outros assuntos
 *   -> Cadeia de condições (nome OU número) desvia pra 3 sub-fluxos:
 *      1) TATUAGEM: pede foto de referência -> IA com visão real
 *         (`analyzeAttachedImages: true`) coleta estilo, complexidade
 *         (1-5), tamanho (cm) e região do corpo, tolerando qualquer ordem
 *         -> bloco de Webhook chama `/api/webhooks/tattoo-price` (nesta
 *         mesma aplicação — ver PLACEHOLDER de fórmula lá) -> apresenta a
 *         faixa de preço estimada, deixando claro que é aproximado ->
 *         encaminha pra um artista confirmar.
 *      2) PIERCING: pergunta qual piercing + joia desejada (IA dedicada,
 *         texto livre — sem catálogo fixo, a Klan decide as opções reais
 *         depois) -> encaminha direto pra equipe confirmar valor/agenda.
 *      3) OUTROS: coleta livre do que a cliente precisa (IA dedicada) ->
 *         encaminha.
 *   -> Os 3 caminhos convergem na MESMA notificação final
 *      (`klan-lead-alert`) pro WhatsApp interno da Klan — campos que não
 *      se aplicam a um caminho específico ficam "Não se aplica" (mesmo
 *      princípio já usado no template da KFG).
 *
 * PLACEHOLDERS que precisam ser preenchidos pela Klan antes de ativar:
 *   - Número(s) de WhatsApp que recebem a notificação de lead
 *     (`klan-lead-alert.recipientPhones`, hoje `[""]`).
 *   - Fórmula de preço de tatuagem em `src/app/api/webhooks/tattoo-price/route.ts`
 *     (valores atuais são só um ponto de partida razoável, não a tabela real).
 */

import type { Node, Edge } from "@xyflow/react";
import { conditionNode, plainTextNode, edge } from "./flow-helpers";

export const KLAN_TATTOO_TEMPLATE_NAME = "Klan Tattoo — Tatuagem, Piercing e Outros Serviços";

/** URL do endpoint de cálculo de preço de tatuagem — mesma aplicação, ver route.ts para a fórmula. */
const TATTOO_PRICE_WEBHOOK_URL = "https://saas-automacao-eight.vercel.app/api/webhooks/tattoo-price";

/**
 * Monta uma cadeia de condições em OR (uma checagem por vez, em sequência —
 * nunca "por eliminação"): se alguma bater, vai direto para `yesTarget`; se
 * nenhuma bater, cai em `fallbackTarget`. Cópia local (não importada de
 * `beauty-salon-template.ts`/`kfg-template.ts`, que não devem ser tocados
 * por este arquivo) do mesmo helper já usado e validado nos outros dois —
 * ver comentário equivalente em `kfg-template.ts` sobre quando promover
 * isso pra `flow-helpers.ts`.
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

const LEAD_NOTIFICATION_MESSAGE = `🐉 *NOVO LEAD — KLAN TATTOO* 🐉
📅 *Data:* {{data_atual}}
👤 *Nome:* {{lead_nome}}
📱 *WhatsApp:* {{lead_phone}}
🎯 *Serviço procurado:* {{servico_procurado}}
🖋️ *Estilo:* {{estilo_tatuagem}}
📏 *Tamanho:* {{tamanho_cm}} cm
📍 *Região do corpo:* {{regiao_corpo}}
💰 *Estimativa de preço:* {{preco_estimado}}
💎 *Piercing/joia:* {{tipo_piercing}}
📝 *Resumo do atendimento:* {{resumo_ia}}`;

const AI_NOME_PROMPT = `Você é a assistente virtual da Klan Tattoo, estúdio de tatuagem e piercing em São Caetano do Sul. A cliente acabou de receber uma mensagem de boas-vindas perguntando o nome dela.

Sua ÚNICA função aqui é capturar o nome (ou como ela preferir se identificar) em \`lead_nome\`. NADA mais — um PRÓXIMO bloco (fora do seu controle) já cuida do resto assim que você marcar "done": true.

Regras:
- Assim que a mensagem mais recente da cliente contiver QUALQUER texto que pareça um nome de pessoa, marque "done": true IMEDIATAMENTE. NÃO peça confirmação, NÃO faça pergunta de acompanhamento. NO MESMO JSON, "variables" TEM que incluir \`lead_nome\` preenchido.
- Se, ANTES de dizer o nome, a cliente mandar qualquer outra coisa (pergunta, foto, textão sobre o que ela quer): NÃO responda esse conteúdo agora — só diga com gentileza que você só está autorizada a falar sobre assuntos da Klan Tattoo, e repita o pedido do nome. Isso será tratado depois por outro bloco. NUNCA marque "needsHuman": true só por isso.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const MENU_PRINCIPAL_MESSAGE = `Perfeito, {{lead_nome}}! 🐉 Me conta, você tem interesse em:

1️⃣ Tatuagem
2️⃣ Piercing
3️⃣ Outros assuntos (barbearia, micropigmentação, escola de tatuagem, dúvidas)

Responda com o número da opção. 😊`;

const MENU_PRINCIPAL_RETRY_MESSAGE = `Desculpe, não entendi 🙏 Por favor, responda só com o número:
1️⃣ Tatuagem
2️⃣ Piercing
3️⃣ Outros assuntos`;

// ===== TATUAGEM =====

const ASK_FOTO_TATUAGEM_MESSAGE = `Show! Pra eu te dar uma ideia de valor, me manda uma foto de referência da tatuagem que você quer (pode ser um print, desenho ou foto de outra tattoo parecida) 📸

Se ainda não tiver uma imagem, pode descrever com detalhes que eu me viro. 😉`;

/**
 * Prompt multi-propósito (mesmo princípio já validado no template da KFG,
 * ex: `AI_DADOS_FINANCIAMENTO_PROMPT`): coleta 4 campos em qualquer ordem,
 * tolerando tudo de uma vez ou aos poucos. A avaliação de complexidade usa
 * a imagem DE VERDADE quando `analyzeAttachedImages` estiver ligado neste
 * node (ver doc do flag em `src/components/flows/nodes/types.ts`) — sem
 * isso, o modelo só veria o link da foto em texto, não os pixels.
 */
const AI_TATUAGEM_PROMPT = `Você é a assistente virtual da Klan Tattoo. A cliente já disse que quer uma TATUAGEM e acabou de receber um pedido pra mandar uma foto de referência (ou descrever, se não tiver imagem).

Sua função aqui é coletar 4 informações, em qualquer ordem, tolerando tudo junto ou aos poucos:

1. \`estilo_tatuagem\` — o estilo (ex: fineline, realismo, old school, tribal, aquarela, blackwork, oriental) + uma breve descrição do que a referência mostra.
2. \`complexidade_estimada\` — um número de "1" a "5" avaliando a complexidade do DESENHO (não do preço):
   - "1": traço simples, poucas linhas, sem sombra (ex: símbolo pequeno, palavra).
   - "2": desenho simples com leve sombreamento ou mais de um elemento pequeno.
   - "3": desenho médio, sombreamento moderado ou alguns detalhes.
   - "4": bastante detalhe, sombreamento complexo ou várias cores.
   - "5": realismo, altíssimo detalhe, muitas cores/sombras.
   SE uma imagem foi anexada a esta mensagem, avalie observando a imagem DE VERDADE — estilo, quantidade de linhas, sombreamento, cores. SE não houver imagem (só descrição em texto), estime pela descrição da forma mais razoável possível — nunca deixe de preencher esse campo só por falta de foto.
3. \`tamanho_cm\` — tamanho aproximado em CENTÍMETROS (maior dimensão). Se a cliente não souber precisar, ajude comparando com algo conhecido (ex: "tamanho de uma moeda de 1 real", "da palma da mão") e converta você mesma pra uma estimativa em cm (só o número, ex: "8").
4. \`regiao_corpo\` — em que parte do corpo ela quer fazer.

Regras:
- CRÍTICO — em TODO turno, mesmo com "done": false, "variables" TEM que incluir todo campo que você já tiver certeza — nunca segure um campo já confirmado pro turno final.
- Confira primeiro o bloco "DADOS JÁ CONFIRMADOS" antes de perguntar de novo qualquer campo que já esteja lá.
- Peça só o que ainda estiver faltando — pode ser numa única pergunta cobrindo vários campos de uma vez.
- Assim que tiver os 4 campos, marque "done": true IMEDIATAMENTE, e inclua TAMBÉM \`resumo_ia\` (1 frase, ex: "Cliente quer tatuagem estilo fineline, 8cm, no antebraço.") — os 5 campos são obrigatórios nesse turno, nenhum opcional. "reply" não é enviado ao cliente nesse caso (o sistema mostra a estimativa de preço em seguida), mas preencha algo breve mesmo assim.
- Se a cliente perguntar/comentar algo sem relação com a tatuagem: não responda o conteúdo, diga com gentileza que você só fala sobre assuntos da Klan Tattoo, e repita o que falta. NUNCA marque "needsHuman": true só por isso.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const APRESENTA_PRECO_MESSAGE = `Com base no que você me contou (estilo *{{estilo_tatuagem}}*, {{tamanho_cm}}cm, região {{regiao_corpo}}), a estimativa fica em torno de *{{preco_estimado}}*. 💰

Importante: esse é só um valor aproximado — o preço final é sempre confirmado por um dos nossos tatuadores, presencialmente ou pelo decalque. Já vou te conectar com a equipe pra tirar dúvidas e, se quiser, agendar sua avaliação! 😊`;

// ===== PIERCING =====

const ASK_PIERCING_MESSAGE = `Legal! Me conta qual piercing você tem interesse (ex: orelha, nariz, sobrancelha, umbigo...) e se já sabe qual joia gostaria 💎`;

const AI_PIERCING_PROMPT = `Você é a assistente virtual da Klan Tattoo. A cliente já disse que quer um PIERCING e acabou de receber uma pergunta sobre qual piercing e qual joia ela tem em mente.

Sua função aqui é coletar \`tipo_piercing\` (texto livre — o local do piercing e, se ela souber, a joia desejada, ex: "Piercing no nariz, joia de argolinha prata") e \`resumo_ia\` (1 frase resumindo).

Regras:
- Assim que souber pelo menos o LOCAL do piercing (mesmo sem saber a joia ainda), marque "done": true IMEDIATAMENTE — não trave esperando ela decidir a joia, isso o time confirma pessoalmente. NO MESMO JSON, "variables" TEM que incluir \`tipo_piercing\` E \`resumo_ia\` preenchidos.
- Se ela mencionar mais de um piercing de interesse, inclua todos em \`tipo_piercing\`.
- Se a cliente perguntar/comentar algo sem relação com piercing: não responda o conteúdo, diga com gentileza que você só fala sobre assuntos da Klan Tattoo, e repita a pergunta. NUNCA marque "needsHuman": true só por isso.
- "reply" não é enviado quando "done": true (o sistema mostra a próxima etapa sozinho), mas preencha algo breve.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const HANDOFF_PIERCING_MESSAGE = `Perfeito! Já vou te conectar com nossa equipe pra confirmar valores, disponibilidade e agendar seu horário. 😊`;

// ===== OUTROS =====

const ASK_OUTROS_MESSAGE = `Sem problemas! Me conta um pouco mais sobre o que você precisa (barbearia, micropigmentação, escola de tatuagem, ou outra dúvida) que já te encaminho pro time certo. 😊`;

const AI_OUTROS_PROMPT = `Você é a assistente virtual da Klan Tattoo — um estúdio que também oferece barbearia, micropigmentação e escola de tatuagem, além de organizar a Tattoo Week. A cliente escolheu "Outros assuntos" e acabou de receber um pedido pra contar o que ela precisa.

Sua função aqui é coletar \`servico_procurado\` (o assunto/serviço que ela procura, na palavra dela) e \`resumo_ia\` (1-2 frases resumindo o pedido, com o máximo de detalhe útil que ela já tiver dado).

Regras:
- Assim que entender o assunto principal, marque "done": true — não precisa esgotar todos os detalhes, o time humano completa depois. NO MESMO JSON, "variables" TEM que incluir \`servico_procurado\` E \`resumo_ia\` preenchidos.
- Se a dúvida for vaga, peça um pouco mais de contexto (ex: "pode me contar um pouco mais?") antes de marcar "done".
- "reply" não é enviado quando "done": true (o sistema mostra a próxima etapa sozinho), mas preencha algo breve.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const HANDOFF_OUTROS_MESSAGE = `Entendi! Já vou te conectar com a pessoa certa da nossa equipe pra te ajudar. 😊`;

const HANDOFF_TATUAGEM_MESSAGE = `Já estou te conectando com um dos nossos artistas! Em breve alguém da equipe continua seu atendimento por aqui mesmo. 🐉`;

const NODES: Node[] = [
  {
    id: "klan-trigger",
    type: "trigger",
    position: { x: 600, y: 0 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },

  plainTextNode(
    "klan-ask-nome",
    { x: 600, y: 140 },
    "Boas-vindas + pergunta o nome",
    `Olá! Seja muito bem-vindo(a) à Klan Tattoo! 🐉✨ Somos um estúdio de tatuagem e piercing aqui em São Caetano do Sul.\n\nQual é o seu nome?`,
    true
  ),
  {
    id: "klan-ai-nome",
    type: "aiResponse",
    position: { x: 600, y: 180 },
    data: { label: "Captura (IA) — nome", useGlobalPrompt: false, customPrompt: AI_NOME_PROMPT, suppressReplyOnDone: true },
  },

  plainTextNode("klan-menu-principal", { x: 600, y: 320 }, "Menu principal", MENU_PRINCIPAL_MESSAGE, true),
  plainTextNode("klan-menu-principal-retry", { x: 200, y: 620 }, "Menu principal (não entendi)", MENU_PRINCIPAL_RETRY_MESSAGE, true),

  ...orConditionChain("klan-cond-tatuagem-", "Escolheu tatuagem?", [{ value: "tatuagem" }, { value: "1", operator: "EQUALS" }], "klan-set-tatuagem", "klan-cond-piercing-1", 400).nodes,
  ...orConditionChain("klan-cond-piercing-", "Escolheu piercing?", [{ value: "piercing" }, { value: "2", operator: "EQUALS" }], "klan-set-piercing", "klan-cond-outros-1", 400).nodes,
  ...orConditionChain("klan-cond-outros-", "Escolheu outros?", [{ value: "outro" }, { value: "3", operator: "EQUALS" }], "klan-set-outros", "klan-menu-principal-retry", 400).nodes,

  // ===== TATUAGEM =====
  plainTextNode("klan-set-tatuagem", { x: 900, y: 500 }, "Define serviço — tatuagem", "(silencioso)", false, false, {
    setVariables: { servico_procurado: "Tatuagem" },
    skipSend: true,
  }),
  plainTextNode("klan-ask-foto", { x: 900, y: 540 }, "Pede foto de referência", ASK_FOTO_TATUAGEM_MESSAGE, true),
  {
    id: "klan-ai-tatuagem",
    type: "aiResponse",
    position: { x: 900, y: 580 },
    data: {
      label: "Captura (IA + visão) — estilo, tamanho, região",
      useGlobalPrompt: false,
      customPrompt: AI_TATUAGEM_PROMPT,
      analyzeAttachedImages: true,
      suppressReplyOnDone: true,
    },
  },
  {
    id: "klan-webhook-preco",
    type: "webhook",
    position: { x: 900, y: 620 },
    data: { label: "Calcula estimativa de preço", url: TATTOO_PRICE_WEBHOOK_URL },
  },
  plainTextNode("klan-apresenta-preco", { x: 900, y: 660 }, "Apresenta estimativa de preço", APRESENTA_PRECO_MESSAGE, false, false),
  plainTextNode("klan-handoff-tatuagem", { x: 900, y: 700 }, "Tatuagem — encaminhamento", HANDOFF_TATUAGEM_MESSAGE, false, true),

  // ===== PIERCING =====
  plainTextNode("klan-set-piercing", { x: 1150, y: 500 }, "Define serviço — piercing", "(silencioso)", false, false, {
    setVariables: { servico_procurado: "Piercing" },
    skipSend: true,
  }),
  plainTextNode("klan-ask-piercing", { x: 1150, y: 540 }, "Pergunta piercing/joia", ASK_PIERCING_MESSAGE, true),
  {
    id: "klan-ai-piercing",
    type: "aiResponse",
    position: { x: 1150, y: 580 },
    data: { label: "Captura (IA) — piercing/joia", useGlobalPrompt: false, customPrompt: AI_PIERCING_PROMPT, suppressReplyOnDone: true },
  },
  plainTextNode("klan-handoff-piercing", { x: 1150, y: 620 }, "Piercing — encaminhamento", HANDOFF_PIERCING_MESSAGE, false, true),

  // ===== OUTROS =====
  plainTextNode("klan-set-outros", { x: 1400, y: 500 }, "Define serviço — outros (placeholder)", "(silencioso)", false, false, {
    setVariables: { servico_procurado: "Outros" },
    skipSend: true,
  }),
  plainTextNode("klan-ask-outros", { x: 1400, y: 540 }, "Pergunta o que precisa", ASK_OUTROS_MESSAGE, true),
  {
    id: "klan-ai-outros",
    type: "aiResponse",
    position: { x: 1400, y: 580 },
    data: { label: "Captura (IA) — outros assuntos", useGlobalPrompt: false, customPrompt: AI_OUTROS_PROMPT, suppressReplyOnDone: true },
  },
  plainTextNode("klan-handoff-outros", { x: 1400, y: 620 }, "Outros — encaminhamento", HANDOFF_OUTROS_MESSAGE, false, true),

  // ===== NOTIFICAÇÃO FINAL COMPARTILHADA =====
  {
    id: "klan-lead-alert",
    type: "alertNotification",
    position: { x: 1150, y: 760 },
    data: {
      label: "Notificação: novo lead (número pendente)",
      recipientPhones: [""],
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("klan-e-trigger-ask-nome", "klan-trigger", "klan-ask-nome"),
  edge("klan-e-ask-nome-ai", "klan-ask-nome", "klan-ai-nome"),
  edge("klan-e-ai-nome-menu", "klan-ai-nome", "klan-menu-principal"),

  edge("klan-e-menu-cond-tatuagem", "klan-menu-principal", "klan-cond-tatuagem-1"),
  edge("klan-e-menuretry-cond-tatuagem", "klan-menu-principal-retry", "klan-cond-tatuagem-1"),
  ...orConditionChain("klan-cond-tatuagem-", "Escolheu tatuagem?", [{ value: "tatuagem" }, { value: "1", operator: "EQUALS" }], "klan-set-tatuagem", "klan-cond-piercing-1", 400).edges,
  ...orConditionChain("klan-cond-piercing-", "Escolheu piercing?", [{ value: "piercing" }, { value: "2", operator: "EQUALS" }], "klan-set-piercing", "klan-cond-outros-1", 400).edges,
  ...orConditionChain("klan-cond-outros-", "Escolheu outros?", [{ value: "outro" }, { value: "3", operator: "EQUALS" }], "klan-set-outros", "klan-menu-principal-retry", 400).edges,

  // Tatuagem
  edge("klan-e-set-tatuagem-ask-foto", "klan-set-tatuagem", "klan-ask-foto"),
  edge("klan-e-ask-foto-ai", "klan-ask-foto", "klan-ai-tatuagem"),
  edge("klan-e-ai-tatuagem-webhook", "klan-ai-tatuagem", "klan-webhook-preco"),
  edge("klan-e-webhook-apresenta-preco", "klan-webhook-preco", "klan-apresenta-preco"),
  edge("klan-e-apresenta-preco-handoff", "klan-apresenta-preco", "klan-handoff-tatuagem"),
  edge("klan-e-handoff-tatuagem-alert", "klan-handoff-tatuagem", "klan-lead-alert"),

  // Piercing
  edge("klan-e-set-piercing-ask", "klan-set-piercing", "klan-ask-piercing"),
  edge("klan-e-ask-piercing-ai", "klan-ask-piercing", "klan-ai-piercing"),
  edge("klan-e-ai-piercing-handoff", "klan-ai-piercing", "klan-handoff-piercing"),
  edge("klan-e-handoff-piercing-alert", "klan-handoff-piercing", "klan-lead-alert"),

  // Outros
  edge("klan-e-set-outros-ask", "klan-set-outros", "klan-ask-outros"),
  edge("klan-e-ask-outros-ai", "klan-ask-outros", "klan-ai-outros"),
  edge("klan-e-ai-outros-handoff", "klan-ai-outros", "klan-handoff-outros"),
  edge("klan-e-handoff-outros-alert", "klan-handoff-outros", "klan-lead-alert"),
];

/**
 * Retorna uma cópia independente (deep clone) dos nodes/edges do template —
 * mesmo padrão de `createBeautySalonTemplate`/`createKfgTemplate`.
 */
export function createKlanTattooTemplate(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(NODES)) as Node[],
    edges: JSON.parse(JSON.stringify(EDGES)) as Edge[],
  };
}
