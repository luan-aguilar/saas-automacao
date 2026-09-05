import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { AiResponseNode } from "./types";

export function AiResponseNodeComponent({ data, selected }: NodeProps<AiResponseNode>) {
  const subtitle = data.useGlobalPrompt
    ? "Usa o System Prompt geral (Configurações)"
    : data.customPrompt
      ? `Prompt específico: "${data.customPrompt.slice(0, 60)}${data.customPrompt.length > 60 ? "..." : ""}"`
      : "Prompt específico (não definido)";

  return (
    <NodeShell icon={Sparkles} title={data.label || "Resposta IA"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.aiResponse} selected={selected}>
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.aiResponse}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.aiResponse}`} />
    </NodeShell>
  );
}
