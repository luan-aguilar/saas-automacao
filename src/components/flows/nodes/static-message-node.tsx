import { Handle, Position, type NodeProps } from "@xyflow/react";
import { List, MessageSquare } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS, NODE_SOFT_BG_CLASS, NODE_TEXT_CLASS } from "../node-colors";
import type { StaticMessageNode } from "./types";

export function StaticMessageNodeComponent({ data, selected }: NodeProps<StaticMessageNode>) {
  const isList = data.interactiveType === "list";
  const badgeClass = `${NODE_SOFT_BG_CLASS.staticMessage} ${NODE_TEXT_CLASS.staticMessage}`;

  return (
    <NodeShell
      icon={MessageSquare}
      title={data.label || "Mensagem Estática"}
      subtitle={data.message || "(mensagem não definida)"}
      colorClass={NODE_COLOR_CLASS.staticMessage}
      selected={selected}
    >
      {isList ? (
        <div className="space-y-1 pt-1">
          {data.listButtonText && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
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
              <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
                {btn}
              </span>
            ))}
          </div>
        )
      )}
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.staticMessage}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.staticMessage}`} />
    </NodeShell>
  );
}
