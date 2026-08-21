import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { WebhookNode } from "./types";

export function WebhookNodeComponent({ data, selected }: NodeProps<WebhookNode>) {
  const subtitle = data.url ? data.url : "URL não definida";

  return (
    <NodeShell
      icon={Webhook}
      title={data.label || "Webhook / Automação Externa"}
      subtitle={subtitle}
      colorClass="bg-teal-600"
      selected={selected}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-teal-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-teal-600" />
    </NodeShell>
  );
}
