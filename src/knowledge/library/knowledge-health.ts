import type { KnowledgeHealth, KnowledgeObject } from "../types";
import { KnowledgeObjectStore } from "../objects/object-store";

export class KnowledgeHealthTracker {
  private store: KnowledgeObjectStore;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
  }

  calculate(): KnowledgeHealth {
    const all = this.store.getAll();
    const byType = this.store.countByType();
    const bySubject = this.store.countBySubject();

    const uniqueSubjects = Object.keys(bySubject).length;
    const totalTypes = Object.keys(byType).filter((k) => (byType[k as keyof typeof byType] ?? 0) > 0).length;
    const maxTypes = 17;

    const connections = all.reduce((sum, o) => sum + o.relationships.length, 0);
    const avgConnections = all.length > 0 ? connections / all.length : 0;

    const knowledgeDiversity = uniqueSubjects > 0
      ? (totalTypes / maxTypes) * 0.5 + (uniqueSubjects / 12) * 0.5
      : 0;

    const needsRevision = all.filter((o) => o.confidence < 0.4).map((o) => o.title);

    const totalConfidence = all.reduce((sum, o) => sum + o.confidence, 0);
    const avgConfidence = all.length > 0 ? totalConfidence / all.length : 0;
    const researchDepth = avgConfidence;

    const totalObjects = all.length;
    const maxDaily = 5;
    const consistencyRatio = Math.min(1, totalObjects / (Math.max(1, this.daysSinceCreation()) * maxDaily));
    const learningConsistency = consistencyRatio;

    const strengthBySubject: Record<string, number> = {};
    for (const obj of all) {
      const current = strengthBySubject[obj.subjectId] ?? 0;
      strengthBySubject[obj.subjectId] = current + obj.confidence;
    }
    for (const key of Object.keys(strengthBySubject)) {
      const count = bySubject[key] ?? 1;
      strengthBySubject[key] = Math.round((strengthBySubject[key] / count) * 100) / 100;
    }

    return {
      topicsExplored: totalObjects,
      knowledgeDiversity: Math.round(knowledgeDiversity * 100) / 100,
      connectionsDiscovered: connections,
      totalRelationships: connections,
      areasNeedingRevision: needsRevision.slice(0, 10),
      researchDepth: Math.round(researchDepth * 100) / 100,
      learningConsistency: Math.round(learningConsistency * 100) / 100,
      totalObjects,
      byType,
      bySubject,
      strengthBySubject,
      knowledgeGraphSize: connections,
    };
  }

  private daysSinceCreation(): number {
    const earliest = this.store
      .getAll()
      .reduce((min, o) => Math.min(min, o.createdAt), Date.now());
    return Math.max(1, Math.ceil((Date.now() - earliest) / 86_400_000));
  }
}
