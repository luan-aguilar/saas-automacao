"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { NodePanel } from "./node-panel";
import { NodeConfigDrawer, MAX_STATIC_MESSAGE_BUTTONS, MAX_STATIC_MESSAGE_LIST_ITEMS } from "./node-config-drawer";
import { DeletableEdge } from "./edges/deletable-edge";
import { TriggerNodeComponent } from "./nodes/trigger-node";
import { AiResponseNodeComponent } from "./nodes/ai-response-node";
import { StaticMessageNodeComponent } from "./nodes/static-message-node";
import { ConditionNodeComponent } from "./nodes/condition-node";
import { AlertNotificationNodeComponent } from "./nodes/alert-notification-node";
import { WebhookNodeComponent } from "./nodes/webhook-node";
import { GoogleCalendarSlotsNodeComponent } from "./nodes/google-calendar-slots-node";
import { GoogleCalendarBookNodeComponent } from "./nodes/google-calendar-book-node";
import { KeywordCatalogNodeComponent } from "./nodes/keyword-catalog-node";
import { getTemplateDefinition } from "@/lib/templates/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Play, Pause, Undo2, Redo2, AlertTriangle, Sparkles, Blocks } from "lucide-react";

const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  aiResponse: AiResponseNodeComponent,
  staticMessage: StaticMessageNodeComponent,
  condition: ConditionNodeComponent,
  alertNotification: AlertNotificationNodeComponent,
  webhook: WebhookNodeComponent,
  googleCalendarSlots: GoogleCalendarSlotsNodeComponent,
  googleCalendarBook: GoogleCalendarBookNodeComponent,
  keywordCatalog: KeywordCatalogNodeComponent,
};

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

// Tecla(s) que removem nós/conexões selecionados no canvas.
const DELETE_KEY_CODES = ["Backspace", "Delete"];

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

function defaultDataFor(type: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { label: "Entrada", triggerType: "FIRST_MESSAGE" };
    case "aiResponse":
      return { label: "Resposta IA", useGlobalPrompt: true };
    case "staticMessage":
      return { label: "Mensagem Estática", message: "Olá! Como posso ajudar?", buttons: [] };
    case "condition":
      return { label: "Condição", variable: "ultima_resposta", operator: "CONTAINS", value: "" };
    case "alertNotification":
      return {
        label: "Notificação / Alerta",
        recipientPhones: [""],
        message: "Novo agendamento! Nome: {{nome}}, Data: {{data}}, Serviço: {{servico}}",
      };
    case "webhook":
      return { label: "Webhook / Automação Externa", url: "" };
    case "googleCalendarSlots":
      return {
        label: "Agenda: Buscar Horários",
        daysAhead: 3,
        slotsWanted: 3,
        slotDurationMinutes: 60,
        businessHourStart: 9,
        businessHourEnd: 18,
        minLeadHours: 2,
      };
    case "googleCalendarBook":
      return {
        label: "Agenda: Confirmar Agendamento",
        eventTitleTemplate: "Diagnóstico Comercial - {{lead_nome}}",
        eventDescriptionTemplate: "Agendado automaticamente pelo robô.",
        sheetRowTemplate: "",
      };
    case "keywordCatalog":
      return {
        label: "Catálogo de Palavras-chave",
        sourceVariable: "ultima_resposta",
        targetVariables: [""],
        entries: [],
      };
    default:
      return { label: "Bloco" };
  }
}

const initialNodes: Node[] = [
  {
    id: "start",
    type: "trigger",
    position: { x: 80, y: 80 },
    data: { label: "Primeira mensagem", triggerType: "FIRST_MESSAGE" },
  },
  {
    id: "welcome",
    type: "aiResponse",
    position: { x: 80, y: 260 },
    data: { label: "Resposta IA", useGlobalPrompt: true },
  },
];

const initialEdges: Edge[] = [{ id: "e-start-welcome", source: "start", target: "welcome" }];

type AvailableTemplate = { key: string; name: string; description: string };

