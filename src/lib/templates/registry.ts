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

export type TemplateDefinition = {
  key: string;
  name: string;
  description: string;
  load: () => { nodes: Node[]; edges: Edge[] };
};

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    key: "beauty-salon",
    name: BEAUTY_SALON_TEMPLATE_NAME,
    description:
      "Menu de categorias, catálogo numerado de sub-serviços e agente de coleta com IA (nome, serviço, dia/horário, fotos quando aplicável) até a notificação de lead qualificado.",
    load: createBeautySalonTemplate,
  },
];

export function getTemplateDefinition(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
