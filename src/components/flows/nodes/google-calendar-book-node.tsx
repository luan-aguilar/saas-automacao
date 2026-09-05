import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CalendarCheck2 } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { GoogleCalendarBookNode } from "./types";

export function GoogleCalendarBookNodeComponent({ data, selected }: NodeProps<GoogleCalendarBookNode>) {
  const subtitle = data.eventTitleTemplate || "Título do evento não definido";

  return (
    <NodeShell icon={CalendarCheck2} title={data.label || "Agenda: Confirmar Agendamento"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.googleCalendarBook} selected={selected}>
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.googleCalendarBook}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.googleCalendarBook}`} />
    </NodeShell>
  );
}
