import { Handle, Position, type NodeProps } from "@xyflow/react";
import { List, MessageSquare } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { StaticMessageNode } from "./types";

export function StaticMessageNodeComponent({ data, selected }: NodeProps<StaticMessageNode>) {
  const isList = data.interactiveType === "list";

  return (
    <NodeShell
      icon={MessageSquare}
      title={data.label || "Mensagem Estática"}
      subtitle={data.message || "(mensagem não definida)"}
      colorClass="bg-sky-600"
      selected={selected}
    >
      {isList ? (
        <div className="space-y-1 pt-1">
          {data.listButtonText && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/10 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              <List className="h-2.5 w-2.5" />
              {data.listButtonText}
            </span>
          )}
          {data.listItems && data.listItems.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {data.listItems.length} {data.listItems.length === 1 ? "item" : "itens"} na lista
            </p>
          )}
        </div>
      ) : (
        data.buttons?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {data.buttons.map((btn, i) => (
              <span key={i} className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                {btn}
              </span>
            ))}
          </div>
        )
      )}
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-sky-600" />
    </NodeShell>
  );
}
