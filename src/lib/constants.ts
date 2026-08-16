export const APP_NAME = "RoboZap SaaS";

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
