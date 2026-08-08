import type { KnowledgeObject, KnowledgeObjectType } from "../types";
import { KnowledgeObjectStore } from "./object-store";

export class KnowledgeObjectFactory {
  private store: KnowledgeObjectStore;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
  }

  createFromQuery(
    query: string,
    response: string,
    subjectId: string,
    subjectName: string,
    tags: string[] = [],
  ): KnowledgeObject {
    return this.store.create("question", query, subjectId, subjectName, {
      tags,
      difficulty: 2,
      confidence: 0.6,
      content: {
        summary: response.slice(0, 300),
        definition: this.extractDefinition(response),
        keyPoints: this.extractKeyPoints(response),
        longDescription: response.slice(0, 1000),
      },
    });
  }

  createFromConcept(
    label: string,
    description: string,
    subjectId: string,
    subjectName: string,
    difficulty: number = 3,
    tags: string[] = [],
  ): KnowledgeObject {
    const existing = this.store.searchByTitle(label);
    if (existing.length > 0) {
      const match = existing[0];
      return this.store.update(match.id, {
        accessCount: match.accessCount + 1,
        updatedAt: Date.now(),
        confidence: Math.min(1, match.confidence + 0.05),
      })!;
    }

    return this.store.create("concept", label, subjectId, subjectName, {
      tags: [subjectId, ...tags],
      difficulty,
      confidence: 0.5,
      content: {
        summary: description,
        definition: description,
        keyPoints: [description],
      },
    });
  }

  createFromDocument(
    fileName: string,
    content: string,
    subjectId: string,
    subjectName: string,
    concepts: string[] = [],
  ): KnowledgeObject {
    return this.store.create("research-paper", fileName, subjectId, subjectName, {
      tags: [subjectId, ...concepts.slice(0, 5)],
      difficulty: 3,
      confidence: 0.6,
      sources: [fileName],
      content: {
        summary: content.slice(0, 300),
        definition: this.extractDefinition(content),
        keyPoints: this.extractKeyPoints(content),
        citations: [fileName],
      },
    });
  }

  createFromInsight(
    title: string,
    description: string,
    subjectId: string,
    subjectName: string,
    relatedIds: string[] = [],
  ): KnowledgeObject {
    return this.store.create("insight", title, subjectId, subjectName, {
      tags: [subjectId, "insight"],
      difficulty: 3,
      confidence: 0.7,
      content: {
        summary: description,
        longDescription: description,
        relatedTopicIds: relatedIds,
      },
    });
  }

  createFromDefinition(
    term: string,
    definition: string,
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject {
    return this.store.create("definition", term, subjectId, subjectName, {
      tags: [subjectId, "definition"],
      difficulty: 2,
      confidence: 0.8,
      content: {
        summary: definition,
        definition,
      },
    });
  }

  createFromCode(
    title: string,
    code: string,
    description: string,
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject {
    return this.store.create("code", title, subjectId, subjectName, {
      tags: [subjectId, "code"],
      difficulty: 3,
      confidence: 0.6,
      content: {
        summary: description,
        code,
        examples: [code],
      },
    });
  }

  createFromFormula(
    title: string,
    formula: string,
    description: string,
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject {
    return this.store.create("formula", title, subjectId, subjectName, {
      tags: [subjectId, "formula"],
      difficulty: 4,
      confidence: 0.7,
      content: {
        summary: description,
        formula,
        definition: description,
      },
    });
  }

  createFromAlgorithm(
    title: string,
    description: string,
    steps: string[],
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject {
    return this.store.create("algorithm", title, subjectId, subjectName, {
      tags: [subjectId, "algorithm"],
      difficulty: 4,
      confidence: 0.6,
      content: {
        summary: description,
        definition: description,
        keyPoints: steps,
        examples: steps,
      },
    });
  }

  createFromMemory(
    title: string,
    technique: string,
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject {
    return this.store.create("memory", title, subjectId, subjectName, {
      tags: [subjectId, "memory"],
      difficulty: 1,
      confidence: 0.5,
      content: {
        summary: technique,
        memoryTechnique: technique,
      },
    });
  }

  updateConfidence(objectId: string, delta: number): KnowledgeObject | null {
    const obj = this.store.get(objectId);
    if (!obj) return null;
    return this.store.update(objectId, {
      confidence: Math.max(0, Math.min(1, obj.confidence + delta)),
    });
  }

  addRelationship(
    objectId: string,
    targetId: string,
    type: import("../types").RelationshipType,
    strength: number = 0.5,
    label: string = "",
  ): boolean {
    const obj = this.store.get(objectId);
    if (!obj) return false;

    const exists = obj.relationships.some((r) => r.targetId === targetId);
    if (exists) return false;

    obj.relationships.push({ targetId, type, strength, label: label || type.replace("-", " ") });
    this.store.update(objectId, { relationships: obj.relationships });
    return true;
  }

  private extractDefinition(text: string): string {
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
    const defSentences = sentences.filter(
      (s) =>
        s.toLowerCase().includes("is a") ||
        s.toLowerCase().includes("refers to") ||
        s.toLowerCase().includes("defined as") ||
        s.toLowerCase().includes("is the") ||
        s.toLowerCase().includes("are the"),
    );
    return defSentences[0] ?? sentences[0] ?? text.slice(0, 200);
  }

  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
    return sentences.filter(
      (s) =>
        s.toLowerCase().includes("key") ||
        s.toLowerCase().includes("important") ||
        s.toLowerCase().includes("essential") ||
        s.toLowerCase().includes("fundamental") ||
        s.toLowerCase().includes("critical"),
    ).slice(0, 5);
  }
}
