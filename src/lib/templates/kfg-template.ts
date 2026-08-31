/**
 * Template pré-definido do Construtor de Fluxos para a Agência KFG
 * (revenda de veículos) — segundo cliente real da plataforma, totalmente
 * independente do template de Salão de Beleza (`beauty-salon-template.ts`)
 * e do Diagnóstico Comercial (`digital-analytics-template.ts`): nenhum dos
 * dois é alterado por este arquivo.
 *
 * ---------------------------------------------------------------------------
 * CONTEXTO DO NEGÓCIO (repassado pelo Igor... digo, pelo dono da KFG, via
 * WhatsApp pro Luan)
 * ---------------------------------------------------------------------------
 * A primeira mensagem de cada conversa vem de um anúncio de tráfego pago no
 * Instagram — cada veículo tem seu próprio criativo, e o botão "Falar no
 * WhatsApp" já entra com um texto pré-preenchido específico daquele veículo
 * (ex: "Olá, tenho interesse no Onix"). Por isso o fluxo detecta o veículo
 * de interesse por PALAVRA-CHAVE já na primeira mensagem, antes mesmo de
 * cumprimentar — ver `VEHICLE_CATALOG` e a cadeia de condições logo após o
 * trigger.
 *
 * A lista de veículos abaixo (Onix, Jetta, BMW, Polo, Fox) é um PLACEHOLDER
 * combinado com o Luan — o dono da KFG ainda vai informar os modelos reais
 * que vai anunciar. Trocar é só editar `VEHICLE_CATALOG` (um único lugar).
 *
 * ---------------------------------------------------------------------------
 * DESENHO DO FLUXO
 * ---------------------------------------------------------------------------
 * TRIGGER (primeira mensagem, ex: "Olá, tenho interesse no Onix")
 *   -> detecção de veículo por palavra-chave (determinística, sem IA) ->
 *      grava `veiculo_anuncio` se encontrar, senão segue sem nada
 *   -> Boas-vindas + "Qual seu nome?" (texto fixo, pausa)
 *   -> Captura do nome (IA dedicada, só isso — mesmo padrão já validado no
 *      Salão de Beleza: node pequeno e focado é muito mais confiável que
 *      pedir pra um node genérico "lembrar" de extrair um campo a mais)
 *   -> Pergunta qual veículo despertou o interesse — texto varia conforme
 *      `veiculo_anuncio` ter sido detectado ou não (dois nodes estáticos,
 *      nunca a IA decidindo o que perguntar), mas SEMPRE pergunta -> IA
 *      dedicada captura `veiculo_interesse` (só marca/modelo, NUNCA
 *      ano/versão/km — isso é assunto pro consultor humano tratar depois).
 *      Se a cliente disser que não sabe qual veículo quer, ou pedir pra ver
 *      o catálogo, a IA marca `needsHuman` e o fluxo desvia direto pra um
 *      handoff dedicado (`kfg-handoff-sem-veiculo`), sem passar pelo menu
 *      de negociação.
 *   -> Menu de negociação (texto fixo, numerado): 1-À vista, 2-Troca,
 *      3-Financiamento, 4-Outros assuntos
 *   -> Cadeia de condições (nome OU número, igual ao menu do Salão de
 *      Beleza) desvia pra 4 sub-fluxos:
 *      1) À VISTA: nada mais a perguntar -> encaminha direto.
 *      2) TROCA: pergunta modelo/ano/km/versão do veículo a dar na troca
 *         (IA dedicada) -> encaminha.
 *      3) FINANCIAMENTO: pergunta restrição bancária (SIM/NÃO, com um node
 *         de IA pequeno normalizando a resposta — mesmo padrão da sondagem
 *         de química do Salão de Beleza — antes de um bloco de Condição
 *         desviar deterministicamente):
 *         - SIM -> mensagem fixa tranquilizando -> encaminha direto.
 *         - NÃO -> pergunta CNH ativa + CPF + data de nascimento juntos
 *           (IA dedicada, tolera qualquer ordem/tudo de uma vez, mesmo
 *           padrão da sondagem capilar) -> mensagem fixa de fechamento ->
 *           encaminha.
 *      4) OUTROS ASSUNTOS: submenu (Currículo / Parcerias / Pós-venda):
 *         - Currículo: pede o currículo, agradece ao receber, ENCERRA a
 *           conversa (sem encaminhar pra ninguém, conforme pedido).
 *         - Parcerias: pede um resumo da proposta, agradece, ENCERRA.
 *         - Pós-venda: encaminha direto pro WhatsApp do pós-venda (número
 *           ainda não informado — placeholder, preencher depois).
 *   -> "Encaminhar" = mensagem fixa de fechamento pro cliente
 *      (`disablesAiForChat`) + notificação interna pro WhatsApp comercial
 *      da KFG (número ainda não informado — placeholder, preencher no bloco
 *      de Notificação/Alerta pelo Construtor de Fluxos antes de ativar).
 *
 * Todos os 4 sub-fluxos convergem no MESMO node de notificação final
 * (`kfg-lead-alert`), usando o MESMO formato de mensagem pedido pelo dono
 * da KFG — campos que não se aplicam a um caminho específico (ex: CPF na
 * compra à vista) ficam com o valor "Não se aplica" (mesmo princípio do
 * "Não enviada" já usado pras fotos no Salão de Beleza).
 */

import type { Node, Edge } from "@xyflow/react";
import { conditionNode, plainTextNode, edge } from "./flow-helpers";

export const KFG_TEMPLATE_NAME = "Agência KFG — Revenda de Veículos";

