import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow, Background, useReactFlow, ReactFlowProvider,
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

function KnowledgeNodeVis({ data, selected }: NodeProps<NodeData>) {
  const { node } = data;
  const size = Math.round(6 + node.strength * 7);
  const dim = node.strength < 0.25;
const typeRing: Record<string, string> = {
    person: "#E8A66B", organization: "#9BB8D3", case: "#D3A9C9", law: "#B7C68A",
  };
  const ringColor = node.color || typeRing[node.type] || (node.pinned ? "#E8E6E1" : "#A8A6A1");
  return (
    <div className="kg-node flex flex-col items-center select-none group" data-node-id={node.id}>
      <div className="relative">
        <div
          style={{
            width: size * 2,
            height: size * 2,
            borderColor: ringColor,
            boxShadow: selected
              ? "0 0 0 1px #E8E6E1, 0 0 18px rgba(232,230,225,0.35)"
              : node.pinned
                ? "0 0 0 1px #E8E6E1, 0 0 10px rgba(232,230,225,0.18)"
                : "0 0 0 1px rgba(168,166,161,0.25)",
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
            <Star size={8} fill={node.favorite ? "#E8E6E1" : "none"} />
          </span>
        )}
      </div>
      <span
        className={cn(
          "kg-label mt-1 font-sans text-[10px] leading-tight text-center transition-colors max-w-[110px] truncate",
          selected ? "text-bone" : dim ? "text-muted/40" : "text-muted/80",
          "group-hover:text-bone",
        )}
      >
        {node.label}
      </span>
    </div>
  );
}

const nodeTypes = { knowledge: KnowledgeNodeVis };

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
            stroke: isSel ? "rgba(232,230,225,0.4)" : "rgba(232,230,225,0.12)",
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (getNodes().length > 0) fitView({ padding: 0.18 });
    }, 40);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowNodes.length]);

  const onNodeClick = useCallback((_: unknown, node: Node<NodeData>) => {
    onSelect(node.id);
  }, [onSelect]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".kg-node")) return;
    onSelect(null);
  }, [onSelect]);

  const selectedEdgeIds = selectedId
    ? new Set(graph.edges.filter((e) => e.sourceId === selectedId || e.targetId === selectedId).map((e) => e.id))
    : new Set<string>();

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
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background color="rgba(232,230,225,0.035)" gap={36} size={0.6} />
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
