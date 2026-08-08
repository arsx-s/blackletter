export type KnowledgeObjectType =
  | "concept"
  | "definition"
  | "formula"
  | "algorithm"
  | "case-law"
  | "principle"
  | "research-paper"
  | "citation"
  | "question"
  | "answer"
  | "diagram"
  | "timeline"
  | "code"
  | "dataset"
  | "project"
  | "insight"
  | "memory";

export const KNOWLEDGE_OBJECT_TYPES: KnowledgeObjectType[] = [
  "concept", "definition", "formula", "algorithm", "case-law",
  "principle", "research-paper", "citation", "question", "answer",
  "diagram", "timeline", "code", "dataset", "project", "insight", "memory",
];

export type RelationshipType =
  | "prerequisite"
  | "builds-on"
  | "related"
  | "application"
  | "opposite"
  | "alternative"
  | "part-of"
  | "example-of"
  | "used-in"
  | "derived-from"
  | "references"
  | "cross-discipline";

export interface ObjectRelationship {
  targetId: string;
  type: RelationshipType;
  strength: number;
  label: string;
}

export interface KnowledgeObject {
  id: string;
  type: KnowledgeObjectType;
  title: string;
  subjectId: string;
  subjectName: string;
  tags: string[];
  difficulty: number;
  sources: string[];
  confidence: number;
  relationships: ObjectRelationship[];
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  content: KnowledgeObjectContent;
}

export interface KnowledgeObjectContent {
  summary: string;
  definition?: string;
  longDescription?: string;
  examples?: string[];
  visualDescription?: string;
  applications?: string[];
  commonMistakes?: string[];
  prerequisiteIds?: string[];
  relatedTopicIds?: string[];
  challengeQuestion?: string;
  code?: string;
  formula?: string;
  timeline?: TimelineEntry[];
  citations?: string[];
  keyPoints?: string[];
  memoryTechnique?: string;
}

export interface TimelineEntry {
  date: string;
  event: string;
  description?: string;
}

export interface KnowledgeCollection {
  label: string;
  description: string;
  objectIds: string[];
  updatedAt: number;
}

export interface PersonalLibrary {
  recentlyLearned: KnowledgeCollection;
  mostUsed: KnowledgeCollection;
  frequentlyReferenced: KnowledgeCollection;
  currentlyStudying: KnowledgeCollection;
  bookmarked: KnowledgeCollection;
  mastered: KnowledgeCollection;
  needsRevision: KnowledgeCollection;
}

export function createPersonalLibrary(): PersonalLibrary {
  const now = Date.now();
  return {
    recentlyLearned: { label: "Recently Learned", description: "Concepts you have recently encountered", objectIds: [], updatedAt: now },
    mostUsed: { label: "Most Used", description: "Frequently accessed knowledge", objectIds: [], updatedAt: now },
    frequentlyReferenced: { label: "Frequently Referenced", description: "Knowledge referenced across multiple contexts", objectIds: [], updatedAt: now },
    currentlyStudying: { label: "Currently Studying", description: "Active learning topics", objectIds: [], updatedAt: now },
    bookmarked: { label: "Bookmarked", description: "Saved for later", objectIds: [], updatedAt: now },
    mastered: { label: "Mastered", description: "Concepts with high confidence", objectIds: [], updatedAt: now },
    needsRevision: { label: "Needs Revision", description: "Concepts that may need review", objectIds: [], updatedAt: now },
  };
}

export interface KnowledgeHealth {
  topicsExplored: number;
  knowledgeDiversity: number;
  connectionsDiscovered: number;
  totalRelationships: number;
  areasNeedingRevision: string[];
  researchDepth: number;
  learningConsistency: number;
  totalObjects: number;
  byType: Partial<Record<KnowledgeObjectType, number>>;
  bySubject: Record<string, number>;
  strengthBySubject: Record<string, number>;
  knowledgeGraphSize: number;
}

export interface KnowledgeCard {
  objectId: string;
  title: string;
  type: KnowledgeObjectType;
  subjectName: string;
  difficulty: number;
  confidence: number;
  definition: string;
  summary: string;
  examples: string[];
  visualDescription: string;
  applications: string[];
  commonMistakes: string[];
  prerequisites: { id: string; label: string; relationship: string }[];
  relatedTopics: { id: string; label: string; relationship: string }[];
  sources: string[];
  challengeQuestion: string;
  memoryTechnique: string;
  tags: string[];
  updatedAt: number;
}

export interface SearchResult {
  object: KnowledgeObject;
  score: number;
  matchedField: string;
  matchContext: string;
}

export interface SearchQuery {
  text: string;
  types?: KnowledgeObjectType[];
  subjects?: string[];
  tags?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
  confidenceMin?: number;
  sortBy?: "relevance" | "freshness" | "confidence" | "access-count";
  limit?: number;
  offset?: number;
}

export function createDefaultContent(): KnowledgeObjectContent {
  return {
    summary: "",
    definition: "",
    examples: [],
    applications: [],
    commonMistakes: [],
    prerequisiteIds: [],
    relatedTopicIds: [],
  };
}

export function createKnowledgeObject(
  id: string,
  type: KnowledgeObjectType,
  title: string,
  subjectId: string,
  subjectName: string,
): KnowledgeObject {
  return {
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
    content: createDefaultContent(),
  };
}
