import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { ConditionNode } from "./types";

const operatorLabels: Record<ConditionNode["data"]["operator"], string> = {
  CONTAINS: "contém",
  EQUALS: "é igual a",
  STARTS_WITH: "começa com",
};

export function ConditionNodeComponent({ data, selected }: NodeProps<ConditionNode>) {
  const subtitle = `Se resposta ${operatorLabels[data.operator]} "${data.value || "..."}"`;

  return (
    <NodeShell icon={GitFork} title={data.label || "Condição"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.condition} selected={selected}>
      <div className="flex justify-between pt-1 text-[10px] font-medium">
        <span className="text-success">✓ Sim</span>
        <span className="text-destructive">✕ Não</span>
      </div>
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.condition}`} />
      <Handle type="source" position={Position.Bottom} id="yes" className="!left-[30%] !h-3 !w-3 !bg-success" />
      <Handle type="source" position={Position.Bottom} id="no" className="!left-[70%] !h-3 !w-3 !bg-destructive" />
    </NodeShell>
  );
}
