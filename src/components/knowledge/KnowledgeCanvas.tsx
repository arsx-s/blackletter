import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow, Background, Handle, Position, useNodesInitialized, useReactFlow, ReactFlowProvider,
} from "reactflow";
import { Star } from "lucide-react";
import { cn } from "../../lib/utils";
import type { KnowledgeEdge, KnowledgeGraphData, KnowledgeNode } from "../../types/knowledge";
import { KNOWLEDGE_EDGE_LABELS } from "../../types/knowledge";
import { layoutKnowledge } from "../../knowledge/layout";
import type { LayoutResult } from "../../knowledge/layout";
import type { Node, NodeProps, Edge } from "reactflow";

const MONOGRAM: Record<string, string> = {
  concept: "c", definition: "d", topic: "T", subtopic: "s", person: "P", organization: "O",
  case: "§", law: "L", document: "D", session: "R", citation: "C", formula: "ƒ", question: "?",
  answer: "A", skill: "S", event: "E", location: "⌖", technology: "◈", language: "λ", library: "☐",
};

interface NodeData {
  node: KnowledgeNode;
}

// React Flow can only route an edge between two measured handles. This graph renders
// node bodies as bare circles with no visible connectors, so both handles are parked at
// the circle's centre and made invisible/non-interactive. Without them React Flow drops
// every edge (and logs one "Couldn't create edge for source handle id" warning per edge).
const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  background: "transparent",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
};

const KnowledgeNodeVis = memo(function KnowledgeNodeVis({ data, selected }: NodeProps<NodeData>) {
  const { node } = data;
  const size = Math.round(6 + node.strength * 7);
  const dim = node.strength < 0.25;
const typeRing: Record<string, string> = {
    person: "#E8A66B", organization: "#9BB8D3", case: "#D3A9C9", law: "#B7C68A",
  };
  const ringColor = node.color || typeRing[node.type] || (node.pinned ? "rgb(var(--text-primary))" : "rgb(var(--border))");
  return (
    <div className="kg-node flex flex-col items-center select-none group" data-node-id={node.id}>
      <div className="relative">
        <Handle type="target" position={Position.Top} isConnectable={false} style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Bottom} isConnectable={false} style={HANDLE_STYLE} />
        <div
          style={{
            width: size * 2,
            height: size * 2,
            borderColor: ringColor,
            boxShadow: selected
              ? "0 0 0 1px rgb(var(--text-primary)), 0 0 18px rgb(var(--text-primary) / 0.25)"
              : node.pinned
                ? "0 0 0 1px rgb(var(--text-primary)), 0 0 10px rgb(var(--text-primary) / 0.14)"
                : "0 0 0 1px rgb(var(--border) / 0.6)",
          }}
          className={cn(
            "rounded-full border bg-bone/[0.06] transition-all duration-150 group-hover:bg-bone/[0.12]",
            dim && "opacity-40",
            selected && "bg-bone/[0.16]",
          )}
        />
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-medium text-bone/70 transition-colors group-hover:text-bone"
          style={{ fontSize: Math.max(7, size * 0.75) }}
        >
          {MONOGRAM[node.type] ?? "•"}
        </span>
        {(node.favorite || node.pinned) && (
          <span className="absolute -top-2 -right-2 text-bone/60">
            <Star size={8} fill={node.favorite ? "rgb(var(--text-primary))" : "none"} />
          </span>
        )}
      </div>
      <span
        title={node.label}
        className={cn(
          "kg-label mt-1 max-w-[92px] truncate px-0.5 text-center font-sans text-[10px] leading-tight transition-colors",
          selected ? "text-bone" : dim ? "text-faint" : "text-muted",
          "group-hover:text-bone",
        )}
      >
        {node.label}
      </span>
    </div>
  );
});

const nodeTypes = { knowledge: KnowledgeNodeVis };
const defaultEdgeOptions = { type: "default" };

interface KnowledgeCanvasProps {
  graph: KnowledgeGraphData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  anchorId?: string | null;
  timelineMode?: boolean;
  learningMode?: boolean;
  navAnchor?: string | null;
  layout?: LayoutResult;
}

