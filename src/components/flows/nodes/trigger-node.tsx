import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { TriggerNode } from "./types";

export function TriggerNodeComponent({ data, selected }: NodeProps<TriggerNode>) {
  const subtitle =
    data.triggerType === "KEYWORD"
      ? `Palavra-chave: "${data.keyword || "(não definida)"}"`
      : "Dispara na primeira mensagem do contato";

  return (
    <NodeShell icon={Zap} title={data.label || "Entrada"} subtitle={subtitle} colorClass="bg-emerald-600" selected={selected}>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-emerald-600" />
    </NodeShell>
  );
}
