import type { Node } from "@xyflow/react";

export type TriggerData = {
  label: string;
  triggerType: "FIRST_MESSAGE" | "KEYWORD";
  keyword?: string;
};

export type AiResponseData = {
  label: string;
  useGlobalPrompt: boolean;
  customPrompt?: string;
  /**
   * Se a resposta do contato CONTIVER uma dessas palavras-chave (comparação
   * sem diferenciar maiúsculas/minúsculas) enquanto o fluxo estiver pausado
   * neste bloco aguardando resposta, o motor entrega o controle direto para
   * `exitTargetNodeId` SEM chamar a IA. Útil para ações que precisam de
   * formatação 100% consistente (ex: "Menu" reapresentando a lista de
   * categorias) — um bloco de Mensagem Estática sempre formata igual; a IA,
   * por ser probabilística, às vezes ignora instruções de formatação do
   * prompt mesmo quando pedidas explicitamente.
   */
  exitKeywords?: string[];
  /** Node para onde o fluxo vai quando uma das `exitKeywords` é detectada (ver acima). */
  exitTargetNodeId?: string;
  /**
   * Se true, o motor tenta resolver por código (ver `analyzeDateReference`
   * em `flow-helpers.ts`) qualquer dia/data que a resposta MAIS RECENTE do
   * contato citar — data explícita já passada, ou nome de dia da semana —
   * e injeta o resultado como uma dica pronta no prompt, ANTES da IA
   * responder. Deixe `false`/ausente (padrão) em qualquer node que colete
   * outra coisa que também possa parecer uma data (ex: aniversário — "10/02"
   * não deve ser tratado como "essa data já passou", é só uma data de
   * nascimento sem ano relevante). Ligue só nos nodes que de fato pedem o
   * dia/horário do AGENDAMENTO.
   */
  resolveDateReferences?: boolean;
  /**
   * Se true, o motor tenta resolver por código (ver `resolveNomeAniversarioPair`
   * em `flow-helpers.ts`) o caso em que a resposta MAIS RECENTE do contato
   * for exatamente duas linhas — nome numa, aniversário na outra — e injeta
   * o resultado como uma dica pronta no prompt. Ligue só em nodes cuja
   * ÚNICA pergunta em aberto é nome + aniversário.
   */
  resolveNomeAniversario?: boolean;
  /**
   * Configuração de dias/horário de funcionamento — usada junto com
   * `resolveDateReferences` pra validar por código (ver `checkScheduleRequest`
   * em `flow-helpers.ts`) se o dia/horário pedido está dentro do
   * funcionamento, além de já passado ou não. `openDays` usa o índice do
   * JS (`Date.getDay()`: 0=domingo ... 6=sábado).
   */
  businessHours?: { openDays: number[]; openHour: number; closeHour: number };
  /**
   * Versão "segura" de validação de horário — só extrai e valida o HORÁRIO
   * mencionado (ver `extractTime` em `flow-helpers.ts`), nunca tenta casar
   * uma data. Ao contrário de `resolveDateReferences`, pode ser ligado em
   * nodes que também coletam outros campos no formato DD/MM (ex:
   * aniversário) no mesmo node, já que um horário (ex: "às 9", "20h") nunca
   * é confundível com uma data curta desse formato. Usa `businessHours`
   * pros limites.
   */
  resolveTimeReferences?: boolean;
  /**
   * Lista de variáveis que precisam TODAS já estar confirmadas antes da
   * validação de dia/horário (`resolveDateReferences`/`businessHours`)
   * entrar em ação neste node. Existe pra nodes multi-propósito (ex: o
   * Agente de Coleta do caminho "Outros assuntos", que também coleta nome/
   * aniversário no mesmo node) — sem essa trava, um texto parecido com data
   * (ex: aniversário "10/02") poderia ser mal interpretado como pedido de
   * agendamento antes da hora certa. Ignorado se `resolveDateReferences`
   * não estiver ligado.
   */
  scheduleRequiresVariables?: string[];
  /**
   * Se true, mesmo quando a validação de dia/horário encontrar um problema,
   * o motor NÃO faz o curto-circuito (que pula a IA inteiramente) — em vez
   * disso, injeta a mesma dica no prompt e deixa a IA decidir a resposta.
   * Necessário em nodes multi-propósito onde a mensagem do contato pode
   * conter outra coisa além da data (ex: uma correção de serviço) que a IA
   * ainda precisa tratar nesse mesmo turno — um curto-circuito ignoraria
   * isso. Em nodes de propósito único (ex: o node dedicado de dia/horário),
   * deixe `false`/ausente pra ganhar a garantia de texto exato do
   * curto-circuito.
   */
  scheduleHintOnly?: boolean;
  /**
   * Textos EXATOS (nunca gerados/parafraseados pela IA) enviados quando
   * `checkScheduleRequest` rejeita o dia/horário pedido — o motor envia
   * esse texto diretamente e nem chama a OpenAI nesse turno, garantindo
   * 100% de aderência à frase pedida pelo dono do negócio. `datePassed`
   * aceita os placeholders `{{formatted}}` (data resolvida, DD/MM/AAAA) e
   * `{{dataAtual}}` (data de hoje). Se algum campo faltar, cai num texto
   * genérico equivalente.
   */
  scheduleRejectionMessages?: {
    datePassed?: string;
    holiday?: string;
    closedWeekday?: string;
    outsideHours?: string;
  };
  /**
   * Se true, o motor checa a resposta MAIS RECENTE do contato contra uma
   * lista fechada de frases curtas de confirmação afirmativa (ver
   * `isExplicitConfirmation` em `flow-helpers.ts`) e, se bater, injeta uma
   * dica reforçando que aquilo deve ser tratado como confirmação — reforço
   * pras frases mais comuns, nunca substitui o julgamento da IA pra
   * respostas mais longas ou fora da lista.
   */
  recognizeConfirmation?: boolean;
  /**
   * Se definido, junto com `recognizeConfirmation`: quando a resposta MAIS
   * RECENTE do contato bater com uma frase de confirmação conhecida (ver
   * `isExplicitConfirmation`) E todas as variáveis nesta lista já
   * estiverem confirmadas, o motor PULA a IA inteiramente neste turno — não
   * envia nenhuma mensagem própria, só avança pro próximo node. Existe pra
   * evitar uma mensagem intermediária redundante (ex: "Perfeito! 😊") logo
   * antes da mensagem final do fluxo (ex: bloco de handoff humano), que já
   * cobre o reconhecimento — soa como a mesma coisa dita duas vezes.
   */
  confirmationRequiresVariables?: string[];
  /**
   * Se true, quando este node marcar "done"/"needsHuman" (ou seja, quando
   * for avançar pro próximo node no mesmo turno), o motor NÃO envia o
   * "reply" da IA — só avança. Existe pra regra de "uma única mensagem por
   * resposta do cliente": sem isso, o reconhecimento breve da IA (ex:
   * "Perfeito! 😊") chegaria como uma mensagem separada, logo antes da
   * mensagem do PRÓXIMO node (que já cobre o que precisa ser dito) — duas
   * mensagens pra uma única resposta do cliente. Enquanto o node ainda
   * estiver coletando informação (done: false), o "reply" continua sendo
   * enviado normalmente, já que é a ÚNICA fonte daquele texto.
   */
  suppressReplyOnDone?: boolean;
};

