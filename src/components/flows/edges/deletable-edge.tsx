"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";

/**
 * Edge customizada que permite exclusão de duas formas:
 * 1. Selecionar a linha (clique) + tecla Delete/Backspace (via `deleteKeyCode`
 *    configurado no <ReactFlow> em flow-builder.tsx — comportamento nativo).
 * 2. Clicar na linha para selecioná-la e usar o botão "×" que aparece no meio
 *    da conexão.
 */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ ...style, strokeWidth: selected ? 2.5 : 1.5 }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              onClick={handleDelete}
              title="Remover conexão (ou selecione a linha e pressione Delete/Backspace)"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-destructive bg-card text-destructive shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
