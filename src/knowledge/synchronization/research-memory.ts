import type { KnowledgeObject } from "../types";
import { KnowledgeObjectStore } from "../objects/object-store";
import { ObjectRelationshipEngine } from "../objects/object-relationships";
import { KnowledgeObjectFactory } from "../objects/object-factory";

export class ResearchMemory {
  private store: KnowledgeObjectStore;
  private relationships: ObjectRelationshipEngine;
  private factory: KnowledgeObjectFactory;

  constructor(
    store: KnowledgeObjectStore,
    relationships: ObjectRelationshipEngine,
    factory: KnowledgeObjectFactory,
  ) {
    this.store = store;
    this.relationships = relationships;
    this.factory = factory;
  }

  rememberQuery(
    query: string,
    response: string,
    subjectId: string,
    subjectName: string,
    relatedObjectIds: string[] = [],
  ): KnowledgeObject {
    const tags = this.extractTags(query, subjectName);
    const obj = this.factory.createFromQuery(query, response, subjectId, subjectName, tags);

    for (const relatedId of relatedObjectIds) {
      this.factory.addRelationship(obj.id, relatedId, "references", 0.5, `Referenced in research on "${query}"`);
    }

    this.relationships.autoConnect(obj);
    return obj;
  }

  rememberConcepts(
    concepts: { label: string; description: string; difficulty: number }[],
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject[] {
    const created: KnowledgeObject[] = [];

    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      const obj = this.factory.createFromConcept(c.label, c.description, subjectId, subjectName, c.difficulty);
      created.push(obj);

      if (i > 0) {
        this.factory.addRelationship(obj.id, created[i - 1].id, "builds-on", 0.6, `Builds on ${created[i - 1].title}`);
        this.factory.addRelationship(created[i - 1].id, obj.id, "builds-on", 0.6, `${obj.title} extends this`);
      }
    }

    for (const obj of created) {
      this.relationships.autoConnect(obj);
    }

    return created;
  }

  findRelevantKnowledge(
    query: string,
    subjectId: string,
    limit: number = 5,
  ): KnowledgeObject[] {
    const all = this.store.getAll();
    const lower = query.toLowerCase();

    const scored = all
      .filter((o) => o.subjectId === subjectId || o.subjectId === "general-knowledge")
      .map((o) => {
        let score = 0;
        if (o.title.toLowerCase().includes(lower)) score += 10;
        if ((o.content.summary || "").toLowerCase().includes(lower)) score += 5;
        if ((o.content.definition || "").toLowerCase().includes(lower)) score += 3;
        if (o.tags.some((t) => t.toLowerCase().includes(lower))) score += 2;
        score += o.confidence * 3;
        return { object: o, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.object);
  }

  getKnowledgeContext(
    query: string,
    subjectId: string,
    maxObjects: number = 5,
  ): { objects: KnowledgeObject[]; summary: string } {
    const relevant = this.findRelevantKnowledge(query, subjectId, maxObjects);

    if (relevant.length === 0) {
      return { objects: [], summary: "No prior knowledge found for this topic." };
    }

    const parts = relevant.map(
      (o) => `- ${o.title} (${o.type}, confidence: ${Math.round(o.confidence * 100)}%)`,
    );

    return {
      objects: relevant,
      summary: `Prior knowledge available:\n${parts.join("\n")}`,
    };
  }

  linkResearchToProject(
    researchObjectId: string,
    projectObjectIds: string[],
  ): number {
    let count = 0;
    for (const projectId of projectObjectIds) {
      const added = this.factory.addRelationship(
        researchObjectId,
        projectId,
        "part-of",
        0.7,
        "Part of research project",
      );
      if (added) count++;
    }
    return count;
  }

  private extractTags(_query: string, subjectName: string): string[] {
    const tags = [subjectName.toLowerCase().replace(/\s+/g, "-")];
    return tags;
  }
}
