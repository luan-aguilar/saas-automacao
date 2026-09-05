/**
 * Cor de cada tipo de bloco no Construtor de Fluxos — usada no painel de
 * blocos disponíveis (`node-panel.tsx`), no cabeçalho/handles de cada node
 * no canvas (`nodes/*.tsx`, via `NodeShell`) e nos poucos badges internos
 * que usam a mesma cor em tom suave (ex: preview da mensagem no node de
 * Notificação). Fonte única — antes cada arquivo repetia a mesma cor
 * hardcoded em 2-3 lugares, arriscando saírem de sincronia se alguém
 * mudasse um sem o outro.
 *
 * Valores em HSL calibrados pra ficarem na mesma "família" tonal do resto
 * do app (saturação ~55-75%, luminosidade ~38-58% — o mesmo território dos
 * tokens em globals.css, ex: --primary é 217 91% 60%, --destructive é
 * 0 72% 56%) — cores só de Tailwind (`emerald-600`, `violet-600` etc.) têm
 * saturação/luminosidade cada uma na sua própria escala, o que fazia a
 * paleta de blocos destoar do resto da identidade visual escura do app.
 *
 * IMPORTANTE: as classes abaixo têm que aparecer como STRINGS LITERAIS
 * completas (nunca montadas via template/concatenação) — o Tailwind gera
 * CSS varrendo o TEXTO dos arquivos por candidatos de classe, sem executar
 * JS, então uma classe só "existe" pra ele se estiver escrita por extenso
 * em algum arquivo dentro de `content` (ver `tailwind.config.ts`).
 */
export type NodeColorType =
  | "trigger"
  | "aiResponse"
  | "staticMessage"
  | "condition"
  | "keywordCatalog"
  | "alertNotification"
  | "webhook"
  | "googleCalendarSlots"
  | "googleCalendarBook";

/** Fundo sólido — cabeçalho do node no canvas, ícone no painel de blocos, "bolinha" dos handles de conexão. */
export const NODE_COLOR_CLASS: Record<NodeColorType, string> = {
  trigger: "bg-[hsl(158_55%_40%)]",
  aiResponse: "bg-[hsl(262_60%_58%)]",
  staticMessage: "bg-[hsl(201_70%_46%)]",
  condition: "bg-[hsl(38_75%_46%)]",
  keywordCatalog: "bg-[hsl(322_60%_52%)]",
  alertNotification: "bg-[hsl(0_65%_50%)]",
  webhook: "bg-[hsl(176_55%_38%)]",
  googleCalendarSlots: "bg-[hsl(217_75%_52%)]",
  googleCalendarBook: "bg-[hsl(230_60%_48%)]",
};

/** Texto na mesma cor — usado em cima do fundo suave abaixo. */
export const NODE_TEXT_CLASS: Record<NodeColorType, string> = {
  trigger: "text-[hsl(158_55%_40%)]",
  aiResponse: "text-[hsl(262_60%_58%)]",
  staticMessage: "text-[hsl(201_70%_46%)]",
  condition: "text-[hsl(38_75%_46%)]",
  keywordCatalog: "text-[hsl(322_60%_52%)]",
  alertNotification: "text-[hsl(0_65%_50%)]",
  webhook: "text-[hsl(176_55%_38%)]",
  googleCalendarSlots: "text-[hsl(217_75%_52%)]",
  googleCalendarBook: "text-[hsl(230_60%_48%)]",
};

/** Fundo bem suave (10% de opacidade) — badges/preview internos do node, nunca o cabeçalho. */
export const NODE_SOFT_BG_CLASS: Record<NodeColorType, string> = {
  trigger: "bg-[hsl(158_55%_40%)]/10",
  aiResponse: "bg-[hsl(262_60%_58%)]/10",
  staticMessage: "bg-[hsl(201_70%_46%)]/10",
  condition: "bg-[hsl(38_75%_46%)]/10",
  keywordCatalog: "bg-[hsl(322_60%_52%)]/10",
  alertNotification: "bg-[hsl(0_65%_50%)]/10",
  webhook: "bg-[hsl(176_55%_38%)]/10",
  googleCalendarSlots: "bg-[hsl(217_75%_52%)]/10",
  googleCalendarBook: "bg-[hsl(230_60%_48%)]/10",
};

/**
 * Mesmo fundo sólido, mas com `!important` — o React Flow aplica um
 * background inline no elemento do `Handle` (a "bolinha" de conexão), então
 * só uma classe `!bg-...` consegue sobrescrever. Precisa ser uma constante
 * LITERAL separada (não dá pra montar `"!" + NODE_COLOR_CLASS[type]` em
 * outro arquivo) pelo mesmo motivo do aviso no topo deste arquivo.
 */
export const NODE_HANDLE_BG_CLASS: Record<NodeColorType, string> = {
  trigger: "!bg-[hsl(158_55%_40%)]",
  aiResponse: "!bg-[hsl(262_60%_58%)]",
  staticMessage: "!bg-[hsl(201_70%_46%)]",
  condition: "!bg-[hsl(38_75%_46%)]",
  keywordCatalog: "!bg-[hsl(322_60%_52%)]",
  alertNotification: "!bg-[hsl(0_65%_50%)]",
  webhook: "!bg-[hsl(176_55%_38%)]",
  googleCalendarSlots: "!bg-[hsl(217_75%_52%)]",
  googleCalendarBook: "!bg-[hsl(230_60%_48%)]",
};
