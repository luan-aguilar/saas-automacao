import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BellRing } from "lucide-react";
import { NodeShell } from "./node-shell";
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
      colorClass="bg-rose-600"
      selected={selected}
    >
      {data.message && (
        <p className="line-clamp-2 rounded bg-rose-600/10 px-1.5 py-1 text-[10px] text-rose-700">
          {data.message}
        </p>
      )}
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-rose-600" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-rose-600" />
    </NodeShell>
  );
}
