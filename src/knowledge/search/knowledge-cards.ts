import type { KnowledgeObject, KnowledgeCard } from "../types";
import { KnowledgeObjectStore } from "../objects/object-store";

export class DynamicKnowledgeCards {
  private store: KnowledgeObjectStore;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
  }

  generateCard(objectId: string): KnowledgeCard | null {
    const obj = this.store.get(objectId);
    if (!obj) return null;

    const prerequisites = (obj.content.prerequisiteIds ?? []).map((id) => {
      const prereq = this.store.get(id);
      return {
        id,
        label: prereq?.title ?? "Unknown",
        relationship: "prerequisite",
      };
    });

    const relatedTopics = obj.relationships
      .filter((r) => ["related", "builds-on", "application", "cross-discipline"].includes(r.type))
      .slice(0, 8)
      .map((r) => {
        const target = this.store.get(r.targetId);
        return {
          id: r.targetId,
          label: target?.title ?? "Unknown",
          relationship: r.label || r.type,
        };
      });

    return {
      objectId: obj.id,
      title: obj.title,
      type: obj.type,
      subjectName: obj.subjectName,
      difficulty: obj.difficulty,
      confidence: obj.confidence,
      definition: obj.content.definition ?? obj.content.summary,
      summary: obj.content.summary,
      examples: obj.content.examples ?? [],
      visualDescription: obj.content.visualDescription ?? "",
      applications: obj.content.applications ?? [],
      commonMistakes: obj.content.commonMistakes ?? [],
      prerequisites,
      relatedTopics,
      sources: obj.sources,
      challengeQuestion: obj.content.challengeQuestion ?? "",
      memoryTechnique: obj.content.memoryTechnique ?? "",
      tags: obj.tags,
      updatedAt: obj.updatedAt,
    };
  }

  generateCards(objectIds: string[]): KnowledgeCard[] {
    return objectIds
      .map((id) => this.generateCard(id))
      .filter(Boolean) as KnowledgeCard[];
  }

  generateCardForObject(obj: KnowledgeObject): KnowledgeCard | null {
    const stored = this.store.get(obj.id);
    if (!stored) return this.generateCard(obj.id);

    const prerequisites = (stored.content.prerequisiteIds ?? []).map((id) => {
      const prereq = this.store.get(id);
      return {
        id,
        label: prereq?.title ?? "Unknown",
        relationship: "prerequisite" as const,
      };
    });

    const relatedTopics = stored.relationships
      .filter((r) => ["related", "builds-on", "application", "cross-discipline"].includes(r.type))
      .slice(0, 8)
      .map((r) => {
        const target = this.store.get(r.targetId);
        return {
          id: r.targetId,
          label: target?.title ?? "Unknown",
          relationship: r.label || r.type,
        };
      });

    return {
      objectId: stored.id,
      title: stored.title,
      type: stored.type,
      subjectName: stored.subjectName,
      difficulty: stored.difficulty,
      confidence: stored.confidence,
      definition: stored.content.definition ?? stored.content.summary,
      summary: stored.content.summary,
      examples: stored.content.examples ?? [],
      visualDescription: stored.content.visualDescription ?? "",
      applications: stored.content.applications ?? [],
      commonMistakes: stored.content.commonMistakes ?? [],
      prerequisites,
      relatedTopics,
      sources: stored.sources,
      challengeQuestion: stored.content.challengeQuestion ?? "",
      memoryTechnique: stored.content.memoryTechnique ?? "",
      tags: stored.tags,
      updatedAt: stored.updatedAt,
    };
  }
}
