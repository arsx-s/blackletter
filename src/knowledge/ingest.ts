import type { KnowledgeDerivation, KnowledgeGraphData, KnowledgeNode } from "../types/knowledge";
import {
  extractDerivations,
  extractHeadings,
  extractNodeKeysForQuery,
  normalizeLabel,
} from "./extractor";
import { prerequisitesOf } from "./graph";

export interface IngestContext {
  tabId?: string;
  documentId?: string;
  noteId?: string;
  sources?: string[];
}

function withContext(d: KnowledgeDerivation, ctx: IngestContext): KnowledgeDerivation {
  return {
    nodes: d.nodes.map((n) => ({
      ...n,
      tabId: ctx.tabId,
      documentId: ctx.documentId,
      noteId: ctx.noteId,
      sources: [...(n.sources ?? []), ...(ctx.sources ?? [])],
    })),
    edges: d.edges,
  };
}

export function ingestText(text: string, ctx: IngestContext): KnowledgeDerivation {
  return withContext(extractDerivations(text), ctx);
}

export function ingestDocumentText(name: string, text: string, ctx: IngestContext): KnowledgeDerivation {
  const headings = extractHeadings(text);
  const nodes: KnowledgeDerivation["nodes"] = [];
  const edges: KnowledgeDerivation["edges"] = [];

  nodes.push({
    type: "document",
    label: name,
    description: `Uploaded document. ${text.length.toLocaleString()} characters extracted.`,
    ...ctx,
    sources: ctx.sources ?? [],
  });

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    nodes.push({
      type: "subtopic",
      label: heading.title,
      description: `Document heading (level ${heading.level}) under "${name}".`,
      ...ctx,
      sources: ctx.sources ?? [],
    });
    if (i + 1 < headings.length) {
      edges.push({ source: heading.title, target: headings[i + 1].title, type: "contains" });
    }
    if (i === 0 || headings[i - 1].level >= heading.level) {
      edges.push({ source: name, target: heading.title, type: "contains" });
    }
  }

  const structure: KnowledgeDerivation = withContext({ nodes, edges }, ctx);
  const body = text.replace(/^#{1,4}\s+.*$/gm, "");
  const terms = ingestText(body, ctx);
  return {
    nodes: [...structure.nodes, ...terms.nodes],
    edges: [...structure.edges, ...terms.edges],
  };
}

export interface GraphMemoryLine {
  node: KnowledgeNode;
  label: string;
  desc: string;
  familiar: boolean;
}

export function matchGraphNodes(graph: KnowledgeGraphData, query: string): KnowledgeNode[] {
  if (!query.trim()) return [];
  const knownKeys = new Set<string>();
  for (const n of graph.nodes) {
    knownKeys.add(normalizeLabel(n.label));
    for (const a of n.aliases) knownKeys.add(normalizeLabel(a));
  }
  const keys = extractNodeKeysForQuery(query, knownKeys);
  if (keys.length === 0) return [];
  return graph.nodes.filter(
    (n) => keys.includes(normalizeLabel(n.label)) || n.aliases.some((a) => keys.includes(normalizeLabel(a))),
  );
}

export function contextForQuery(graph: KnowledgeGraphData, query: string, limit = 12): string {
  const matches = matchGraphNodes(graph, query);
  if (matches.length === 0) return "";
  const lines = matches.slice(0, limit).map((n) => {
    const desc = (n.definition || n.description || n.summary || "").trim();
    const short = desc.length > 150 ? desc.slice(0, 150) + "…" : desc;
    const familiar = n.strength >= 0.3 ? "studied" : "new";
    return `- ${n.label} [${n.type}, ${familiar}]${short ? ` — ${short}` : ""}`;
  });
  return `RELEVANT KNOWLEDGE FROM GRAPH MEMORY (prior research on this workspace):
${lines.join("\n")}

Use the above only as context; do not mention the knowledge graph to the user unless relevant.`;
}

export function gapHitsForQuery(graph: KnowledgeGraphData, query: string): Array<{ node: KnowledgeNode; prereqs: KnowledgeNode[] }> {
  const matches = matchGraphNodes(graph, query);
  return matches
    .map((n) => ({ node: n, prereqs: prerequisitesOf(graph, n.id) }))
    .filter((x) => x.node.strength <= 0.3 || x.prereqs.length > 0)
    .map((x) => {
      const harsh = x.prereqs.filter((p) => p.strength < 0.3);
      return { node: x.node, prereqs: harsh.length > 0 ? harsh : x.prereqs };
    });
}