/**
 * Monta uma cadeia de condições em OR (uma checagem por vez, em sequência —
 * nunca "por eliminação"): se alguma bater, vai direto para `yesTarget`; se
 * nenhuma bater, cai em `fallbackTarget`. Cópia local (não importada de
 * `beauty-salon-template.ts`, que não deve ser tocado por este arquivo) do
 * mesmo helper já usado e validado lá — se um TERCEIRO template precisar
 * disso de novo, aí sim vale a pena promover pra `flow-helpers.ts`.
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

/**
 * Catálogo de veículos anunciados — PLACEHOLDER, o dono da KFG ainda vai
 * informar os modelos reais. `keywords` são as formas de reconhecer o
 * veículo tanto na mensagem pré-preenchida do anúncio quanto numa resposta
 * livre da cliente (nome do modelo, minúsculo, sem acento sensível — a
 * comparação já ignora maiúsculas/minúsculas).
 */
const VEHICLE_CATALOG: { name: string; keywords: string[] }[] = [
  { name: "Onix", keywords: ["onix"] },
  { name: "Jetta", keywords: ["jetta"] },
  { name: "BMW", keywords: ["bmw"] },
  { name: "Polo", keywords: ["polo"] },
  { name: "Fox", keywords: ["fox"] },
];

/**
 * Mensagem de notificação de lead qualificado enviada pro WhatsApp comercial
 * da KFG. Segue o formato combinado com o dono da KFG (campos Nome, CPF,
 * Data de Nascimento, CNH ativa, WhatsApp, Serviço procurado, Possui
 * restrição bancária, Resumo do atendimento) com a adição de "Veículo de
 * Interesse" (claramente necessário pro contexto, o dono só não escreveu
 * explicitamente no rascunho que mandou). Detalhes que só fazem sentido no
 * caminho de Troca (modelo/ano/km/versão do veículo a dar na troca) entram
 * dentro do resumo do atendimento em vez de um campo fixo à parte — mantém
 * a notificação com o mesmo formato em qualquer caminho.
 */
const LEAD_NOTIFICATION_MESSAGE = `🔥 *NOVO LEAD QUALIFICADO* 🔥
📅 *Data:* {{data_atual}}
👤 *Nome:* {{lead_nome}}
📱 *WhatsApp:* {{lead_phone}}
🚗 *Veículo de Interesse:* {{veiculo_interesse}}
🏢 *Serviço procurado:* {{servico_procurado}}
📄 *CPF:* {{cpf}}
🎂 *Data de Nascimento:* {{data_nascimento}}
🚘 *CNH Ativa:* {{cnh_ativa}}
🧪 *Possui restrição bancária:* {{possui_restricao_bancaria}}
🎯 *Resumo do Atendimento:* {{resumo_ia}}`;

const HANDOFF_COMERCIAL_MESSAGE = `Perfeito! Já estou te encaminhando para um dos nossos consultores, que vai continuar seu atendimento por aqui mesmo. Em breve você será atendido(a)! 🚗😊`;

const HANDOFF_SEM_VEICULO_MESSAGE = `Sem problemas! Vou te conectar com um dos nossos consultores, que pode te mostrar as opções disponíveis e te ajudar a escolher o veículo ideal pra você. 😊`;

const HANDOFF_POS_VENDA_MESSAGE = `Só um momento! Vou te direcionar para o nosso time de pós-venda, que vai continuar seu atendimento por aqui mesmo. 😊`;

/**
 * Prompt do node dedicado de captura do nome — mesmo princípio já validado
 * no Salão de Beleza (`AI_NOME_ANIVERSARIO_PROMPT`): um node pequeno e
 * focado numa única coisa é muito mais confiável do que um node genérico
 * que também precisa lembrar de extrair isso no meio de outras tarefas.
 */
const AI_NOME_PROMPT = `Você é a assistente virtual da KFG Veículos. A cliente acabou de receber uma mensagem de boas-vindas perguntando o nome dela.

Sua ÚNICA função aqui é capturar o nome completo (ou como ela preferir se identificar) em \`lead_nome\`.

Regras:
- Assim que tiver o nome, marque "done": true IMEDIATAMENTE, e NO MESMO JSON o campo "variables" TEM que incluir \`lead_nome\` preenchido — isso é obrigatório, mesmo que "reply" não seja enviado ao cliente nesse caso (o sistema já cuida da próxima mensagem sozinho). Marcar "done": true sem incluir \`lead_nome\` nesse mesmo turno é um erro — não há uma segunda chance de preenchê-lo depois.
- Se a cliente perguntar ou comentar algo sem relação com o atendimento da KFG antes de dizer o nome: não responda o conteúdo — diga com gentileza que você só está autorizada a falar sobre assuntos da KFG, e repita o pedido do nome. NUNCA marque "needsHuman": true só por isso.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

/**
 * Prompt do node dedicado de captura do veículo de interesse. Recebe o
 * catálogo de veículos como referência (pra normalizar o nome, ex: cliente
 * escreve "onix ltz" e ela salva "Onix") e o veículo já detectado no
 * anúncio (se houver), pra saber quando a cliente está apenas confirmando o
 * mesmo veículo em vez de citar um novo.
 */
function buildAiInteresseVeiculoPrompt(): string {
  const catalogList = VEHICLE_CATALOG.map((v) => v.name).join(", ");
  return `Você é a assistente virtual da KFG Veículos. A cliente acabou de receber uma pergunta sobre qual veículo despertou o interesse dela — a pergunta pode ter mencionado um veículo específico (o do anúncio que ela clicou) perguntando se é só esse ou se ela quer ver outros também, ou pode ter sido uma pergunta aberta (quando não sabíamos ainda qual veículo era).

