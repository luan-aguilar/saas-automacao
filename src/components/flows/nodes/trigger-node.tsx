import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { TriggerNode } from "./types";

export function TriggerNodeComponent({ data, selected }: NodeProps<TriggerNode>) {
  const subtitle =
    data.triggerType === "KEYWORD"
      ? `Palavra-chave: "${data.keyword || "(não definida)"}"`
      : "Dispara na primeira mensagem do contato";

  return (
    <NodeShell icon={Zap} title={data.label || "Entrada"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.trigger} selected={selected}>
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.trigger}`} />
    </NodeShell>
  );
}
