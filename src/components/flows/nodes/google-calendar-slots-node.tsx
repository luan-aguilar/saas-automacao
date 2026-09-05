import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CalendarSearch } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NODE_COLOR_CLASS, NODE_HANDLE_BG_CLASS } from "../node-colors";
import type { GoogleCalendarSlotsNode } from "./types";

export function GoogleCalendarSlotsNodeComponent({ data, selected }: NodeProps<GoogleCalendarSlotsNode>) {
  const subtitle = `Próximos ${data.daysAhead ?? 3} dias úteis — ${data.slotsWanted ?? 3} horários de ${data.slotDurationMinutes ?? 60}min`;

  return (
    <NodeShell icon={CalendarSearch} title={data.label || "Agenda: Buscar Horários"} subtitle={subtitle} colorClass={NODE_COLOR_CLASS.googleCalendarSlots} selected={selected}>
      <Handle type="target" position={Position.Top} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.googleCalendarSlots}`} />
      <Handle type="source" position={Position.Bottom} className={`!h-3 !w-3 ${NODE_HANDLE_BG_CLASS.googleCalendarSlots}`} />
    </NodeShell>
  );
}