Catálogo de veículos que a KFG trabalha atualmente (use pra normalizar o nome que a cliente disser, ex: "onix ltz" -> "Onix" — mas se ela citar um modelo que não está nesta lista, registre exatamente o que ela disse, sem inventar nem forçar pra um destes): ${catalogList}.

Sua ÚNICA função aqui é determinar \`veiculo_interesse\` (o veículo final que ela quer negociar). MARCA (ex: "Chevrolet", "Volkswagen") e MODELO (ex: "Onix", "Jetta") são coisas diferentes — trate cada caso assim:

1. Se ela já disser um MODELO específico (com ou sem a marca junto, ex: "Onix" ou "Chevrolet Onix"), isso já é suficiente pra prosseguir: salve em \`veiculo_interesse\` e marque "done": true IMEDIATAMENTE. NUNCA peça detalhes a mais (ano, versão, cor, quilometragem etc.) — isso é assunto pro consultor humano tratar depois, não seu.
2. Se ela confirmar que é o mesmo veículo do anúncio (bloco "DADOS JÁ CONFIRMADOS", chave \`veiculo_anuncio\` — ex: "só esse", "sim", "isso mesmo"), copie o valor de \`veiculo_anuncio\` pra \`veiculo_interesse\` e marque "done": true.
3. Se ela disser SÓ a marca, sem modelo nenhum (ex: "quero uma Chevrolet", "queria ver Fiat"), NÃO aceite isso como suficiente ainda — pergunte gentilmente qual modelo dessa marca ela tem em mente. Marque "done": false.
4. Se ela disser que não sabe qual veículo quer, ou pedir pra ver o catálogo/opções disponíveis, marque "needsHuman": true (NÃO preencha \`veiculo_interesse\` nesse caso) — seu "reply" deve ser breve, avisando que você vai conectá-la com um consultor que pode mostrar as opções.

Regras:
- Quando marcar "done": true, NO MESMO JSON o campo "variables" TEM que incluir \`veiculo_interesse\` preenchido — obrigatório, mesmo que "reply" não seja enviado ao cliente nesse caso (o sistema mostra a próxima etapa sozinho). Marcar "done": true sem incluir \`veiculo_interesse\` é um erro.
- Se a cliente perguntar ou comentar algo sem relação nenhuma com veículos/negociação, não responda o conteúdo — diga com gentileza que você só está autorizada a falar sobre assuntos da KFG, e repita o pedido do veículo. Isso NUNCA é motivo pra marcar "needsHuman": true.
- Seja calorosa, use poucos emojis, mensagens curtas.`;
}

const MENU_NEGOCIACAO_MESSAGE = `Legal! Agora preciso entender como você prefere negociar o veículo:

1️⃣ Compra à vista
2️⃣ Troca por outro veículo
3️⃣ Financiamento
4️⃣ Outros assuntos

Responda com o número da opção. 😊`;

const MENU_NEGOCIACAO_RETRY_MESSAGE = `Desculpe, não entendi 🙏 Por favor, responda só com o número:
1️⃣ Compra à vista
2️⃣ Troca por outro veículo
3️⃣ Financiamento
4️⃣ Outros assuntos`;

const AI_TROCA_PROMPT = `Você é a assistente virtual da KFG Veículos. A cliente escolheu negociar o veículo novo dando outro veículo como parte do pagamento (troca), e acabou de receber uma mensagem pedindo os dados do veículo que ela quer dar na troca: modelo, ano, quilometragem e versão.

Sua ÚNICA função aqui é capturar essas informações em \`veiculo_troca_info\` (texto livre, juntando tudo o que ela informou num só resumo, ex: "Gol 2018, 80 mil km, versão Trendline") e preencher \`resumo_ia\` com um resumo curto (1 frase) do atendimento até aqui.

IMPORTANTE — o veículo NOVO que ela quer comprar (\`veiculo_interesse\`) NÃO é sua responsabilidade aqui, mesmo que apareça vazio ou ausente no bloco "DADOS JÁ CONFIRMADOS": NUNCA pergunte qual é esse veículo, NUNCA peça a versão dele, NUNCA tente completar ou corrigir esse campo — isso já foi tratado (ou intencionalmente pulado) em uma etapa anterior do fluxo. Sua tarefa é só sobre o veículo da TROCA (o que ela está entregando), nunca o que ela quer comprar.

Pro \`resumo_ia\`: se \`veiculo_interesse\` estiver no bloco "DADOS JÁ CONFIRMADOS", cite-o (ex: "Cliente interessada no Onix, quer negociar via troca de um Gol 2018 com 80 mil km."); se NÃO estiver, componha sem mencionar o veículo de interesse (ex: "Cliente quer negociar via troca de um Gol 2018 com 80 mil km — veículo de interesse a confirmar com o consultor.").

Regras:
- Ela pode responder tudo de uma vez ou aos poucos, em mensagens separadas — peça só o que ainda estiver faltando (modelo, ano, km, versão do veículo DA TROCA), nunca repita o que já foi dado.
- Assim que tiver pelo menos modelo e ano do veículo da troca (km e versão são bons de ter, mas não trave o atendimento se ela não souber de cabeça), marque "done": true, e NO MESMO JSON o campo "variables" TEM que incluir \`veiculo_troca_info\` E \`resumo_ia\` preenchidos — obrigatório, mesmo que "reply" não seja enviado ao cliente nesse caso (o sistema já mostra a próxima etapa sozinho). Marcar "done": true sem os dois campos nesse mesmo turno é um erro.
- Se a cliente perguntar ou comentar algo sem relação com o veículo da troca: não responda o conteúdo — diga com gentileza que você só está autorizada a falar sobre assuntos da KFG, e repita o pedido. NUNCA marque "needsHuman": true só por isso.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const RESTRICAO_BANCARIA_MESSAGE = `Perfeito! Pra seguirmos com o financiamento, me diz uma coisa: você possui alguma restrição bancária no seu nome (SPC/Serasa)?

