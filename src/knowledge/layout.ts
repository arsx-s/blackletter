import type { KnowledgeGraphData, KnowledgeNode, KnowledgeEdge } from "../types/knowledge";

export interface Position {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: Map<string, Position>;
  width: number;
  height: number;
}

const GRID_STEP = 92;
const SIM_ITERATIONS = 120;
const SIM_MAX_NODES = 320;

export function layoutKnowledge(
  graph: KnowledgeGraphData,
  options?: {
    anchorId?: string;
    highlightIds?: Set<string>;
    timeline?: boolean;
  },
): LayoutResult {
  const positions = new Map<string, Position>();
  const nodes = graph.nodes;
  const edges = graph.edges;

  if (nodes.length === 0) return { positions, width: 600, height: 400 };

  if (options?.timeline) {
    return timelineLayout(nodes, edges);
  }

  const focus = options?.anchorId ? new Set(neighborIds(edges, options.anchorId, 2)).add(options.anchorId) : null;
  const layoutNodes = focus && focus.size <= SIM_MAX_NODES
    ? nodes.filter((n) => focus.has(n.id))
    : nodes.length <= SIM_MAX_NODES
      ? nodes
      : topByDegree(nodes, edges, SIM_MAX_NODES);

  const ids = new Set(layoutNodes.map((n) => n.id));
  const layoutEdges = edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId));

  if (layoutNodes.length <= 1) {
    positions.set(layoutNodes[0].id, { x: 0, y: 0 });
    return { positions, width: 600, height: 400 };
  }

  const index = new Map(layoutNodes.map((n, i) => [n.id, i]));
  const count = layoutNodes.length;
  const cols = Math.ceil(Math.sqrt(count * 2.2));
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);

  // seed grid
  for (let i = 0; i < count; i++) {
    xs[i] = (i % cols) * GRID_STEP + (Math.random() - 0.5) * 10;
    ys[i] = Math.floor(i / cols) * GRID_STEP + (Math.random() - 0.5) * 10;
  }

  const edgePairs = layoutEdges
    .map((e) => [index.get(e.sourceId), index.get(e.targetId)] as const)
    .filter((p) => p[0] !== undefined && p[1] !== undefined);

  const repulsion = count > 120 ? 520 : 900;
  const attraction = count > 120 ? 0.018 : 0.03;

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const cooling = 1 - iter / SIM_ITERATIONS;
    vx.fill(0);
    vy.fill(0);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = xs[i] - xs[j];
        const dy = ys[i] - ys[j];
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) d = 1;
        const f = repulsion / (d * d);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        vx[i] += fx; vy[i] += fy;
        vx[j] -= fx; vy[j] -= fy;
      }
    }
  for (const pair of edgePairs) {
    const a = pair[0]!;
    const b = pair[1]!;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) d = 1;
    const f = attraction * d;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    vx[a] += fx; vy[a] += fy;
    vx[b] -= fx; vy[b] -= fy;
  }
    const damp = 0.55 * cooling;
    for (let i = 0; i < count; i++) {
      xs[i] += vx[i] * damp;
      ys[i] += vy[i] * damp;
    }
  }

  // center of mass to origin
  let cx = 0, cy = 0;
  for (let i = 0; i < count; i++) { cx += xs[i]; cy += ys[i]; }
  cx /= count; cy /= count;

  for (let i = 0; i < count; i++) {
    positions.set(layoutNodes[i].id, { x: xs[i] - cx, y: ys[i] - cy });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });

  return { positions, width: Math.max(600, maxX - minX + GRID_STEP * 2), height: Math.max(400, maxY - minY + GRID_STEP * 2) };
}

function timelineLayout(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): LayoutResult {
  const positions = new Map<string, Position>();
  const min = nodes.reduce((a, n) => Math.min(a, n.createdAt), Infinity);
  const max = nodes.reduce((a, n) => Math.max(a, n.createdAt), -Infinity);
  const span = Math.max(1, max - min);
  const clusters = new Map<string, number>();
  for (const e of edges) {
    const k = [e.sourceId, e.targetId].sort().join("|");
    clusters.set(k, (clusters.get(k) ?? 0) + 1);
  }
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  const sorted = [...nodes].sort((a, b) => a.createdAt - b.createdAt);
  sorted.forEach((n, i) => {
    const t = span > 1 ? (n.createdAt - min) / span : 0.5;
    const x = t * 1400 - 700;
    const d = degree.get(n.id) ?? 0;
    const y = (Math.sin(i * 2.4) * 0.5 + (d % 5) * 0.22) * 220;
    positions.set(n.id, { x, y });
  });
  return { positions, width: 1600, height: 600 };
}

function neighborIds(edges: KnowledgeEdge[], id: string, depth: number): Set<string> {
  const out = new Set<string>();
  let frontier = new Set<string>([id]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.sourceId) && !out.has(e.targetId)) { out.add(e.targetId); next.add(e.targetId); }
      if (frontier.has(e.targetId) && !out.has(e.sourceId)) { out.add(e.sourceId); next.add(e.sourceId); }
    }
    frontier = next;
  }
  return out;
}

function topByDegree(nodes: KnowledgeNode[], edges: KnowledgeEdge[], limit: number): KnowledgeNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  return [...nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, limit);
}