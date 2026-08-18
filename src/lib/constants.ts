/** Nome curto — usado no cabeçalho do menu lateral e em espaços compactos. */
export const APP_NAME = "Digital Analytics";
/** Complemento exibido junto ao nome em telas com mais espaço (login, título da aba). */
export const APP_TAGLINE = "Atendimento Virtual 24h por dia";

export const FLOW_NODE_LABELS: Record<string, string> = {
  TRIGGER: "Entrada (Trigger)",
  AI_RESPONSE: "Resposta IA",
  STATIC_MESSAGE: "Mensagem Estática",
  CONDITION: "Condição / Decisão",
};

export const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (rápido e econômico)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];