1️⃣ Sim
2️⃣ Não`;

const AI_RESTRICAO_BANCARIA_PROMPT = `Você é a assistente virtual da KFG Veículos. A cliente acabou de receber uma pergunta com duas opções — se ela possui restrição bancária no nome (SPC/Serasa): "1 - Sim" ou "2 - Não".

Sua ÚNICA função aqui é normalizar a resposta dela em \`possui_restricao_bancaria\`, salvando EXATAMENTE o texto "sim" ou "não" (nunca outro valor, nunca em branco). Ignore qualquer outro campo que apareça vazio ou ausente no bloco "DADOS JÁ CONFIRMADOS" (ex: \`veiculo_interesse\`) — não é sua responsabilidade perguntar ou completar nada além da restrição bancária.

Regras:
- Você recebe uma dica pronta "RESOLUÇÃO AUTOMÁTICA DE SIM/NÃO" sempre que a resposta puder ser classificada por código — NUNCA classifique sozinha quando essa dica existir, só copie o valor dela pra \`possui_restricao_bancaria\` e marque "done": true IMEDIATAMENTE.
- Se NÃO houver essa dica (resposta ambígua demais pro código reconhecer), tente você mesma reconhecer variações como "sim"/"tenho"/"infelizmente sim" = "sim", e "não"/"não tenho"/"limpo" = "não". Se ainda assim não ficar claro, peça gentilmente pra ela confirmar com "sim" ou "não" — marque "done": false nesse caso.
- Se a cliente perguntar ou comentar algo sem relação com a restrição bancária: não responda o conteúdo — diga com gentileza que você só está autorizada a falar sobre assuntos da KFG, e repita a pergunta de sim/não. NUNCA marque "needsHuman": true só por isso.
- "reply" não é enviado quando "done": true (o sistema já mostra a próxima etapa sozinho), mas ainda preencha algo breve.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const RESTRICAO_SIM_MESSAGE = `Entendi! Mesmo assim, a KFG consegue te auxiliar na compra do seu novo carro — hoje conseguimos viabilizar a venda mesmo com esse detalhe. Vou te encaminhar com um dos nossos consultores pra conversarmos melhor sobre as opções disponíveis pra você. 😊`;

const RESTRICAO_NAO_MESSAGE = `Ótimo! Com isso, já estamos com 90% de chance de você conseguir seu novo carro. 🎉

Pra agilizar seu atendimento e já agendarmos uma visita, preciso de mais estas informações:

• Você possui CNH ativa? (Sim ou não)
• Seu CPF
• Sua data de nascimento`;

const AI_DADOS_FINANCIAMENTO_PROMPT = `Você é a assistente virtual da KFG Veículos. A cliente acabou de receber uma mensagem pedindo 3 informações: se possui CNH ativa (sim/não), CPF, e data de nascimento.

Sua ÚNICA função aqui é coletar essas 3 informações — elas podem chegar em qualquer ordem, tudo de uma vez ou aos poucos em mensagens separadas; nunca assuma que uma informação não foi dada só porque não veio junto com as outras:

1. CNH ativa (sim/não) → salve em \`cnh_ativa\` como exatamente o texto "sim" ou "não".
2. CPF → salve em \`cpf\` (o número exatamente como ela informou, com ou sem pontuação).
3. Data de nascimento → salve em \`data_nascimento\` (a data exatamente como ela informou).

IMPORTANTE — ignore qualquer outro campo que apareça vazio ou ausente no bloco "DADOS JÁ CONFIRMADOS" (ex: \`veiculo_interesse\`): não é sua responsabilidade perguntar ou completar nada além dessas 3 informações.

Regras:
- Peça SÓ a informação que ainda estiver faltando — nunca repita uma pergunta cuja resposta você já tem, mesmo que tenha vindo numa mensagem anterior separada.
- ANTES de decidir "done", confira CADA UM dos 3 campos individualmente, um por um (não confie na impressão geral da mensagem):
  1. \`cnh_ativa\` — a mensagem atual (ou o histórico) já deixou isso claro?
  2. \`cpf\` — a mensagem atual (ou o histórico) já tem um número de CPF?
  3. \`data_nascimento\` — a mensagem atual (ou o histórico) já tem uma data de nascimento?
- Se as 3 respostas acima forem SIM, marque "done": true IMEDIATAMENTE neste turno — não espere um turno a mais, não peça confirmação. NO MESMO JSON, o campo "variables" TEM que incluir os 3 campos (\`cnh_ativa\`, \`cpf\`, \`data_nascimento\`) E TAMBÉM \`resumo_ia\` (um resumo curto, 1 frase, citando o serviço: financiamento, sem restrição bancária — e o veículo de interesse SÓ se \`veiculo_interesse\` estiver no bloco "DADOS JÁ CONFIRMADOS", senão omita essa parte). Marcar "done": true sem incluir os 4 campos nesse mesmo turno é um erro — não há uma segunda chance depois, a conversa já é encaminhada em seguida. "reply" nesse caso não é enviado ao cliente (o sistema mostra a mensagem de fechamento sozinho), mas ainda assim preencha algo breve.
- Se qualquer um dos 3 ainda não estiver claro, marque "done": false e peça especificamente o que falta.
- Se a cliente perguntar ou comentar algo sem relação com essas 3 informações: não responda o conteúdo — diga com gentileza que você só está autorizada a falar sobre assuntos da KFG, e repita o pedido pelo que falta. NUNCA marque "needsHuman": true só por isso.
- Seja calorosa, use poucos emojis, mensagens curtas.`;

