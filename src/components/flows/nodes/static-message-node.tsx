import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { StaticMessageNode } from "./types";

export function StaticMessageNodeComponent({ data, selected }: NodeProps<StaticMessageNode>) {
  return (
    <NodeShell
      icon={MessageSquare}
      title={data.label || "Mensagem Estática"}
      subtitle={data.message || "(mensagem não definida)"}
      colorClass="bg-sky-600"
      selected={selected}
    >
      {data.buttons?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {data.buttons.map((btn, i) => (
            <span key={i} className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              {btn}
            </span>
          ))}
        </div>
      )}
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-sky-600" />
    </NodeShell>
  );
}
