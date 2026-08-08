import type {
  KnowledgeEdge,
  KnowledgeEdgeType,
  KnowledgeGraphData,
  KnowledgeNode,
  KnowledgeNodeInput,
  KnowledgeStats,
} from "../types/knowledge";
import { normalizeLabel } from "./extractor";

export function emptyGraph(): KnowledgeGraphData {
  return { version: 1, nodes: [], edges: [] };
}

export function nodeKey(label: string): string {
  return normalizeLabel(label);
}

export function findNodeByLabel(graph: KnowledgeGraphData, label: string): KnowledgeNode | null {
  const key = nodeKey(label);
  for (const n of graph.nodes) {
    if (nodeKey(n.label) === key) return n;
    if (n.aliases.some((a) => nodeKey(a) === key)) return n;
  }
  return null;
}

export function findEdge(graph: KnowledgeGraphData, sourceId: string, targetId: string, type: KnowledgeEdgeType): KnowledgeEdge | null {
  return graph.edges.find((e) => e.sourceId === sourceId && e.targetId === targetId && e.type === type) ?? null;
}

export function upsertNode(graph: KnowledgeGraphData, input: KnowledgeNodeInput): KnowledgeGraphData {
  const ts = input.now ?? Date.now();
  const existing = findNodeByLabel(graph, input.label);
  if (existing) {
    const node: KnowledgeNode = {
      ...existing,
      aliases: mergeUnique(existing.aliases, input.aliases ?? []),
      description: input.description ?? existing.description,
      definition: input.definition ?? existing.definition,
      summary: input.summary ?? existing.summary,
      example: input.example ?? existing.example,
      difficulty: input.difficulty ?? existing.difficulty,
      color: input.color ?? existing.color,
      group: input.group ?? existing.group,
      occurrences: existing.occurrences + 1,
      strength: bumpStrength(existing.strength, existing.occurrences + 1),
      updatedAt: ts,
      lastSeenAt: ts,
      aiGenerated: existing.aiGenerated || (input.aiGenerated ?? true),
      manual: existing.manual || (input.manual ?? false),
      sourceTabIds: mergeUnique(existing.sourceTabIds, input.tabId ? [input.tabId] : []),
      sourceDocumentIds: mergeUnique(existing.sourceDocumentIds, input.documentId ? [input.documentId] : []),
      sourceNoteIds: mergeUnique(existing.sourceNoteIds, input.noteId ? [input.noteId] : []),
      sources: mergeUnique(existing.sources, input.sources ?? []),
    };
    return { ...graph, nodes: graph.nodes.map((n) => (n.id === existing.id ? node : n)) };
  }
  const node: KnowledgeNode = {
    id: genId(),
    type: input.type,
    label: input.label.trim(),
    aliases: input.aliases ?? [],
    description: input.description ?? "",
    definition: input.definition ?? "",
    summary: input.summary ?? "",
    example: input.example ?? "",
    difficulty: input.difficulty ?? "intermediate",
    strength: 0.25,
    occurrences: 1,
    createdAt: ts,
    updatedAt: ts,
    lastSeenAt: ts,
    pinned: false,
    favorite: false,
    color: input.color ?? "",
    group: input.group ?? "",
    aiGenerated: input.aiGenerated ?? true,
    manual: input.manual ?? false,
    sourceTabIds: input.tabId ? [input.tabId] : [],
    sourceDocumentIds: input.documentId ? [input.documentId] : [],
    sourceNoteIds: input.noteId ? [input.noteId] : [],
    sources: input.sources ?? [],
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function upsertEdge(
  graph: KnowledgeGraphData,
  sourceId: string,
  targetId: string,
  type: KnowledgeEdgeType,
  source: { tabId?: string; documentId?: string } = {},
  now?: number,
): KnowledgeGraphData {
  const ts = now ?? Date.now();
  const existing = findEdge(graph, sourceId, targetId, type);
  if (existing) {
    const edge: KnowledgeEdge = {
      ...existing,
      weight: Math.min(1, existing.weight + 0.08),
      occurrences: existing.occurrences + 1,
      lastSeenAt: ts,
      sourceTabIds: mergeUnique(existing.sourceTabIds, source.tabId ? [source.tabId] : []),
      sourceDocumentIds: mergeUnique(existing.sourceDocumentIds, source.documentId ? [source.documentId] : []),
    };
    return { ...graph, edges: graph.edges.map((e) => (e.id === existing.id ? edge : e)) };
  }
  const edge: KnowledgeEdge = {
    id: genId(),
    sourceId,
    targetId,
    type,
    weight: 0.3,
    occurrences: 1,
    createdAt: ts,
    lastSeenAt: ts,
    sourceTabIds: source.tabId ? [source.tabId] : [],
    sourceDocumentIds: source.documentId ? [source.documentId] : [],
  };
  return { ...graph, edges: [...graph.edges, edge] };
}

export function applyDerivations(graph: KnowledgeGraphData, derivations: Array<{
  nodes: KnowledgeNodeInput[];
  edges: Array<{ source: string; target: string; type: KnowledgeEdgeType }>;
}>): KnowledgeGraphData {
  let g = graph;
  const resolved = new Map<string, string>();
  for (const d of derivations) {
    for (const n of d.nodes) {
      g = upsertNode(g, n);
      const node = findNodeByLabel(g, n.label);
      if (node) resolved.set(nodeKey(n.label), node.id);
    }
    const tabId = d.nodes[0]?.tabId;
    const documentId = d.nodes[0]?.documentId;
    for (const e of d.edges) {
      const s = resolved.get(nodeKey(e.source)) ?? findNodeByLabel(g, e.source)?.id ?? null;
      const t = resolved.get(nodeKey(e.target)) ?? findNodeByLabel(g, e.target)?.id ?? null;
      if (s && t && s !== t) {
        g = upsertEdge(g, s, t, e.type, { tabId, documentId });
      }
    }
  }
  return g;
}

export function removeNode(graph: KnowledgeGraphData, id: string): KnowledgeGraphData {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
  };
}

export function removeEdge(graph: KnowledgeGraphData, id: string): KnowledgeGraphData {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

export function mergeNodes(graph: KnowledgeGraphData, ids: string[]): KnowledgeGraphData {
  if (ids.length < 2) return graph;
  const primary = graph.nodes.find((n) => n.id === ids[0]);
  if (!primary) return graph;
  const rest = ids.slice(1).map((id) => graph.nodes.find((n) => n.id === id)).filter((n): n is KnowledgeNode => n !== undefined);
  const merged: KnowledgeNode = {
    ...primary,
    aliases: mergeUnique(primary.aliases, rest.flatMap((n) => [n.label, ...n.aliases])),
    description: primary.description || rest.map((n) => n.description).find((d) => d !== "") || "",
    definition: primary.definition || rest.map((n) => n.definition).find((d) => d !== "") || "",
    summary: primary.summary || rest.map((n) => n.summary).find((d) => d !== "") || "",
    example: primary.example || rest.map((n) => n.example).find((d) => d !== "") || "",
    occurrences: rest.reduce((acc, n) => acc + n.occurrences, primary.occurrences),
    strength: Math.min(1, rest.reduce((acc, n) => acc + n.strength, primary.strength) / Math.max(1, rest.length + 1)),
    sourceTabIds: mergeUnique(primary.sourceTabIds, rest.flatMap((n) => n.sourceTabIds)),
    sourceDocumentIds: mergeUnique(primary.sourceDocumentIds, rest.flatMap((n) => n.sourceDocumentIds)),
    sourceNoteIds: mergeUnique(primary.sourceNoteIds, rest.flatMap((n) => n.sourceNoteIds)),
    sources: mergeUnique(primary.sources, rest.flatMap((n) => n.sources)),
    aiGenerated: primary.aiGenerated && rest.some((n) => n.aiGenerated),
    manual: primary.manual || rest.some((n) => n.manual),
    updatedAt: Date.now(),
  };
  const others = new Set(ids.slice(1));
  const edges = graph.edges
    .map((e) => {
      const sourceId = others.has(e.sourceId) ? primary.id : e.sourceId;
      const targetId = others.has(e.targetId) ? primary.id : e.targetId;
      if (sourceId === targetId) return null;
      return { ...e, sourceId, targetId };
    })
    .filter((e): e is KnowledgeEdge => e !== null);
  const seen = new Set<string>();
  const deduped = edges.filter((e) => {
    const key = `${e.sourceId}|${e.targetId}|${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !others.has(n.id)).map((n) => (n.id === primary.id ? merged : n)),
    edges: deduped,
  };
}

export function neighbors(graph: KnowledgeGraphData, id: string, depth = 1): Set<string> {
  const out = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const e of graph.edges) {
      if (frontier.has(e.sourceId)) {
        if (!out.has(e.targetId)) { out.add(e.targetId); next.add(e.targetId); }
      }
      if (frontier.has(e.targetId)) {
        if (!out.has(e.sourceId)) { out.add(e.sourceId); next.add(e.sourceId); }
      }
    }
    frontier = next;
  }
  return out;
}

export function findPath(graph: KnowledgeGraphData, fromId: string, toId: string, maxDepth = 6): string[] | null {
  if (fromId === toId) return [fromId];
  const adjacency = buildAdjacency(graph);
  const queue: string[][] = [[fromId]];
  const visited = new Set<string>([fromId]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (path.length >= maxDepth) continue;
    for (const nextId of adjacency.get(last) ?? []) {
      if (nextId === toId) return [...path, nextId];
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push([...path, nextId]);
    }
  }
  return null;
}

export function buildAdjacency(graph: KnowledgeGraphData): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const push = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const e of graph.edges) {
    push(e.sourceId, e.targetId);
    push(e.targetId, e.sourceId);
  }
  return adj;
}

export function searchNodes(graph: KnowledgeGraphData, query: string, limit = 25): KnowledgeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = graph.nodes
    .map((n) => {
      let base = 0;
      if (nodeKey(n.label).includes(q)) base += 10;
      else if (n.label.toLowerCase().includes(q)) base += 8;
      if (n.aliases.some((a) => a.toLowerCase().includes(q))) base += 6;
      if (n.definition.toLowerCase().includes(q)) base += 3;
      if (n.description.toLowerCase().includes(q)) base += 2;
      if (n.summary.toLowerCase().includes(q)) base += 2;
      return { n, score: base > 0 ? base + n.strength * 0.5 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.n);
}

export function graphStats(graph: KnowledgeGraphData): KnowledgeStats {
  const typeCounts: Record<string, number> = {};
  const edgeTypeCounts: Record<string, number> = {};
  let known = 0, weak = 0, strong = 0, pinned = 0, favorite = 0, ai = 0, manual = 0;
  for (const n of graph.nodes) {
    typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
    if (n.strength >= 0.6) strong++;
    else if (n.strength >= 0.3) known++;
    else weak++;
    if (n.pinned) pinned++;
    if (n.favorite) favorite++;
    if (n.aiGenerated) ai++;
    if (n.manual) manual++;
  }
  for (const e of graph.edges) {
    edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] ?? 0) + 1;
  }
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    typeCounts,
    edgeTypeCounts,
    knownCount: known,
    unknownCount: graph.nodes.filter((n) => !n.definition && !n.description && !n.summary).length,
    weakCount: weak,
    strongCount: strong,
    pinnedCount: pinned,
    favoriteCount: favorite,
    aiGeneratedCount: ai,
    manualCount: manual,
  };
}

export function topNodes(graph: KnowledgeGraphData, limit = 10): Array<{ node: KnowledgeNode; degree: number }> {
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  return graph.nodes
    .map((n) => ({ node: n, degree: degree.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree || b.node.strength - a.node.strength)
    .slice(0, limit);
}

export function prerequisitesOf(graph: KnowledgeGraphData, id: string): KnowledgeNode[] {
  const ids = graph.edges
    .filter((e) => e.targetId === id && (e.type === "prerequisite-of" || e.type === "requires" || e.type === "depends-on"))
    .map((e) => e.sourceId);
  return graph.nodes.filter((n) => ids.includes(n.id));
}

export function dependentsOf(graph: KnowledgeGraphData, id: string): KnowledgeNode[] {
  const ids = graph.edges
    .filter((e) => e.sourceId === id && (e.type === "prerequisite-of" || e.type === "requires" || e.type === "depends-on"))
    .map((e) => e.targetId);
  return graph.nodes.filter((n) => ids.includes(n.id));
}

export function studyPath(graph: KnowledgeGraphData, topicId: string, knownIds: Set<string>, maxSteps = 8): KnowledgeNode[] {
  const path: KnowledgeNode[] = [];
  const queue = graph.edges
    .filter((e) => e.targetId === topicId && (e.type === "prerequisite-of" || e.type === "requires" || e.type === "depends-on"))
    .map((e) => e.sourceId);
  const visited = new Set<string>();
  for (const id of queue) {
    if (!visited.has(id)) {
      visited.add(id);
      path.push(graph.nodes.find((n) => n.id === id)!);
    }
    if (path.length >= maxSteps) break;
  }
  if (path.length < maxSteps) {
    const pending = [...visited];
    for (const id of pending) {
      for (const e of graph.edges) {
        if (e.targetId === id && (e.type === "prerequisite-of" || e.type === "requires" || e.type === "depends-on")) {
          if (!visited.has(e.sourceId)) {
            visited.add(e.sourceId);
            const node = graph.nodes.find((n) => n.id === e.sourceId);
            if (node) path.push(node);
          }
        }
        if (path.length >= maxSteps) break;
      }
      if (path.length >= maxSteps) break;
    }
  }
  return path.filter((n) => !knownIds.has(n.id));
}

export function nodesFromTabs(graph: KnowledgeGraphData, tabIds: string[]): KnowledgeNode[] {
  const set = new Set(tabIds);
  return graph.nodes.filter((n) => n.sourceTabIds.some((id) => set.has(id)));
}

export function nodesFromDocuments(graph: KnowledgeGraphData, documentIds: string[]): KnowledgeNode[] {
  const set = new Set(documentIds);
  return graph.nodes.filter((n) => n.sourceDocumentIds.some((id) => set.has(id)));
}

export function connectedSubgraph(graph: KnowledgeGraphData, nodes: KnowledgeNode[]): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: graph.edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId)),
  };
}

export function growthByDay(graph: KnowledgeGraphData, days = 30): Array<{ day: number; count: number }> {
  const out: Array<{ day: number; count: number }> = [];
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Map<number, number>();
  for (const n of graph.nodes) {
    const ageDays = Math.floor((nowMs - n.createdAt) / dayMs);
    if (ageDays > days) continue;
    buckets.set(ageDays, (buckets.get(ageDays) ?? 0) + 1);
  }
  for (let i = days; i >= 0; i--) {
    out.push({ day: i, count: buckets.get(i) ?? 0 });
  }
  return out;
}

function bumpStrength(current: number, occurrences: number): number {
  return Math.min(1, 0.25 + Math.log2(1 + occurrences) * 0.12 + current * 0.35);
}

function mergeUnique(a: string[], b: string[]): string[] {
  const set = new Set(a);
  for (const x of b) set.add(x);
  return Array.from(set);
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}