/** Tipo de mensagem interativa: botões simples (até 3) ou lista (até 10 itens). */
export type StaticMessageInteractiveType = "buttons" | "list";

export type StaticMessageListItem = {
  /** Identificador curto do item (ex: "cabelo") — usado para reconhecer a escolha do contato. */
  id: string;
  /** Título do item, exibido na lista (ex: "Cabelo"). */
  title: string;
  /** Descrição opcional, exibida abaixo do título na lista (ex: "Mechas, Corte, Progressiva..."). */
  description?: string;
};

export type StaticMessageData = {
  label: string;
  message: string;
  /** "buttons" (padrão, retrocompatível) ou "list" (mensagem de lista do WhatsApp). */
  interactiveType?: StaticMessageInteractiveType;
  /** Usado quando interactiveType === "buttons" (até 3 opções). */
  buttons: string[];
  /** Usado quando interactiveType === "list": título do botão que abre a lista (ex: "Ver Opções de Serviços"). */
  listButtonText?: string;
  /** Usado quando interactiveType === "list": itens da lista (até 10). */
  listItems?: StaticMessageListItem[];
  /**
   * Quando true, mesmo uma mensagem em TEXTO PURO (sem botões/lista) pausa o
   * fluxo e espera a próxima resposta do contato, em vez de seguir
   * automaticamente para o próximo node. Útil quando mensagens interativas
   * (botões/lista) não são confiáveis — a Evolution API/Baileys tem bugs
   * conhecidos de renderização e até de entrega de mensagens de botão (ficam
   * presas em "SERVER_ACK" e nunca chegam ao destinatário) — permitindo
   * simular um "menu" perguntado por texto simples (ex: "responda com 1, 2
   * ou 3") sem depender desses recursos frágeis.
   */
  waitForReply?: boolean;
  /**
   * Quando true, ao enviar esta mensagem o motor também desliga a IA para
   * esta conversa (`Chat.aiEnabled = false`) — usado para o bloco de
   * "encaminhar para atendimento humano": a partir daí novas mensagens do
   * contato só ficam registradas na Central de Atendimento, sem resposta
   * automática, até um operador reativar manualmente pelo toggle.
   */
  disablesAiForChat?: boolean;
  /**
   * Quando definido, ao alcançar este node o motor também grava estas
   * variáveis com valores FIXOS (ex: `{ servico_categoria: "Cabelo" }`) —
   * útil para registrar deterministicamente informações que o fluxo já sabe
   * de antemão (por ter chegado até aqui via uma condição específica), sem
   * depender de um bloco de IA lembrar de "adivinhar" isso da conversa.
   */
  setVariables?: Record<string, string>;
  /**
   * Quando definido, ao alcançar este node o motor copia o valor atual de
   * `ultima_resposta` (a última resposta do contato, tipicamente o que
   * disparou a condição que trouxe o fluxo até aqui) para o nome de variável
   * indicado — ex: `"servico_subtipo"` registra automaticamente qual opção
   * exata o contato escolheu num ponto de desvio condicional.
   */
  captureLastReplyInto?: string;
  /**
   * Quando true, o motor NÃO envia `message` pelo WhatsApp — só executa
   * `setVariables`/`captureLastReplyInto` (se definidos) e segue direto pro
   * próximo node, na mesma resposta do contato. Útil pra um node cuja única
   * função é capturar dados deterministicamente (ex: qual sub-serviço um
   * catálogo numerado resolveu), sem anunciar isso como uma mensagem
   * separada — evita "duas mensagens pra uma única resposta do cliente"
   * quando o PRÓXIMO node já vai mandar a mensagem que realmente importa.
   * Ignora `waitForReply` (sempre segue em frente, nunca pausa aqui).
   */
  skipSend?: boolean;
};

