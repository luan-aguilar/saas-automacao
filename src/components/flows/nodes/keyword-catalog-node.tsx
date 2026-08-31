import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Tags } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { KeywordCatalogNode } from "./types";

export function KeywordCatalogNodeComponent({ data, selected }: NodeProps<KeywordCatalogNode>) {
  const count = data.entries?.length ?? 0;
  const subtitle = count > 0 ? `${count} item${count === 1 ? "" : "s"} no catálogo` : "Nenhum item cadastrado";

  return (
    <NodeShell icon={Tags} title={data.label || "Catálogo de Palavras-chave"} subtitle={subtitle} colorClass="bg-fuchsia-600" selected={selected}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-fuchsia-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-fuchsia-600" />
    </NodeShell>
  );
}