const FINANCIAMENTO_FECHAMENTO_MESSAGE = `Obrigado! Estou encaminhando agora mesmo para um dos nossos consultores — ele vai te ligar pra agendar sua visita. O café é por nossa conta, rs. Tenha um ótimo dia! ☕😊`;

const MENU_OUTROS_MESSAGE = `Sem problemas! Sobre qual assunto você gostaria de falar?

1️⃣ Envio de currículo
2️⃣ Parcerias
3️⃣ Pós-venda

Responda com o número da opção. 😊`;

const MENU_OUTROS_RETRY_MESSAGE = `Desculpe, não entendi 🙏 Por favor, responda só com o número:
1️⃣ Envio de currículo
2️⃣ Parcerias
3️⃣ Pós-venda`;

const CURRICULO_PEDIR_MESSAGE = `Que legal seu interesse em fazer parte do nosso time! Pode enviar seu currículo aqui mesmo (PDF, imagem ou o que for mais fácil pra você) — nossa equipe vai analisar e entrar em contato caso surja uma oportunidade. 😊`;

const CURRICULO_AGRADECIMENTO_MESSAGE = `Recebemos seu currículo, muito obrigado! 🍀 Boa sorte, e qualquer novidade a gente entra em contato por aqui.`;

const PARCERIAS_PEDIR_MESSAGE = `Legal! Me conta um resumo do tipo de parceria que você tem em mente. 🤝`;

const PARCERIAS_AGRADECIMENTO_MESSAGE = `Obrigado pelo interesse! Nossa equipe vai avaliar a proposta e retornar em breve. 😊`;

