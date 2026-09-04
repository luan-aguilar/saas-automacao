/**
 * Catálogo dos templates pré-definidos do Construtor de Fluxos.
 *
 * Os templates em si (nodes/edges) vivem em código, um arquivo por
 * segmento (ex: `beauty-salon-template.ts`) — não há tabela de templates no
 * banco. O que É controlado pelo banco é QUEM pode carregar qual template
 * (ver model `TemplateAccess` em `prisma/schema.prisma` e a página MASTER
 * `/templates`): o MASTER decide, por cliente, quais destes ficam
 * disponíveis no botão "Carregar Template" do Construtor de Fluxos.
 *
 * Para adicionar um novo segmento (Energia Solar, Imobiliária, etc.): criar
 * o arquivo do template (mesmo padrão de `beauty-salon-template.ts`) e
 * registrar uma entrada aqui — o resto (liberação por cliente, botão no
 * Construtor) já funciona automaticamente.
 */

import type { Node, Edge } from "@xyflow/react";
import { createBeautySalonTemplate, BEAUTY_SALON_TEMPLATE_NAME } from "./beauty-salon-template";
import { createDigitalAnalyticsTemplate, DIGITAL_ANALYTICS_TEMPLATE_NAME } from "./digital-analytics-template";
import { createKfgTemplate, KFG_TEMPLATE_NAME } from "./kfg-template";
import { createKlanTattooTemplate, KLAN_TATTOO_TEMPLATE_NAME } from "./klan-tattoo-template";

/**
 * Uma coluna do Kanban de `/pipeline`. `key` usa os mesmos 4 estágios
 * universais definidos no enum `PipelineStage` do schema (novo contato /
 * recorrente / aguardando humano / concluído — conceitos de funil de vendas
 * que fazem sentido pra qualquer segmento) — só o RÓTULO/descrição variam
 * por template, não o estágio em si (o motor de fluxo já move os contatos
 * automaticamente entre esses 4 estágios, ver `flow-engine.ts`).
 */
export type PipelineColumnDefinition = {
  key: "PRIMEIRO_ATENDIMENTO" | "CLIENTE_RECORRENTE" | "AGUARDANDO_HUMANO" | "AGENDAMENTO_CONCLUIDO";
  label: string;
  description: string;
};

export type TemplateDefinition = {
  key: string;
  name: string;
  description: string;
  load: () => { nodes: Node[]; edges: Edge[] };
  /**
   * Colunas do Kanban de `/pipeline` específicas deste template — se
   * omitido, o template não tem funil (só o fluxo de conversa). Cliente só
   * vê a aba "Funil de Atendimento" se tiver acesso a algum template com
   * isso definido (ver `getAvailableTemplates`/`/pipeline`).
   */
  pipelineColumns?: PipelineColumnDefinition[];
};

const BEAUTY_SALON_PIPELINE_COLUMNS: PipelineColumnDefinition[] = [
  { key: "PRIMEIRO_ATENDIMENTO", label: "Primeiro Atendimento", description: "IA conduzindo o atendimento inicial" },
  { key: "CLIENTE_RECORRENTE", label: "Cliente Recorrente", description: "Já é cliente, voltou pra um novo atendimento" },
  { key: "AGUARDANDO_HUMANO", label: "Aguardando Humano", description: "IA encaminhou, esperando um atendente" },
  { key: "AGENDAMENTO_CONCLUIDO", label: "Agendamento Concluído", description: "Atendimento fechado" },
];

const KLAN_TATTOO_PIPELINE_COLUMNS: PipelineColumnDefinition[] = [
  { key: "PRIMEIRO_ATENDIMENTO", label: "Primeiro Atendimento", description: "IA conduzindo o atendimento inicial" },
  { key: "CLIENTE_RECORRENTE", label: "Cliente Recorrente", description: "Já é cliente, voltou pra um novo atendimento" },
  { key: "AGUARDANDO_HUMANO", label: "Aguardando Humano", description: "IA encaminhou, esperando um artista/atendente" },
  { key: "AGENDAMENTO_CONCLUIDO", label: "Agendamento Concluído", description: "Atendimento fechado" },
];

const KFG_PIPELINE_COLUMNS: PipelineColumnDefinition[] = [
  { key: "PRIMEIRO_ATENDIMENTO", label: "Primeiro Atendimento", description: "IA qualificando o lead vindo do anúncio" },
  { key: "CLIENTE_RECORRENTE", label: "Cliente Recorrente", description: "Já conversou antes, voltou pra um novo atendimento" },
  { key: "AGUARDANDO_HUMANO", label: "Aguardando Consultor", description: "IA encaminhou, esperando um consultor" },
  { key: "AGENDAMENTO_CONCLUIDO", label: "Negociação Encaminhada", description: "Lead qualificado e encaminhado com sucesso" },
];

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    key: "beauty-salon",
    name: BEAUTY_SALON_TEMPLATE_NAME,
    description:
      "Menu de categorias, catálogo numerado de sub-serviços e agente de coleta com IA (nome, serviço, dia/horário, fotos quando aplicável) até a notificação de lead qualificado.",
    load: createBeautySalonTemplate,
    pipelineColumns: BEAUTY_SALON_PIPELINE_COLUMNS,
  },
  {
    key: "digital-analytics",
    name: DIGITAL_ANALYTICS_TEMPLATE_NAME,
    description:
      "Diagnóstico comercial gratuito: 6 perguntas de qualificação com IA (nome, segmento, quem atende, CRM, tráfego pago, desafio) e agendamento via webhook (n8n) com o Google Calendar do gestor comercial. Uso interno — nunca liberado para clientes.",
    load: createDigitalAnalyticsTemplate,
  },
  {
    key: "kfg-veiculos",
    name: KFG_TEMPLATE_NAME,
    description:
      "Leads de anúncio de tráfego pago (detecção do veículo por palavra-chave na primeira mensagem) até a qualificação completa: nome, veículo de interesse, forma de negociação (à vista, troca, financiamento) e, no financiamento, restrição bancária + CNH/CPF/nascimento — encaminhado por WhatsApp pro time comercial.",
    load: createKfgTemplate,
    pipelineColumns: KFG_PIPELINE_COLUMNS,
  },
  {
    key: "klan-tattoo",
    name: KLAN_TATTOO_TEMPLATE_NAME,
    description:
      "Nome + menu (Tatuagem / Piercing / Outros). Tatuagem: coleta referência com IA de visão real (estilo, complexidade, tamanho, região) e calcula uma estimativa de preço via webhook. Piercing: qualifica tipo/joia. Outros: coleta livre. Todos convergem numa notificação pro WhatsApp interno da Klan.",
    load: createKlanTattooTemplate,
    pipelineColumns: KLAN_TATTOO_PIPELINE_COLUMNS,
  },
];

export function getTemplateDefinition(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