interface FlowBuilderProps {
  flowId: string;
  flowName: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  isActive: boolean;
  /** Templates que este usuário tem permissão de carregar (ver `/templates`, MASTER-only). Vazio = nenhum. */
  availableTemplates: AvailableTemplate[];
}

type HistorySnapshot = { nodes: Node[]; edges: Edge[] };

type InteractiveLimitViolation = { node: Node; reason: "buttons" | "list" };

function findInteractiveLimitViolation(nodes: Node[]): InteractiveLimitViolation | null {
  for (const n of nodes) {
    if (n.type !== "staticMessage") continue;
    const data = n.data as { interactiveType?: string; buttons?: string[]; listItems?: unknown[] };

    if (data.interactiveType === "list") {
      if (Array.isArray(data.listItems) && data.listItems.length > MAX_STATIC_MESSAGE_LIST_ITEMS) {
        return { node: n, reason: "list" };
      }
    } else if (Array.isArray(data.buttons) && data.buttons.length > MAX_STATIC_MESSAGE_BUTTONS) {
      return { node: n, reason: "buttons" };
    }
  }
  return null;
}

function FlowBuilderInner({
  flowId,
  flowName,
  initialNodes: initNodes,
  initialEdges: initEdges,
  isActive,
  availableTemplates,
}: FlowBuilderProps) {
  const startNodes = initNodes?.length ? initNodes : initialNodes;
  const startEdges = initEdges?.length ? initEdges : initialEdges;

  const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(flowName);
  const [active, setActive] = useState(isActive);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(availableTemplates[0]?.key ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Só usado no mobile — no desktop o painel de blocos fica sempre visível.
  const [paletteOpen, setPaletteOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // --- Histórico (undo/redo) -------------------------------------------
  // Snapshot "atual" mantido em ref para leitura síncrona por undo/redo,
  // sem precisar recriar os callbacks a cada mudança de nodes/edges.
  const stateRef = useRef<HistorySnapshot>({ nodes, edges });
  stateRef.current = { nodes, edges };

  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({
    past: [],
    future: [],
  });
  const lastSnapshotRef = useRef<HistorySnapshot>({ nodes: startNodes, edges: startEdges });
  const skipHistoryRef = useRef(false);
  const didMountRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dummy state só para forçar re-render dos botões undo/redo quando o histórico muda
  // (historyRef é uma ref e mutações nela não disparam re-render sozinhas).
  const [, setHistoryTick] = useState(0);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      lastSnapshotRef.current = { nodes, edges };
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      historyRef.current.past.push(lastSnapshotRef.current);
      if (historyRef.current.past.length > 50) historyRef.current.past.shift();
      historyRef.current.future = [];
      lastSnapshotRef.current = { nodes: stateRef.current.nodes, edges: stateRef.current.edges };
      setHistoryTick((t) => t + 1);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (!historyRef.current.past.length) return;
    const previous = historyRef.current.past.pop()!;
    historyRef.current.future.push(stateRef.current);
    skipHistoryRef.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setHistoryTick((t) => t + 1);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (!historyRef.current.future.length) return;
    const next = historyRef.current.future.pop()!;
    historyRef.current.past.push(stateRef.current);
    skipHistoryRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryTick((t) => t + 1);
  }, [setNodes, setEdges]);

  // Atalhos de teclado: Ctrl/Cmd+Z para desfazer, Ctrl/Cmd+Shift+Z (ou Ctrl+Y) para refazer.
  // Ignorado quando o foco está em um campo de texto (para não atrapalhar o undo nativo do input).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isEditable) return;

      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // --- Conexões e drag-and-drop ------------------------------------------
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, type: "deletable", animated: true }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: defaultDataFor(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Fallback pra quem toca no bloco em vez de arrastar (essencial no
  // celular, onde o drag-and-drop nativo do painel não funciona) — adiciona
  // o node no centro da área visível do canvas.
  const addNode = useCallback(
    (type: string) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: 300, y: 300 };
      const position = screenToFlowPosition(center);

      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: defaultDataFor(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
  }

  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  }

  function handleLoadTemplate() {
    const template = getTemplateDefinition(selectedTemplateKey);
    if (!template) return;

    const proceed = window.confirm(
      `Carregar o template "${template.name}"?\n\nIsso substitui todos os blocos e conexões atuais deste fluxo no canvas (a substituição só é salva de fato quando você clicar em "Salvar fluxo").`
    );
    if (!proceed) return;

    const { nodes: templateNodes, edges: templateEdges } = template.load();
    setSelectedNodeId(null);
    setSaveError(null);
    setNodes(templateNodes);
    setEdges(templateEdges);
    // Reseta o histórico de undo/redo para o novo ponto de partida do template.
    historyRef.current = { past: [], future: [] };
    lastSnapshotRef.current = { nodes: templateNodes, edges: templateEdges };
    skipHistoryRef.current = true;
    setHistoryTick((t) => t + 1);
  }

  async function handleSave() {
    const violation = findInteractiveLimitViolation(nodes);
    if (violation) {
      const label = (violation.node.data as { label?: string }).label || "Mensagem Estática";
      setSaveError(
        violation.reason === "list"
          ? `O bloco "${label}" tem mais de ${MAX_STATIC_MESSAGE_LIST_ITEMS} itens na lista. Reduza para no máximo ${MAX_STATIC_MESSAGE_LIST_ITEMS} antes de salvar (limite da API do WhatsApp).`
          : `O bloco "${label}" tem mais de ${MAX_STATIC_MESSAGE_BUTTONS} botões. Reduza para no máximo ${MAX_STATIC_MESSAGE_BUTTONS} antes de salvar (limite da API do WhatsApp).`
      );
      return;
    }

    setSaveError(null);
    setSaving(true);
    const res = await fetch(`/api/flows/${flowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isActive: active, nodes, edges }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(new Date());
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error ?? "Erro ao salvar o fluxo.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-border bg-card px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setPaletteOpen(true)}>
              <Blocks className="h-3.5 w-3.5" />
              Blocos
            </Button>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-[9rem] font-medium sm:max-w-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              title="Desfazer (Ctrl+Z)"
              onClick={undo}
              disabled={historyRef.current.past.length === 0}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Refazer (Ctrl+Shift+Z)"
              onClick={redo}
              disabled={historyRef.current.future.length === 0}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedAt && (
              <span className="text-xs text-muted-foreground">
                Salvo às {savedAt.toLocaleTimeString("pt-BR")}
              </span>
            )}
            {availableTemplates.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedTemplateKey}
                  onChange={(e) => setSelectedTemplateKey(e.target.value)}
                  title="Escolha um template para carregar"
                  className="flex h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {availableTemplates.map((t) => (
                    <option key={t.key} value={t.key} title={t.description}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={handleLoadTemplate}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Carregar Template
                </Button>
              </div>
            )}
            <Button variant={active ? "default" : "outline"} size="sm" onClick={() => setActive((v) => !v)}>
              {active ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {active ? "Ativo" : "Inativo"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Salvando..." : "Salvar fluxo"}
            </Button>
          </div>
        </div>
        {saveError && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {saveError}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <NodePanel onAddNode={addNode} open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        <div className="min-w-0 flex-1" ref={wrapperRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "deletable" }}
            deleteKeyCode={DELETE_KEY_CODES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--border))" />
            <Controls className="[&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button]:hover:!bg-accent" />
            <MiniMap
              pannable
              zoomable
              className="!bg-card"
              style={{ backgroundColor: "hsl(var(--card))" }}
              maskColor="hsl(var(--background) / 0.75)"
              nodeColor="hsl(var(--muted))"
              nodeStrokeColor="hsl(var(--gold))"
              nodeStrokeWidth={2}
              nodeBorderRadius={4}
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigDrawer
            key={selectedNode.id}
            node={selectedNode}
            onChange={updateNodeData}
            onDelete={deleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

export function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
