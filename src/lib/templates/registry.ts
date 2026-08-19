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

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    key: "beauty-salon",
    name: BEAUTY_SALON_TEMPLATE_NAME,
    description:
      "Menu de categorias, catálogo numerado de sub-serviços e agente de coleta com IA (nome, serviço, dia/horário, fotos quando aplicável) até a notificação de lead qualificado.",
    load: createBeautySalonTemplate,
    pipelineColumns: BEAUTY_SALON_PIPELINE_COLUMNS,
  },
];

export function getTemplateDefinition(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
