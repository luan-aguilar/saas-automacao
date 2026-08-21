import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CalendarCheck2 } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { GoogleCalendarBookNode } from "./types";

export function GoogleCalendarBookNodeComponent({ data, selected }: NodeProps<GoogleCalendarBookNode>) {
  const subtitle = data.eventTitleTemplate || "Título do evento não definido";

  return (
    <NodeShell icon={CalendarCheck2} title={data.label || "Agenda: Confirmar Agendamento"} subtitle={subtitle} colorClass="bg-blue-700" selected={selected}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-blue-700" />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-blue-700" />
    </NodeShell>
  );
}
