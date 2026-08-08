import type { ConceptNode, ConceptEdge, EdgeRelationship } from "../types";

export class KnowledgeGraph {
  nodes: Map<string, ConceptNode> = new Map();
  edges: ConceptEdge[] = [];
  subjectId: string;
  topicLabel: string;
  createdAt: number;
  updatedAt: number;

  constructor(subjectId: string, topicLabel: string) {
    this.subjectId = subjectId;
    this.topicLabel = topicLabel;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addNode(node: ConceptNode): ConceptNode {
    const existing = this.nodes.get(node.id);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, node.confidence);
      existing.estimatedMinutes = Math.max(existing.estimatedMinutes, node.estimatedMinutes);
      for (const kw of node.keywords) {
        if (!existing.keywords.includes(kw)) existing.keywords.push(kw);
      }
      this.updatedAt = Date.now();
      return existing;
    }
    this.nodes.set(node.id, node);
    this.updatedAt = Date.now();
    return node;
  }

  addEdge(
    sourceId: string,
    targetId: string,
    relationship: EdgeRelationship,
    strength: number = 0.5,
    description?: string,
  ): ConceptEdge | null {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) return null;

    const exists = this.edges.some(
      (e) => e.sourceId === sourceId && e.targetId === targetId && e.relationship === relationship,
    );
    if (exists) return null;

    const edge: ConceptEdge = { sourceId, targetId, relationship, strength, description };
    this.edges.push(edge);
    this.updatedAt = Date.now();
    return edge;
  }

  getDependencies(conceptId: string): ConceptNode[] {
    const prereqIds = this.edges
      .filter((e) => e.targetId === conceptId && e.relationship === "prerequisite")
      .map((e) => e.sourceId);
    return prereqIds.map((id) => this.nodes.get(id)).filter(Boolean) as ConceptNode[];
  }

  getDependents(conceptId: string): ConceptNode[] {
    const dependentIds = this.edges
      .filter((e) => e.sourceId === conceptId && e.relationship === "builds-on")
      .map((e) => e.targetId);
    return dependentIds.map((id) => this.nodes.get(id)).filter(Boolean) as ConceptNode[];
  }

  getRelated(conceptId: string): { node: ConceptNode; edge: ConceptEdge }[] {
    const results: { node: ConceptNode; edge: ConceptEdge }[] = [];
    for (const edge of this.edges) {
      if (edge.sourceId === conceptId) {
        const node = this.nodes.get(edge.targetId);
        if (node) results.push({ node, edge });
      } else if (edge.targetId === conceptId) {
        const node = this.nodes.get(edge.sourceId);
        if (node) results.push({ node, edge });
      }
    }
    return results;
  }

  getNodesByTier(tier: string): ConceptNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.tier === tier);
  }

  getCrossDisciplineConnections(currentSubjectId: string): { node: ConceptNode; edge: ConceptEdge }[] {
    return this.edges
      .filter((e) => e.relationship === "cross-discipline")
      .flatMap((e) => {
        const source = this.nodes.get(e.sourceId);
        const target = this.nodes.get(e.targetId);
        const results: { node: ConceptNode; edge: ConceptEdge }[] = [];
        if (source && source.subjectId !== currentSubjectId) results.push({ node: source, edge: e });
        if (target && target.subjectId !== currentSubjectId) results.push({ node: target, edge: e });
        return results;
      });
  }

  findConceptByLabel(label: string): ConceptNode | undefined {
    const lower = label.toLowerCase();
    return Array.from(this.nodes.values()).find(
      (n) => n.label.toLowerCase() === lower || n.keywords.some((k) => k.toLowerCase() === lower),
    );
  }

  searchConcepts(query: string): ConceptNode[] {
    const lower = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      (n) =>
        n.label.toLowerCase().includes(lower) ||
        n.description.toLowerCase().includes(lower) ||
        n.keywords.some((k) => k.toLowerCase().includes(lower)),
    );
  }

  toJSON(): string {
    return JSON.stringify({
      nodes: Array.from(this.nodes.entries()),
      edges: this.edges,
      subjectId: this.subjectId,
      topicLabel: this.topicLabel,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  static fromJSON(json: string): KnowledgeGraph {
    const data = JSON.parse(json);
    const graph = new KnowledgeGraph(data.subjectId, data.topicLabel);
    graph.createdAt = data.createdAt;
    graph.updatedAt = data.updatedAt;
    graph.nodes = new Map(data.nodes);
    graph.edges = data.edges;
    return graph;
  }

  getTierProgression(): { tier: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const node of this.nodes.values()) {
      counts.set(node.tier, (counts.get(node.tier) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => {
        const order: Record<string, number> = {
          foundation: 0, core: 1, intermediate: 2, advanced: 3, expert: 4,
          application: 5, research: 6, future: 7,
        };
        return (order[a.tier] ?? 99) - (order[b.tier] ?? 99);
      });
  }
}