function GraphFlow({ graph, selectedId, onSelect, anchorId, timelineMode, learningMode, navAnchor, layout }: KnowledgeCanvasProps) {
  const { fitView, setCenter, getNodes } = useReactFlow();

  const resolvedLayout = useMemo(
    () => layout ?? layoutKnowledge(graph, { anchorId: anchorId ?? undefined, timeline: timelineMode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, graph, anchorId, timelineMode],
  );

  const flowNodes: Node<NodeData>[] = useMemo(() => {
    return graph.nodes
      .filter((n) => resolvedLayout.positions.has(n.id))
      .map((node) => {
        const p = resolvedLayout.positions.get(node.id)!;
        return {
          id: node.id,
          type: "knowledge",
          position: p,
          data: { node },
          selected: selectedId === node.id,
        };
      });
  }, [graph.nodes, resolvedLayout.positions, selectedId]);

  const flowEdges: Edge[] = useMemo(() => {
    const positioned = new Set(flowNodes.map((n) => n.id));
    return graph.edges
      .filter((e) => positioned.has(e.sourceId) && positioned.has(e.targetId))
      .map((e) => {
        const isSel = selectedId !== null && (e.sourceId === selectedId || e.targetId === selectedId);
        return {
          id: e.id,
          source: e.sourceId,
          target: e.targetId,
          type: "default",
          label: isSel ? KNOWLEDGE_EDGE_LABELS[e.type] : undefined,
          style: {
            stroke: isSel ? "rgb(var(--text-primary) / 0.5)" : "rgb(var(--text-primary) / 0.16)",
            strokeWidth: isSel ? 1.4 : 1,
            ...(learningMode ? { strokeDasharray: "3 3", opacity: 0.5 } : {}),
          },
          animated: isSel,
        };
      });
  }, [graph.edges, flowNodes, selectedId, learningMode]);

  useEffect(() => {
    if (navAnchor) {
      const target = getNodes().find((n) => n.id === navAnchor);
      if (target) {
        const t = resolvedLayout.positions.get(navAnchor);
        if (t) setCenter(t.x, t.y, 0.9);
      }
    }
  }, [navAnchor, getNodes, resolvedLayout.positions]);

  // A blind timer can fire before the canvas has been measured, at which point React Flow's
  // fitView returns early (width/height are still 0) and the graph stays clipped at the origin.
  // Wait until every node has been measured, then fit — and re-fit whenever the set changes.
  const nodesInitialized = useNodesInitialized();
  const lastFittedCount = useRef(-1);
  useEffect(() => {
    if (!nodesInitialized) return;
    if (lastFittedCount.current === flowNodes.length) return;
    lastFittedCount.current = flowNodes.length;
    const timer = setTimeout(() => fitView({ padding: 0.18, maxZoom: 1.5 }), 40);
    return () => clearTimeout(timer);
  }, [nodesInitialized, flowNodes.length, fitView]);

  const onNodeClick = useCallback((_: unknown, node: Node<NodeData>) => {
    onSelect(node.id);
  }, [onSelect]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".kg-node")) return;
    onSelect(null);
  }, [onSelect]);

  const selectedEdgeIds = useMemo(
    () => (selectedId
      ? new Set(graph.edges.filter((e) => e.sourceId === selectedId || e.targetId === selectedId).map((e) => e.id))
      : new Set<string>()),
    [graph.edges, selectedId],
  );

  return (
    <div className="absolute inset-0" onMouseDown={handleBackdrop}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={noop}
        onEdgesChange={noop}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView={false}
        minZoom={0.08}
        maxZoom={3.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnDoubleClick={false}
        className="bg-transparent"
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background color="rgb(var(--text-primary) / 0.05)" gap={36} size={0.6} />
      </ReactFlow>
      {selectedId && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-background/90 backdrop-blur px-3 py-1.5 rounded-sm border border-border font-mono text-2xs text-muted shadow-glow">
          {graph.nodes.find((n) => n.id === selectedId)?.label ?? "Node"} · {selectedEdgeIds.size} connections
        </div>
      )}
    </div>
  );
}

function noop(): void {}

export function KnowledgeCanvas(props: KnowledgeCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphFlow {...props} />
    </ReactFlowProvider>
  );
}
