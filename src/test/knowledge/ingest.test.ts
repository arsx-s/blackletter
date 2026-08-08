import { describe, it, expect } from "vitest";
import {
  contextForQuery,
  gapHitsForQuery,
  ingestDocumentText,
  ingestText,
  matchGraphNodes,
} from "../../knowledge/ingest";
import { applyDerivations, emptyGraph, findNodeByLabel } from "../../knowledge/graph";

describe("ingest", () => {
  it("ingests plain text derivations with context", () => {
    const d = ingestText("**Flexbox** is a layout mode. **Grid** relates to **Flexbox**.", { tabId: "t1", sources: ["Test"] });
    expect(d.nodes.some((n) => n.label === "Flexbox")).toBe(true);
    expect(d.nodes.every((n) => n.tabId === "t1")).toBe(true);
    expect(d.edges.length).toBeGreaterThan(0);
  });

  it("ingests documents into a document node with heading edges", () => {
    const d = ingestDocumentText("styles.pdf", "# Introduction\n## Selectors\n## Pseudo Classes", { documentId: "d1" });
    const labels = d.nodes.map((n) => n.label);
    expect(labels).toContain("styles.pdf");
    expect(labels).toContain("Introduction");
    expect(labels).toContain("Selectors");
    expect(labels).toContain("Pseudo Classes");
    expect(d.nodes.some((n) => n.type === "document")).toBe(true);
    expect(d.edges.some((e) => e.source === "styles.pdf" && e.type === "contains")).toBe(true);
  });

  it("builds graph memory context for matching queries", () => {
    let g = applyDerivations(emptyGraph(), [{ nodes: [{ label: "Flexbox", type: "technology", definition: "A one-dimensional CSS layout model." }], edges: [] }]);
    g = applyDerivations(g, [{ nodes: [{ label: "Contract Law", type: "topic", definition: "The law of agreements." }], edges: [] }]);
    const context = contextForQuery(g, "Explain flexbox");
    expect(context).toContain("GRAPH MEMORY");
    expect(context).toContain("Flexbox");
    expect(context).not.toContain("Contract Law");
    expect(contextForQuery(g, "astrophysics")).toBe("");
  });

  it("matches graph nodes from a query", () => {
    let g = applyDerivations(emptyGraph(), [{ nodes: [{ label: "useState", type: "concept", aliases: ["use state"] }], edges: [] }]);
    g = applyDerivations(g, [{ nodes: [{ label: "Virtual DOM", type: "concept" }], edges: [] }]);
    expect(matchGraphNodes(g, "what is useState").some((n) => n.label === "useState")).toBe(true);
    expect(matchGraphNodes(g, "virtual dom").map((n) => n.label)).toContain("Virtual DOM");
    expect(matchGraphNodes(g, "unrelated topic")).toHaveLength(0);
  });

  it("reports gap hits with prerequisites", () => {
    let g = applyDerivations(emptyGraph(), [
      {
        nodes: [
          { label: "Neural Networks", type: "concept", tabId: "x" },
          { label: "Calculus", type: "concept", tabId: "x" },
        ],
        edges: [{ source: "Calculus", target: "Neural Networks", type: "requires" }],
      },
    ]);
    const hits = gapHitsForQuery(g, "neural networks");
    expect(hits.length).toBeGreaterThan(0);
    const hit = hits.find((h) => h.node.label === "Neural Networks")!;
    expect(hit.prereqs.map((p) => p.label)).toContain("Calculus");
  });

  it("resolves document headings into the graph via applyDerivations", () => {
    const d = ingestDocumentText("brief.txt", "## Offer\n\n**Offer** requires Acceptance.", { documentId: "d1" });
    const g = applyDerivations(emptyGraph(), [d]);
    expect(findNodeByLabel(g, "brief.txt")).not.toBeNull();
    expect(findNodeByLabel(g, "Offer")).not.toBeNull();
    expect(findNodeByLabel(g, "Acceptance")).not.toBeNull();
  });
});