const NODES: Node[] = [
  // TRIGGER — dispara na primeira mensagem, tipicamente vinda de um
  // anúncio de tráfego pago com texto pré-preenchido específico do veículo.
  {
    id: "kfg-trigger",
    type: "trigger",
    position: { x: 600, y: 0 },
    data: { label: "Primeira mensagem (anúncio)", triggerType: "FIRST_MESSAGE" },
  },

  // Detecção do veículo por palavra-chave, direto na primeira mensagem —
  // não depende de IA nem de esperar uma nova resposta: se o texto que
  // trouxe a cliente até aqui já cita um veículo do catálogo, grava
  // `veiculo_anuncio` antes mesmo do cumprimento.
  ...VEHICLE_CATALOG.flatMap((vehicle, index) => [
    conditionNode(`kfg-cond-veiculo-${index}`, { x: 300, y: 140 + index * 90 }, `Anúncio menciona ${vehicle.name}?`, vehicle.keywords[0]),
    plainTextNode(`kfg-set-veiculo-${index}`, { x: 300, y: 145 + index * 90 }, `Grava veículo — ${vehicle.name}`, `(silencioso)`, false, false, {
      setVariables: { veiculo_anuncio: vehicle.name },
      skipSend: true,
    }),
  ]),

  plainTextNode(
    "kfg-ask-nome",
    { x: 600, y: 700 },
    "Boas-vindas + pergunta o nome",
    `Olá! Seja muito bem-vindo(a) à KFG Veículos! 🚗\n\nQual é o seu nome, por favor?`,
    true
  ),
  {
    id: "kfg-ai-nome",
    type: "aiResponse",
    position: { x: 600, y: 740 },
    data: {
      label: "Captura (IA) — nome",
      useGlobalPrompt: false,
      customPrompt: AI_NOME_PROMPT,
      suppressReplyOnDone: true,
    },
  },

  // Sempre pergunta qual veículo despertou o interesse — texto varia
  // conforme o anúncio já ter revelado um modelo específico ou não, mas
  // SEMPRE um texto FIXO (nunca a IA decidindo o que perguntar). A captura
  // (`kfg-ai-interesse`) só exige marca+modelo — nunca ano/versão/km, isso
  // é assunto pro consultor humano depois — e, se a cliente não souber ou
  // quiser ver o catálogo, marca `needsHuman` e o fluxo desvia direto pra
  // um atendente (`kfg-cond-veiculo-interesse-ok` abaixo), sem passar pelo
  // menu de negociação.
  conditionNode("kfg-cond-veiculo-detectado", { x: 600, y: 800 }, "Veículo já detectado no anúncio?", "", "EQUALS", "veiculo_anuncio"),
  plainTextNode(
    "kfg-ask-veiculo-generico",
    { x: 450, y: 860 },
    "Pergunta veículo — genérico",
    `Prazer, {{lead_nome}}! Qual veículo despertou seu interesse? Pode me dizer a marca e/ou o modelo. 🚗`,
    true
  ),
  plainTextNode(
    "kfg-ask-veiculo-especifico",
    { x: 750, y: 860 },
    "Pergunta veículo — do anúncio",
    `Prazer, {{lead_nome}}! Vi que você tem interesse no {{veiculo_anuncio}}. Você gostaria de olhar só esse modelo, ou também tem interesse em outros? Se sim, me diga qual! 😊`,
    true
  ),
  {
    id: "kfg-ai-interesse",
    type: "aiResponse",
    position: { x: 600, y: 920 },
    data: {
      label: "Captura (IA) — veículo de interesse",
      useGlobalPrompt: false,
      customPrompt: buildAiInteresseVeiculoPrompt(),
      suppressReplyOnDone: true,
    },
  },
  // Se a IA marcou "needsHuman" (não sabia, ou pediu catálogo),
  // `veiculo_interesse` fica vazio — desvia pra um handoff dedicado em vez
  // de seguir pro menu de negociação sem saber o que ela quer.
  conditionNode("kfg-cond-veiculo-interesse-ok", { x: 600, y: 950 }, "Veículo de interesse foi definido?", "", "EQUALS", "veiculo_interesse"),
  plainTextNode("kfg-handoff-sem-veiculo", { x: 450, y: 990 }, "Encaminhar — sem veículo definido", HANDOFF_SEM_VEICULO_MESSAGE, false, true),

  plainTextNode("kfg-menu-negociacao", { x: 600, y: 980 }, "Menu de negociação", MENU_NEGOCIACAO_MESSAGE, true),

  // Cadeia de condições do menu — nome OU número, mesmo princípio já
  // comprovado no Salão de Beleza (nunca "por eliminação").
  ...orConditionChain("kfg-cond-avista-", "Escolheu à vista?", [{ value: "vista" }, { value: "1", operator: "EQUALS" }], "kfg-set-avista", "kfg-cond-troca-1", 1060).nodes,
  ...orConditionChain("kfg-cond-troca-", "Escolheu troca?", [{ value: "troca" }, { value: "2", operator: "EQUALS" }], "kfg-set-troca", "kfg-cond-financiamento-1", 1060).nodes,
  ...orConditionChain(
    "kfg-cond-financiamento-",
    "Escolheu financiamento?",
    [{ value: "financiamento" }, { value: "3", operator: "EQUALS" }],
    "kfg-set-financiamento",
    "kfg-cond-outros-1",
    1060
  ).nodes,
  ...orConditionChain("kfg-cond-outros-", "Escolheu outros assuntos?", [{ value: "outro" }, { value: "4", operator: "EQUALS" }], "kfg-menu-outros", "kfg-menu-negociacao-retry", 1060).nodes,

  plainTextNode("kfg-menu-negociacao-retry", { x: 200, y: 1300 }, "Menu de negociação (não entendi)", MENU_NEGOCIACAO_RETRY_MESSAGE, true),

  // ===== CAMINHO 1: COMPRA À VISTA — nada mais a perguntar, encaminha direto. =====
  plainTextNode("kfg-set-avista", { x: 900, y: 1140 }, "Define serviço — à vista", `(silencioso)`, false, false, {
    setVariables: {
      servico_procurado: "Compra à vista",
      cpf: "Não se aplica",
      data_nascimento: "Não se aplica",
      cnh_ativa: "Não se aplica",
      possui_restricao_bancaria: "Não se aplica",
      resumo_ia: "Cliente confirmou interesse em compra à vista.",
    },
    skipSend: true,
  }),

  // ===== CAMINHO 2: TROCA — pergunta o veículo da troca, encaminha. =====
  plainTextNode("kfg-set-troca", { x: 1100, y: 1140 }, "Define serviço — troca", `(silencioso)`, false, false, {
    setVariables: {
      servico_procurado: "Troca",
      cpf: "Não se aplica",
      data_nascimento: "Não se aplica",
      cnh_ativa: "Não se aplica",
      possui_restricao_bancaria: "Não se aplica",
    },
    skipSend: true,
  }),
  plainTextNode(
    "kfg-ask-troca",
    { x: 1100, y: 1180 },
    "Pergunta veículo da troca",
    `Show! Pra isso, preciso saber sobre o veículo que você quer dar na troca: qual o modelo, ano, quilometragem e versão? 🚗`,
    true
  ),
  {
    id: "kfg-ai-troca",
    type: "aiResponse",
    position: { x: 1100, y: 1220 },
    data: {
      label: "Captura (IA) — veículo da troca",
      useGlobalPrompt: false,
      customPrompt: AI_TROCA_PROMPT,
      suppressReplyOnDone: true,
    },
  },

  // ===== CAMINHO 3: FINANCIAMENTO — restrição bancária, depois CNH/CPF/nascimento. =====
  plainTextNode("kfg-set-financiamento", { x: 1300, y: 1140 }, "Define serviço — financiamento", `(silencioso)`, false, false, {
    setVariables: { servico_procurado: "Financiamento" },
    skipSend: true,
  }),
  plainTextNode("kfg-ask-restricao", { x: 1300, y: 1180 }, "Pergunta restrição bancária", RESTRICAO_BANCARIA_MESSAGE, true),
  {
    id: "kfg-ai-restricao",
    type: "aiResponse",
    position: { x: 1300, y: 1220 },
    data: {
      label: "Captura (IA) — restrição bancária",
      useGlobalPrompt: false,
      customPrompt: AI_RESTRICAO_BANCARIA_PROMPT,
      resolveAffirmative: { affirmativeDigit: "1", negativeDigit: "2" },
    },
  },
  conditionNode("kfg-cond-restricao", { x: 1300, y: 1260 }, "Possui restrição bancária?", "sim", "EQUALS", "possui_restricao_bancaria"),

  // 3a) Possui restrição — mensagem fixa tranquilizando, encaminha direto.
  plainTextNode("kfg-restricao-sim", { x: 1180, y: 1320 }, "Restrição SIM — mensagem fixa", RESTRICAO_SIM_MESSAGE, false, false, {
    setVariables: {
      cpf: "Não se aplica",
      data_nascimento: "Não se aplica",
      cnh_ativa: "Não se aplica",
      resumo_ia: "Cliente interessada em financiamento, possui restrição bancária — encaminhado para consultor avaliar opções.",
    },
  }),

  // 3b) Sem restrição — pede CNH/CPF/nascimento, depois mensagem fixa de fechamento.
  plainTextNode("kfg-restricao-nao", { x: 1420, y: 1320 }, "Restrição NÃO — mensagem fixa + pedido de dados", RESTRICAO_NAO_MESSAGE, true),
  {
    id: "kfg-ai-dados-financiamento",
    type: "aiResponse",
    position: { x: 1420, y: 1360 },
    data: {
      label: "Captura (IA) — CNH, CPF, nascimento",
      useGlobalPrompt: false,
      customPrompt: AI_DADOS_FINANCIAMENTO_PROMPT,
      suppressReplyOnDone: true,
    },
  },
  plainTextNode("kfg-financiamento-fechamento", { x: 1420, y: 1400 }, "Financiamento — fechamento", FINANCIAMENTO_FECHAMENTO_MESSAGE, false, true),

  // ===== CAMINHO 4: OUTROS ASSUNTOS — currículo / parcerias / pós-venda. =====
  plainTextNode("kfg-menu-outros", { x: 1600, y: 1140 }, "Menu — outros assuntos", MENU_OUTROS_MESSAGE, true),
  ...orConditionChain("kfg-cond-curriculo-", "Escolheu currículo?", [{ value: "currículo" }, { value: "curriculo" }, { value: "1", operator: "EQUALS" }], "kfg-curriculo-pedir", "kfg-cond-parcerias-1", 1180).nodes,
  ...orConditionChain("kfg-cond-parcerias-", "Escolheu parcerias?", [{ value: "parceria" }, { value: "2", operator: "EQUALS" }], "kfg-parcerias-pedir", "kfg-cond-posvenda-1", 1180).nodes,
  ...orConditionChain("kfg-cond-posvenda-", "Escolheu pós-venda?", [{ value: "pós-venda" }, { value: "pos-venda" }, { value: "pos venda" }, { value: "3", operator: "EQUALS" }], "kfg-handoff-posvenda", "kfg-menu-outros-retry", 1180).nodes,
  plainTextNode("kfg-menu-outros-retry", { x: 1600, y: 1400 }, "Menu outros (não entendi)", MENU_OUTROS_RETRY_MESSAGE, true),

  // 4a) Currículo — pede, agradece ao receber, ENCERRA (sem encaminhar pra ninguém).
  plainTextNode("kfg-curriculo-pedir", { x: 1500, y: 1220 }, "Currículo — pedido", CURRICULO_PEDIR_MESSAGE, true),
  plainTextNode("kfg-curriculo-agradecimento", { x: 1500, y: 1260 }, "Currículo — agradecimento (fim)", CURRICULO_AGRADECIMENTO_MESSAGE, false, true),

  // 4b) Parcerias — pede resumo, agradece, ENCERRA (sem encaminhar pra ninguém).
  plainTextNode("kfg-parcerias-pedir", { x: 1650, y: 1220 }, "Parcerias — pedido", PARCERIAS_PEDIR_MESSAGE, true),
  plainTextNode("kfg-parcerias-agradecimento", { x: 1650, y: 1260 }, "Parcerias — agradecimento (fim)", PARCERIAS_AGRADECIMENTO_MESSAGE, false, true),

  // 4c) Pós-venda — encaminha direto pro WhatsApp do pós-venda (número
  // ainda não informado, ver `kfg-alerta-posvenda`).
  plainTextNode("kfg-handoff-posvenda", { x: 1800, y: 1220 }, "Pós-venda — encaminhamento", HANDOFF_POS_VENDA_MESSAGE, false, true),
  {
    id: "kfg-alerta-posvenda",
    type: "alertNotification",
    position: { x: 1800, y: 1260 },
    data: {
      label: "Notificação: pós-venda (número pendente)",
      recipientPhones: [""],
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },

  // ===== FECHAMENTO COMPARTILHADO (caminhos 1, 2 e ambos os sub-casos de 3) =====
  plainTextNode("kfg-handoff-comercial", { x: 1100, y: 1460 }, "Encaminhar para atendimento comercial", HANDOFF_COMERCIAL_MESSAGE, false, true),
  {
    id: "kfg-lead-alert",
    type: "alertNotification",
    position: { x: 1100, y: 1500 },
    data: {
      label: "Notificação: novo lead qualificado",
      recipientPhones: [""],
      message: LEAD_NOTIFICATION_MESSAGE,
    },
  },
];

const EDGES: Edge[] = [
  edge("kfg-e-trigger-cond0", "kfg-trigger", "kfg-cond-veiculo-0"),

  // Cadeia de detecção de veículo — se nenhum bater, segue direto pra
  // boas-vindas sem gravar `veiculo_anuncio` (fica vazio, tratado depois).
  ...VEHICLE_CATALOG.flatMap((_, index) => {
    const condId = `kfg-cond-veiculo-${index}`;
    const setId = `kfg-set-veiculo-${index}`;
    const nextCondId = index + 1 < VEHICLE_CATALOG.length ? `kfg-cond-veiculo-${index + 1}` : "kfg-ask-nome";
    return [edge(`kfg-e-${condId}-yes`, condId, setId, "yes"), edge(`kfg-e-${condId}-no`, condId, nextCondId, "no"), edge(`kfg-e-${setId}-next`, setId, "kfg-ask-nome")];
  }),

  edge("kfg-e-ask-nome-ai", "kfg-ask-nome", "kfg-ai-nome"),
  edge("kfg-e-ai-nome-cond", "kfg-ai-nome", "kfg-cond-veiculo-detectado"),
  edge("kfg-e-cond-veiculo-yes", "kfg-cond-veiculo-detectado", "kfg-ask-veiculo-generico", "yes"),
  edge("kfg-e-cond-veiculo-no", "kfg-cond-veiculo-detectado", "kfg-ask-veiculo-especifico", "no"),
  edge("kfg-e-ask-veiculo-generico-ai", "kfg-ask-veiculo-generico", "kfg-ai-interesse"),
  edge("kfg-e-ask-veiculo-especifico-ai", "kfg-ask-veiculo-especifico", "kfg-ai-interesse"),
  edge("kfg-e-ai-interesse-cond", "kfg-ai-interesse", "kfg-cond-veiculo-interesse-ok"),
  edge("kfg-e-cond-interesse-ok-yes", "kfg-cond-veiculo-interesse-ok", "kfg-handoff-sem-veiculo", "yes"),
  edge("kfg-e-cond-interesse-ok-no", "kfg-cond-veiculo-interesse-ok", "kfg-menu-negociacao", "no"),
  edge("kfg-e-handoff-sem-veiculo-alert", "kfg-handoff-sem-veiculo", "kfg-lead-alert"),

  edge("kfg-e-menu-cond-avista", "kfg-menu-negociacao", "kfg-cond-avista-1"),
  edge("kfg-e-menuretry-cond-avista", "kfg-menu-negociacao-retry", "kfg-cond-avista-1"),
  ...orConditionChain("kfg-cond-avista-", "Escolheu à vista?", [{ value: "vista" }, { value: "1", operator: "EQUALS" }], "kfg-set-avista", "kfg-cond-troca-1", 1060).edges,
  ...orConditionChain("kfg-cond-troca-", "Escolheu troca?", [{ value: "troca" }, { value: "2", operator: "EQUALS" }], "kfg-set-troca", "kfg-cond-financiamento-1", 1060).edges,
  ...orConditionChain(
    "kfg-cond-financiamento-",
    "Escolheu financiamento?",
    [{ value: "financiamento" }, { value: "3", operator: "EQUALS" }],
    "kfg-set-financiamento",
    "kfg-cond-outros-1",
    1060
  ).edges,
  ...orConditionChain("kfg-cond-outros-", "Escolheu outros assuntos?", [{ value: "outro" }, { value: "4", operator: "EQUALS" }], "kfg-menu-outros", "kfg-menu-negociacao-retry", 1060).edges,

  // Caminho 1: à vista -> direto pro fechamento compartilhado.
  edge("kfg-e-set-avista-handoff", "kfg-set-avista", "kfg-handoff-comercial"),

  // Caminho 2: troca -> pergunta -> IA -> fechamento compartilhado.
  edge("kfg-e-set-troca-ask", "kfg-set-troca", "kfg-ask-troca"),
  edge("kfg-e-ask-troca-ai", "kfg-ask-troca", "kfg-ai-troca"),
  edge("kfg-e-ai-troca-handoff", "kfg-ai-troca", "kfg-handoff-comercial"),

  // Caminho 3: financiamento -> restrição -> IA -> condição -> 2 sub-casos.
  edge("kfg-e-set-financiamento-ask", "kfg-set-financiamento", "kfg-ask-restricao"),
  edge("kfg-e-ask-restricao-ai", "kfg-ask-restricao", "kfg-ai-restricao"),
  edge("kfg-e-ai-restricao-cond", "kfg-ai-restricao", "kfg-cond-restricao"),
  edge("kfg-e-cond-restricao-sim", "kfg-cond-restricao", "kfg-restricao-sim", "yes"),
  edge("kfg-e-cond-restricao-nao", "kfg-cond-restricao", "kfg-restricao-nao", "no"),
  edge("kfg-e-restricao-sim-handoff", "kfg-restricao-sim", "kfg-handoff-comercial"),
  edge("kfg-e-restricao-nao-ai", "kfg-restricao-nao", "kfg-ai-dados-financiamento"),
  edge("kfg-e-ai-dados-fechamento", "kfg-ai-dados-financiamento", "kfg-financiamento-fechamento"),
  edge("kfg-e-financiamento-fechamento-alert", "kfg-financiamento-fechamento", "kfg-lead-alert"),

  // Caminho 4: outros assuntos -> submenu -> 3 sub-casos.
  edge("kfg-e-set-outros-menu", "kfg-menu-outros", "kfg-cond-curriculo-1"),
  edge("kfg-e-menuoutrosretry-cond", "kfg-menu-outros-retry", "kfg-cond-curriculo-1"),
  ...orConditionChain(
    "kfg-cond-curriculo-",
    "Escolheu currículo?",
    [{ value: "currículo" }, { value: "curriculo" }, { value: "1", operator: "EQUALS" }],
    "kfg-curriculo-pedir",
    "kfg-cond-parcerias-1",
    1180
  ).edges,
  ...orConditionChain("kfg-cond-parcerias-", "Escolheu parcerias?", [{ value: "parceria" }, { value: "2", operator: "EQUALS" }], "kfg-parcerias-pedir", "kfg-cond-posvenda-1", 1180).edges,
  ...orConditionChain(
    "kfg-cond-posvenda-",
    "Escolheu pós-venda?",
    [{ value: "pós-venda" }, { value: "pos-venda" }, { value: "pos venda" }, { value: "3", operator: "EQUALS" }],
    "kfg-handoff-posvenda",
    "kfg-menu-outros-retry",
    1180
  ).edges,

  edge("kfg-e-curriculo-pedir-agradecimento", "kfg-curriculo-pedir", "kfg-curriculo-agradecimento"),
  edge("kfg-e-parcerias-pedir-agradecimento", "kfg-parcerias-pedir", "kfg-parcerias-agradecimento"),
  edge("kfg-e-handoff-posvenda-alert", "kfg-handoff-posvenda", "kfg-alerta-posvenda"),

  // Fechamento compartilhado -> notificação interna final.
  edge("kfg-e-handoff-comercial-alert", "kfg-handoff-comercial", "kfg-lead-alert"),
];

/**
 * Retorna uma cópia independente (deep clone) dos nodes/edges do template —
 * mesmo padrão de `createBeautySalonTemplate`.
 */
export function createKfgTemplate(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(NODES)) as Node[],
    edges: JSON.parse(JSON.stringify(EDGES)) as Edge[],
  };
}
