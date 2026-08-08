import type { KnowledgeObject, KnowledgeObjectType } from "../types";
import { KNOWLEDGE_OBJECT_TYPES } from "../types";

const STORAGE_PREFIX = "bl_kos_";
const INDEX_KEY = "bl_kos_index";

let idCounter = 0;

function genId(type: KnowledgeObjectType): string {
  idCounter++;
  return `${type}_${Date.now()}_${idCounter}`;
}

interface ObjectIndex {
  ids: string[];
  updatedAt: number;
}

export class KnowledgeObjectStore {
  private objects = new Map<string, KnowledgeObject>();
  private index: ObjectIndex = { ids: [], updatedAt: Date.now() };

  constructor() {
    this.loadIndex();
  }

  private storageKey(id: string): string {
    return `${STORAGE_PREFIX}${id}`;
  }

  private loadIndex(): void {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (raw) {
        this.index = JSON.parse(raw);
        for (const id of this.index.ids) {
          const rawObj = localStorage.getItem(this.storageKey(id));
          if (rawObj) {
            this.objects.set(id, JSON.parse(rawObj));
          }
        }
      }
    } catch {}
  }

  private saveIndex(): void {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(this.index));
    } catch { console.warn("[ObjectStore] Operation failed"); }
  }

  private saveObject(id: string): void {
    const obj = this.objects.get(id);
    if (obj) {
      try {
        localStorage.setItem(this.storageKey(id), JSON.stringify(obj));
      } catch { console.warn("[ObjectStore] Operation failed"); }
    }
  }

  create(
    type: KnowledgeObjectType,
    title: string,
    subjectId: string,
    subjectName: string,
    overrides?: Partial<KnowledgeObject>,
  ): KnowledgeObject {
    const id = genId(type);
    const { id: _ignored, ...safeOverrides } = overrides ?? {};

    const obj: KnowledgeObject = {
      id,
      type,
      title,
      subjectId,
      subjectName,
      tags: [],
      difficulty: 3,
      sources: [],
      confidence: 0.5,
      relationships: [],
      accessCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      content: {
        summary: "",
        definition: "",
        examples: [],
        applications: [],
        commonMistakes: [],
        prerequisiteIds: [],
        relatedTopicIds: [],
      },
      ...safeOverrides,
    };

    this.objects.set(id, obj);
    this.index.ids.push(id);
    this.index.updatedAt = Date.now();
    this.saveObject(id);
    this.saveIndex();
    return obj;
  }

  get(id: string): KnowledgeObject | null {
    const obj = this.objects.get(id) ?? null;
    if (obj) {
      obj.accessCount++;
      this.saveObject(id);
    }
    return obj;
  }

  update(id: string, updates: Partial<KnowledgeObject>): KnowledgeObject | null {
    const obj = this.objects.get(id);
    if (!obj) return null;
    Object.assign(obj, updates, { updatedAt: Date.now() });
    this.saveObject(id);
    return obj;
  }

  delete(id: string): boolean {
    const existed = this.objects.delete(id);
    if (existed) {
      this.index.ids = this.index.ids.filter((i) => i !== id);
      this.index.updatedAt = Date.now();
      try { localStorage.removeItem(this.storageKey(id)); } catch { console.warn("[ObjectStore] Operation failed"); }
      this.saveIndex();
    }
    return existed;
  }

  getAll(): KnowledgeObject[] {
    return Array.from(this.objects.values());
  }

  getByType(type: KnowledgeObjectType): KnowledgeObject[] {
    return this.getAll().filter((o) => o.type === type);
  }

  getBySubject(subjectId: string): KnowledgeObject[] {
    return this.getAll().filter((o) => o.subjectId === subjectId);
  }

  getByTag(tag: string): KnowledgeObject[] {
    const lower = tag.toLowerCase();
    return this.getAll().filter((o) => o.tags.some((t) => t.toLowerCase() === lower));
  }

  getRecent(limit: number = 20): KnowledgeObject[] {
    return this.getAll()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getMostAccessed(limit: number = 20): KnowledgeObject[] {
    return this.getAll()
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  getNeedsRevision(minConfidence: number = 0.4, maxAccess: number = 3): KnowledgeObject[] {
    return this.getAll().filter(
      (o) => o.confidence <= minConfidence || (o.accessCount <= maxAccess && Date.now() - o.createdAt > 7 * 86_400_000),
    );
  }

  getMastered(minConfidence: number = 0.8): KnowledgeObject[] {
    return this.getAll().filter((o) => o.confidence >= minConfidence);
  }

  count(): number {
    return this.objects.size;
  }

  countByType(): Partial<Record<KnowledgeObjectType, number>> {
    const counts: Partial<Record<KnowledgeObjectType, number>> = {};
    for (const obj of this.objects.values()) {
      counts[obj.type] = (counts[obj.type] ?? 0) + 1;
    }
    return counts;
  }

  countBySubject(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const obj of this.objects.values()) {
      counts[obj.subjectId] = (counts[obj.subjectId] ?? 0) + 1;
    }
    return counts;
  }

  searchByTitle(query: string): KnowledgeObject[] {
    const lower = query.toLowerCase();
    return this.getAll().filter((o) => o.title.toLowerCase().includes(lower));
  }

  getGraphSize(): number {
    return this.getAll().reduce((sum, o) => sum + o.relationships.length, 0);
  }

  clear(): void {
    const ids = Array.from(this.objects.keys());
    for (const id of ids) {
      try { localStorage.removeItem(this.storageKey(id)); } catch { console.warn("[ObjectStore] Operation failed"); }
    }
    this.objects.clear();
    this.index = { ids: [], updatedAt: Date.now() };
    this.saveIndex();
  }

  exportAll(): string {
    return JSON.stringify(this.getAll());
  }

  importAll(json: string): number {
    try {
      const objects = JSON.parse(json) as KnowledgeObject[];
      for (const obj of objects) {
        this.objects.set(obj.id, obj);
        if (!this.index.ids.includes(obj.id)) {
          this.index.ids.push(obj.id);
        }
        this.saveObject(obj.id);
      }
      this.index.updatedAt = Date.now();
      this.saveIndex();
      return objects.length;
    } catch {
      return 0;
    }
  }
}
