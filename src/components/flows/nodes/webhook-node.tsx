import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { WebhookNode } from "./types";

export function WebhookNodeComponent({ data, selected }: NodeProps<WebhookNode>) {
  const subtitle = data.url ? data.url : "URL não definida";

  return (
    <NodeShell
      icon={Webhook}
      title={data.label || "Webhook / Automação Externa"}
      subtitle={subtitle}
      colorClass={NODE_COLOR_CLASS.webhook}
      selected={selected}
    >
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.webhook}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.webhook}`} />
    </NodeShell>
  );
}
