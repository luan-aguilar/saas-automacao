import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BellRing } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS, NODE_SOFT_BG_CLASS, NODE_TEXT_CLASS } from "../node-colors";
import { getAlertRecipients, type AlertNotificationNode } from "./types";

export function AlertNotificationNodeComponent({ data, selected }: NodeProps<AlertNotificationNode>) {
  const recipients = getAlertRecipients(data);
  const subtitle =
    recipients.length === 0
      ? "Nenhum destinatário definido"
      : recipients.length === 1
        ? `Alerta para ${recipients[0]}`
        : `Alerta para ${recipients.length} destinatários`;

  return (
    <NodeShell
      icon={BellRing}
      title={data.label || "Notificação / Alerta"}
      subtitle={subtitle}
      colorClass={NODE_COLOR_CLASS.alertNotification}
      selected={selected}
    >
      {data.message && (
        <p className={`line-clamp-2 rounded px-1.5 py-1 text-[10px] ${NODE_SOFT_BG_CLASS.alertNotification} ${NODE_TEXT_CLASS.alertNotification}`}>
          {data.message}
        </p>
      )}
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.alertNotification}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.alertNotification}`} />
    </NodeShell>
  );
}
