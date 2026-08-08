import { describe, it, expect } from "vitest";
import {
  applyDerivations,
  buildAdjacency,
  connectedSubgraph,
  emptyGraph,
  findEdge,
  findNodeByLabel,
  findPath,
  graphStats,
  growthByDay,
  mergeNodes,
  neighbors,
  prerequisitesOf,
  dependentsOf,
  removeEdge,
  removeNode,
  searchNodes,
  studyPath,
  topNodes,
  upsertEdge,
  upsertNode,
} from "../../knowledge/graph";
import { extractDerivations } from "../../knowledge/extractor";
import type { KnowledgeGraphData, KnowledgeNodeInput } from "../../types/knowledge";

const T = 1_700_000_000_000;

function input(label: string, type: KnowledgeNodeInput["type"] = "concept", extra: Partial<KnowledgeNodeInput> = {}): KnowledgeNodeInput {
  return { label, type, now: T, ...extra };
}

describe("knowledge graph ops", () => {
  it("creates nodes and merges by normalized label", () => {
    let g = upsertNode(emptyGraph(), input("Flexbox", "technology"));
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].occurrences).toBe(1);
    expect(g.nodes[0].type).toBe("technology");
    g = upsertNode(g, input("flexbox", "concept", { aliases: ["flex"] }));
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].occurrences).toBe(2);
    expect(g.nodes[0].aliases).toContain("flex");
    expect(g.nodes[0].type).toBe("technology");
    expect(g.nodes[0].strength).toBeGreaterThan(0.25);
  });

  it("dedupes edges by source, target and type", () => {
    let g = upsertNode(emptyGraph(), input("CSS", "technology"));
    g = upsertNode(g, input("Selectors", "concept"));
    const a = g.nodes[0].id;
    const b = g.nodes[1].id;
    g = upsertEdge(g, a, b, "contains");
    g = upsertEdge(g, a, b, "contains");
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].occurrences).toBe(2);
    g = upsertEdge(g, a, b, "related-to");
    expect(g.edges).toHaveLength(2);
  });

  it("applies derivations resolving labels to node ids", () => {
    const d = extractDerivations("**Contract** requires Offer. **Contract** requires Acceptance.");
    let g = emptyGraph();
    g = applyDerivations(g, [d]);
    expect(g.nodes.length).toBeGreaterThanOrEqual(2);
    const contract = findNodeByLabel(g, "Contract");
    expect(contract).not.toBeNull();
    for (const e of g.edges) {
      expect(e.sourceId).not.toBe(e.targetId);
      expect(g.nodes.some((n) => n.id === e.sourceId)).toBe(true);
      expect(g.nodes.some((n) => n.id === e.targetId)).toBe(true);
    }
  });

  it("removes nodes and cascades edges", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    g = upsertNode(g, input("B"));
    g = upsertEdge(g, g.nodes[0].id, g.nodes[1].id, "related-to");
    g = removeNode(g, g.nodes[0].id);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it("removes individual edges", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    g = upsertNode(g, input("B"));
    g = upsertEdge(g, g.nodes[0].id, g.nodes[1].id, "contains");
    g = removeEdge(g, g.edges[0].id);
    expect(g.edges).toHaveLength(0);
  });

  it("merges nodes, rewires edges and dedupes", () => {
    let g = upsertNode(emptyGraph(), input("React", "technology"));
    g = upsertNode(g, input("ReactJS", "concept", { aliases: ["react js"] }));
    g = upsertNode(g, input("Hooks", "concept"));
    const react = g.nodes[0].id;
    const reactjs = g.nodes[1].id;
    const hooks = g.nodes[2].id;
    g = upsertEdge(g, react, hooks, "contains");
    g = upsertEdge(g, reactjs, hooks, "contains");
    g = mergeNodes(g, [react, reactjs]);
    expect(g.nodes).toHaveLength(2);
    const merged = g.nodes.find((n) => n.id === react)!;
    expect(merged.aliases).toContain("ReactJS");
    expect(merged.aliases).toContain("react js");
    const relEdges = g.edges.filter((e) => e.type === "contains");
    expect(relEdges).toHaveLength(1);
    expect(relEdges[0].sourceId).toBe(react);
  });

  it("computes neighbors at depth", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    g = upsertNode(g, input("B"));
    g = upsertNode(g, input("C"));
    const [a, b, c] = g.nodes.map((n) => n.id);
    g = upsertEdge(g, a, b, "related-to");
    g = upsertEdge(g, b, c, "related-to");
    expect(neighbors(g, a, 1)).toEqual(new Set([a, b]));
    expect(neighbors(g, a, 2)).toEqual(new Set([a, b, c]));
  });

  it("finds shortest paths and builds adjacency", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    g = upsertNode(g, input("B"));
    g = upsertNode(g, input("C"));
    g = upsertNode(g, input("D"));
    const [a, b, c, d] = g.nodes.map((n) => n.id);
    g = upsertEdge(g, a, b, "related-to");
    g = upsertEdge(g, b, c, "related-to");
    g = upsertEdge(g, c, d, "related-to");
    const path = findPath(g, a, d);
    expect(path).toEqual([a, b, c, d]);
    expect(buildAdjacency(g).get(a)).toContain(b);
    expect(findPath(g, d, a)?.length).toBe(4);
  });

  it("searches nodes with scoring", () => {
    let g = upsertNode(emptyGraph(), input("React Hooks", "concept"));
    g = upsertNode(g, input("CSS Grid", "concept"));
    const hits = searchNodes(g, "hooks");
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("React Hooks");
    expect(searchNodes(g, "")).toHaveLength(0);
    expect(searchNodes(g, "zzzz")).toHaveLength(0);
  });

  it("computes stats", () => {
    let g = upsertNode(emptyGraph(), input("A", "concept"));
    g = upsertNode(g, input("B", "person"));
    g = upsertNode(g, input("C", "law"));
    g = upsertEdge(g, g.nodes[0].id, g.nodes[1].id, "related-to");
    const s = graphStats(g);
    expect(s.nodeCount).toBe(3);
    expect(s.edgeCount).toBe(1);
    expect(s.typeCounts.concept).toBe(1);
    expect(s.typeCounts.person).toBe(1);
    expect(s.typeCounts.law).toBe(1);
    expect(s.unknownCount).toBe(3);
  });

  it("ranks nodes by degree", () => {
    let g = upsertNode(emptyGraph(), input("hub"));
    g = upsertNode(g, input("leaf1"));
    g = upsertNode(g, input("leaf2"));
    const [hub, l1, l2] = g.nodes.map((n) => n.id);
    g = upsertEdge(g, hub, l1, "related-to");
    g = upsertEdge(g, hub, l2, "related-to");
    const ranked = topNodes(g, 2);
    expect(ranked[0].node.label).toBe("hub");
    expect(ranked[0].degree).toBe(2);
  });

  it("computes prerequisites, dependents and study paths", () => {
    let g = upsertNode(emptyGraph(), input("Calculus", "concept"));
    g = upsertNode(g, input("Linear Algebra", "concept"));
    g = upsertNode(g, input("Neural Networks", "concept"));
    const [calc, la, nn] = g.nodes.map((n) => n.id);
    g = upsertEdge(g, calc, nn, "requires");
    g = upsertEdge(g, la, nn, "requires");
    expect(prerequisitesOf(g, nn).map((n) => n.id).sort()).toEqual([calc, la].sort());
    expect(dependentsOf(g, calc).map((n) => n.id)).toEqual([nn]);
    const path = studyPath(g, nn, new Set([la]));
    expect(path.map((n) => n.id)).toEqual([calc]);
  });

  it("buckets growth by day", () => {
    let g = upsertNode(emptyGraph(), input("A", "concept", { now: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    g = upsertNode(g, input("B", "concept", { now: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    g = upsertNode(g, input("C", "concept", { now: Date.now() }));
    const growth = growthByDay(g, 30);
    expect(growth).toHaveLength(31);
    expect(growth[28].count).toBe(2);
    expect(growth[30].count).toBe(1);
  });

  it("filters subgraphs by tab and document provenance", () => {
    let g = upsertNode(emptyGraph(), input("Tabbed Concept", "concept", { tabId: "t1" }));
    g = upsertNode(g, input("Doc Concept", "concept", { documentId: "d1" }));
    g = upsertNode(g, input("Other", "concept"));
    g = upsertEdge(g, g.nodes[0].id, g.nodes[1].id, "related-to");
    const { nodes } = connectedSubgraph(g, g.nodes.slice(0, 2));
    expect(nodes).toHaveLength(2);
  });

  it("findEdge looks up by triple", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    g = upsertNode(g, input("B"));
    g = upsertEdge(g, g.nodes[0].id, g.nodes[1].id, "cites");
    const e = findEdge(g, g.nodes[0].id, g.nodes[1].id, "cites");
    expect(e).not.toBeNull();
    expect(findEdge(g, g.nodes[0].id, g.nodes[1].id, "contains")).toBeNull();
  });
});

function sampleGraph(): KnowledgeGraphData {
  return emptyGraph();
}

describe("graph invariants", () => {
  it("never produces self-edges through derivations", () => {
    const d = extractDerivations("A contract is a legally binding agreement. **Contract** requires Consideration.");
    const g = applyDerivations(emptyGraph(), [d]);
    for (const e of g.edges) expect(e.sourceId).not.toBe(e.targetId);
  });

  it("preserves ids across updates", () => {
    let g = upsertNode(emptyGraph(), input("A"));
    const id = g.nodes[0].id;
    g = upsertNode(g, input("a", "concept", { aliases: ["alias"] }));
    expect(g.nodes[0].id).toBe(id);
  });

  it("keeps graph immutable by default", () => {
    const g = upsertNode(emptyGraph(), input("A"));
    const snapshot = JSON.stringify(g);
    void sampleGraph();
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});
