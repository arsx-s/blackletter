import type { KnowledgeEdge, KnowledgeGraphData, KnowledgeNode } from "../types/knowledge";
import { KNOWLEDGE_EDGE_LABELS, KNOWLEDGE_NODE_LABELS } from "../types/knowledge";
import { graphStats } from "./graph";
import type { Position } from "./layout";

export function downloadTextFile(name: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportGraphJson(graph: KnowledgeGraphData): string {
  return JSON.stringify(graph, null, 2);
}

export function exportGraphCsv(graph: KnowledgeGraphData): string {
  const lines: string[] = ["kind,id,label,type,strength,occurrences,pinned,favorite,aiGenerated,detail"];
  for (const n of graph.nodes) {
    lines.push(
      ["node", n.id, csv(n.label), n.type, n.strength.toFixed(2), n.occurrences, n.pinned ? "1" : "0", n.favorite ? "1" : "0", n.aiGenerated ? "1" : "0", csv(n.definition || n.description)].join(","),
    );
  }
  for (const e of graph.edges) {
    lines.push(["edge", e.id, nodeLabel(graph, e.sourceId), e.type, e.weight.toFixed(2), e.occurrences, "", "", "", `${nodeLabel(graph, e.sourceId)} ${KNOWLEDGE_EDGE_LABELS[e.type]} ${nodeLabel(graph, e.targetId)}`].join(","));
  }
  return lines.join("\n");
}

export function exportGraphMarkdown(graph: KnowledgeGraphData): string {
  const stats = graphStats(graph);
  const out: string[] = [];
  out.push(`# BlackLetter Knowledge Graph`);
  out.push(``);
  out.push(`- **${stats.nodeCount} nodes** · **${stats.edgeCount} edges**`);
  out.push(``);
  const byType = new Map<string, KnowledgeNode[]>();
  for (const n of graph.nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }
  for (const [type, nodes] of Array.from(byType.entries()).sort((a, b) => b[1].length - a[1].length)) {
    out.push(`## ${KNOWLEDGE_NODE_LABELS[type as keyof typeof KNOWLEDGE_NODE_LABELS] ?? type} (${nodes.length})`);
    out.push(``);
    for (const n of nodes) {
      const def = n.definition || n.description;
      out.push(`- **${n.label}**${def ? ` — ${def}` : ""}${n.pinned ? " ⭐" : ""}${n.favorite ? " ★" : ""}`);
    }
    out.push(``);
  }
  if (graph.edges.length > 0) {
    out.push(`## Relationships (${graph.edges.length})`);
    out.push(``);
    for (const e of graph.edges.slice(0, 400)) {
      out.push(`- ${nodeLabel(graph, e.sourceId)} ${KNOWLEDGE_EDGE_LABELS[e.type]} ${nodeLabel(graph, e.targetId)}`);
    }
  }
  return out.join("\n");
}

export function exportGraphGraphML(graph: KnowledgeGraphData): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">`);
  lines.push(`  <key id="label" for="node" attr.name="label" attr.type="string"/>`);
  lines.push(`  <key id="type" for="node" attr.name="type" attr.type="string"/>`);
  lines.push(`  <key id="strength" for="node" attr.name="strength" attr.type="double"/>`);
  lines.push(`  <key id="rtype" for="edge" attr.name="relationship" attr.type="string"/>`);
  lines.push(`  <graph id="G" edgedefault="undirected">`);
  for (const n of graph.nodes) {
    lines.push(`    <node id="${esc(n.id)}">`);
    lines.push(`      <data key="label">${esc(n.label)}</data>`);
    lines.push(`      <data key="type">${esc(n.type)}</data>`);
    lines.push(`      <data key="strength">${n.strength.toFixed(3)}</data>`);
    lines.push(`    </node>`);
  }
  for (const e of graph.edges) {
    lines.push(`    <edge id="${esc(e.id)}" source="${esc(e.sourceId)}" target="${esc(e.targetId)}">`);
    lines.push(`      <data key="rtype">${esc(e.type)}</data>`);
    lines.push(`    </edge>`);
  }
  lines.push(`  </graph>`);
  lines.push(`</graphml>`);
  return lines.join("\n");
}

export function nodeLabel(graph: KnowledgeGraphData, id: string): string {
  return graph.nodes.find((n) => n.id === id)?.label ?? id;
}

export interface SvgLayout {
  positions: Map<string, Position>;
  width: number;
  height: number;
}

export function exportGraphSvg(graph: KnowledgeGraphData, layout: SvgLayout): string {
  const { positions, width, height } = layout;
  const lines: string[] = [];
  const pad = 60;
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width + pad * 2}" height="${height + pad * 2}" viewBox="${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}">`);
  lines.push(`  <rect x="${-pad}" y="${-pad}" width="${width + pad * 2}" height="${height + pad * 2}" fill="#0A0A0A"/>`);
  for (const e of graph.edges) {
    const a = positions.get(e.sourceId);
    const b = positions.get(e.targetId);
    if (!a || !b) continue;
    lines.push(`  <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(245,244,240,0.18)" stroke-width="1"/>`);
  }
  for (const n of graph.nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const r = Math.min(14, 6 + n.strength * 8);
    lines.push(`  <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(245,244,240,0.9)"${n.pinned ? ' stroke="#E8E6E1" stroke-width="2"' : ""}/>`);
    lines.push(`  <text x="${(p.x + 16).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-family="monospace" font-size="10" fill="rgba(245,244,240,0.55)">${esc(n.label)}</text>`);
  }
  lines.push(`</svg>`);
  return lines.join("\n");
}

export async function exportGraphPng(svg: string, name = "blackletter-graph.png"): Promise<void> {
  const img = new Image();
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not rasterize graph"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width || 1600;
    canvas.height = img.height || 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function edgesBetween(graph: KnowledgeGraphData, ids: Set<string>): KnowledgeEdge[] {
  return graph.edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId));
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\n/g, " ")}"`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}