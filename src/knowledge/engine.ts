import { KnowledgeObjectStore } from "./objects/object-store";
import { KnowledgeObjectFactory } from "./objects/object-factory";
import { ObjectRelationshipEngine } from "./objects/object-relationships";
import { PersonalLibraryManager } from "./library/personal-library";
import { KnowledgeHealthTracker } from "./library/knowledge-health";
import { IntelligentSearch } from "./search/intelligent-search";
import { DynamicKnowledgeCards } from "./search/knowledge-cards";
import { ResearchMemory } from "./synchronization/research-memory";
import type {
  KnowledgeObject,
  KnowledgeObjectType,
  KnowledgeCard,
  SearchQuery,
  SearchResult,
  KnowledgeHealth,
  PersonalLibrary,
} from "./types";

export class KnowledgeOS {
  private store: KnowledgeObjectStore;
  private factory: KnowledgeObjectFactory;
  private relationships: ObjectRelationshipEngine;
  private library: PersonalLibraryManager;
  private health: KnowledgeHealthTracker;
  private search: IntelligentSearch;
  private cards: DynamicKnowledgeCards;
  private memory: ResearchMemory;

  constructor() {
    this.store = new KnowledgeObjectStore();
    this.factory = new KnowledgeObjectFactory(this.store);
    this.relationships = new ObjectRelationshipEngine(this.store);
    this.library = new PersonalLibraryManager(this.store);
    this.health = new KnowledgeHealthTracker(this.store);
    this.search = new IntelligentSearch(this.store);
    this.cards = new DynamicKnowledgeCards(this.store);
    this.memory = new ResearchMemory(this.store, this.relationships, this.factory);
  }

  createObject(
    type: KnowledgeObjectType,
    title: string,
    subjectId: string,
    subjectName: string,
    overrides?: Partial<KnowledgeObject>,
  ): KnowledgeObject {
    const obj = this.store.create(type, title, subjectId, subjectName, overrides);
    this.relationships.autoConnect(obj);
    this.relationships.connectBySubject(obj);
    this.library.refresh(obj.id);
    return obj;
  }

  getObject(id: string): KnowledgeObject | null {
    const obj = this.store.get(id);
    if (obj) this.library.refresh(id);
    return obj;
  }

  updateObject(id: string, updates: Partial<KnowledgeObject>): KnowledgeObject | null {
    const updated = this.store.update(id, updates);
    if (updated) this.library.refresh(id);
    return updated;
  }

  deleteObject(id: string): boolean {
    const deleted = this.store.delete(id);
    if (deleted) this.library.refresh();
    return deleted;
  }

  getCard(objectId: string): KnowledgeCard | null {
    return this.cards.generateCard(objectId);
  }

  searchKnowledge(query: SearchQuery): SearchResult[] {
    return this.search.search(query);
  }

  quickSearch(text: string, limit?: number): SearchResult[] {
    return this.search.quickSearch(text, limit);
  }

  getLibrary(): PersonalLibrary {
    this.library.refresh();
    return this.library.getLibrary();
  }

  toggleBookmark(objectId: string): boolean {
    return this.library.toggleBookmark(objectId);
  }

  isBookmarked(objectId: string): boolean {
    return this.library.isBookmarked(objectId);
  }

  getHealth(): KnowledgeHealth {
    return this.health.calculate();
  }

  getGraphData(): { nodes: { id: string; label: string; type: string; subject: string }[]; edges: { source: string; target: string; type: string; strength: number }[] } {
    return this.relationships.getGraphData();
  }

  findPath(sourceId: string, targetId: string): string[] | null {
    return this.relationships.findPath(sourceId, targetId);
  }

  // Research memory integration
  rememberQuery(
    query: string,
    response: string,
    subjectId: string,
    subjectName: string,
    relatedIds?: string[],
  ): KnowledgeObject {
    const obj = this.memory.rememberQuery(query, response, subjectId, subjectName, relatedIds);
    this.library.refresh(obj.id);
    return obj;
  }

  rememberConcepts(
    concepts: { label: string; description: string; difficulty: number }[],
    subjectId: string,
    subjectName: string,
  ): KnowledgeObject[] {
    const created = this.memory.rememberConcepts(concepts, subjectId, subjectName);
    for (const obj of created) this.library.refresh(obj.id);
    return created;
  }

  getRelevantKnowledge(query: string, subjectId: string, limit?: number): KnowledgeObject[] {
    return this.memory.findRelevantKnowledge(query, subjectId, limit);
  }

  getKnowledgeContext(query: string, subjectId: string, maxObjects?: number) {
    return this.memory.getKnowledgeContext(query, subjectId, maxObjects);
  }

  // Direct access to sub-systems
  getStore(): KnowledgeObjectStore {
    return this.store;
  }

  getFactory(): KnowledgeObjectFactory {
    return this.factory;
  }

  getRelationshipEngine(): ObjectRelationshipEngine {
    return this.relationships;
  }

  getLibraryManager(): PersonalLibraryManager {
    return this.library;
  }

  getHealthTracker(): KnowledgeHealthTracker {
    return this.health;
  }

  getSearch(): IntelligentSearch {
    return this.search;
  }

  getCards(): DynamicKnowledgeCards {
    return this.cards;
  }

  getResearchMemory(): ResearchMemory {
    return this.memory;
  }

  // Maintenance
  reindexAll(): number {
    const all = this.store.getAll();
    for (const obj of all) {
      this.relationships.autoConnect(obj);
    }
    this.library.refresh();
    return all.length;
  }

  exportAll(): string {
    return this.store.exportAll();
  }

  importAll(json: string): number {
    const count = this.store.importAll(json);
    if (count > 0) {
      this.reindexAll();
    }
    return count;
  }

  clearAll(): void {
    this.store.clear();
    this.library.refresh();
  }
}
