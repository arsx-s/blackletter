export { KnowledgeOS } from "./engine";
export { KnowledgeObjectStore } from "./objects/object-store";
export { KnowledgeObjectFactory } from "./objects/object-factory";
export { ObjectRelationshipEngine } from "./objects/object-relationships";
export { PersonalLibraryManager } from "./library/personal-library";
export { KnowledgeHealthTracker } from "./library/knowledge-health";
export { IntelligentSearch } from "./search/intelligent-search";
export { DynamicKnowledgeCards } from "./search/knowledge-cards";
export { ResearchMemory } from "./synchronization/research-memory";

export type {
  KnowledgeObject,
  KnowledgeObjectType,
  KnowledgeObjectContent,
  ObjectRelationship,
  RelationshipType,
  KnowledgeCollection,
  PersonalLibrary,
  KnowledgeHealth,
  KnowledgeCard,
  SearchResult,
  SearchQuery,
  TimelineEntry,
} from "./types";

export {
  KNOWLEDGE_OBJECT_TYPES,
  createPersonalLibrary,
  createKnowledgeObject,
  createDefaultContent,
} from "./types";
