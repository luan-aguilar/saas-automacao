import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { AiResponseNode } from "./types";

export function AiResponseNodeComponent({ data, selected }: NodeProps<AiResponseNode>) {
  const subtitle = data.useGlobalPrompt
    ? "Usa o System Prompt geral (Configurações)"
    : data.customPrompt
      ? `Prompt específico: "${data.customPrompt.slice(0, 60)}${data.customPrompt.length > 60 ? "..." : ""}"`
      : "Prompt específico (não definido)";

  return (
    <NodeShell icon={Sparkles} title={data.label || "Resposta IA"} subtitle={subtitle} colorClass="bg-violet-600" selected={selected}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-violet-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-violet-600" />
    </NodeShell>
  );
}