export type ConditionData = {
  label: string;
  variable: string;
  operator: "CONTAINS" | "EQUALS" | "STARTS_WITH";
  value: string;
};

export type AlertNotificationData = {
  label: string;
  /**
   * @deprecated Substituído por `recipientPhones` (suporta vários números).
   * Mantido só para não quebrar fluxos salvos antes dessa mudança — ver
   * `getAlertRecipients`, que lê este campo como fallback quando
   * `recipientPhones` ainda não foi definido.
   */
  recipientPhone?: string;
  /** Números de WhatsApp dos destinatários (até 5 — ex: recepção, dono, sócio), com DDI/DDD */
  recipientPhones?: string[];
  /** Mensagem de alerta — aceita variáveis capturadas no fluxo, ex: {{nome}}, {{data}}, {{servico}} */
  message: string;
};

export const MAX_ALERT_RECIPIENTS = 5;

/**
 * Lista efetiva de destinatários de um bloco de Notificação/Alerta —
 * prioriza `recipientPhones` (formato atual) e cai para o antigo
 * `recipientPhone` (string única) quando o node ainda não foi editado desde
 * a migração. Descarta entradas vazias.
 */
export function getAlertRecipients(data: AlertNotificationData): string[] {
  const list = data.recipientPhones && data.recipientPhones.length > 0
    ? data.recipientPhones
    : data.recipientPhone
      ? [data.recipientPhone]
      : [];
  return list.map((p) => p.trim()).filter((p) => p.length > 0);
}

export type WebhookData = {
  label: string;
  /** URL a chamar via POST (ex: um webhook do n8n/Zapier/Make) — com DDI/DDD não se aplica aqui, é uma URL. */
  url: string;
};

export type GoogleCalendarSlotsData = {
  label: string;
  /** Quantos dias ÚTEIS (pula fim de semana) a partir de hoje entram na busca. */
  daysAhead: number;
  /** Quantas opções de horário oferecer (ex: 3). */
  slotsWanted: number;
  /** Duração de cada horário, em minutos. */
  slotDurationMinutes: number;
  /** Início/fim do expediente considerado, em hora cheia (0-23). */
  businessHourStart: number;
  businessHourEnd: number;
  /** Não oferece horários a menos de X horas do momento atual. */
  minLeadHours: number;
};

export type GoogleCalendarBookData = {
  label: string;
  /** Título do evento criado — aceita variáveis, ex: "Diagnóstico Comercial - {{lead_nome}}". */
  eventTitleTemplate: string;
  /** Descrição do evento — aceita variáveis. */
  eventDescriptionTemplate: string;
  /**
   * Uma linha da planilha (aba "Leads" da integração Google, ver
   * `GoogleIntegration`) por linha de texto aqui — cada linha vira uma
   * coluna, na ordem. Aceita variáveis. Vazio = não grava na planilha.
   */
  sheetRowTemplate?: string;
};

export type TriggerNode = Node<TriggerData, "trigger">;
export type AiResponseNode = Node<AiResponseData, "aiResponse">;
export type StaticMessageNode = Node<StaticMessageData, "staticMessage">;
export type ConditionNode = Node<ConditionData, "condition">;
export type AlertNotificationNode = Node<AlertNotificationData, "alertNotification">;
export type WebhookNode = Node<WebhookData, "webhook">;
export type GoogleCalendarSlotsNode = Node<GoogleCalendarSlotsData, "googleCalendarSlots">;
export type GoogleCalendarBookNode = Node<GoogleCalendarBookData, "googleCalendarBook">;

export type FlowNode =
  | TriggerNode
  | AiResponseNode
  | StaticMessageNode
  | ConditionNode
  | AlertNotificationNode
  | GoogleCalendarSlotsNode
  | GoogleCalendarBookNode
  | WebhookNode;

/** Extrai os nomes de variáveis {{assim}} usados em um texto (sem duplicatas). */
export function extractVariableNames(text: string): string[] {
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
  const names = matches.map((m) => m.replace(/[{}]/g, "").trim());
  return Array.from(new Set(names));
}
