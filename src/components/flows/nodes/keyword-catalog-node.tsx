import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Tags } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { KeywordCatalogNode } from "./types";

export function KeywordCatalogNodeComponent({ data, selected }: NodeProps<KeywordCatalogNode>) {
  const count = data.entries?.length ?? 0;
  const subtitle = count > 0 ? `${count} item${count === 1 ? "" : "s"} no catálogo` : "Nenhum item cadastrado";

  return (
    <NodeShell icon={Tags} title={data.label || "Catálogo de Palavras-chave"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.keywordCatalog} selected={selected}>
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.keywordCatalog}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.keywordCatalog}`} />
    </NodeShell>
  );
}
