export type KnowledgeNodeType =
  | "concept"
  | "definition"
  | "topic"
  | "subtopic"
  | "person"
  | "organization"
  | "case"
  | "law"
  | "technology"
  | "language"
  | "library"
  | "document"
  | "session"
  | "citation"
  | "formula"
  | "question"
  | "answer"
  | "skill"
  | "event"
  | "location";

export type KnowledgeEdgeType =
  | "contains"
  | "depends-on"
  | "requires"
  | "related-to"
  | "part-of"
  | "references"
  | "mentions"
  | "defines"
  | "cites"
  | "causes"
  | "contrasts-with"
  | "example-of"
  | "prerequisite-of";

export type KnowledgeDifficulty = "beginner" | "intermediate" | "advanced";

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  aliases: string[];
  description: string;
  definition: string;
  summary: string;
  example: string;
  difficulty: KnowledgeDifficulty;
  strength: number;
  occurrences: number;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  pinned: boolean;
  favorite: boolean;
  color: string;
  group: string;
  aiGenerated: boolean;
  manual: boolean;
  sourceTabIds: string[];
  sourceDocumentIds: string[];
  sourceNoteIds: string[];
  sources: string[];
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeEdgeType;
  weight: number;
  occurrences: number;
  createdAt: number;
  lastSeenAt: number;
  sourceTabIds: string[];
  sourceDocumentIds: string[];
}

export interface KnowledgeGraphData {
  version: number;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface KnowledgeNodeInput {
  type: KnowledgeNodeType;
  label: string;
  aliases?: string[];
  description?: string;
  definition?: string;
  summary?: string;
  example?: string;
  difficulty?: KnowledgeDifficulty;
  color?: string;
  group?: string;
  aiGenerated?: boolean;
  manual?: boolean;
  tabId?: string;
  documentId?: string;
  noteId?: string;
  sources?: string[];
  now?: number;
}

export interface KnowledgeDerivation {
  nodes: KnowledgeNodeInput[];
  edges: Array<{ source: string; target: string; type: KnowledgeEdgeType }>;
}

export interface KnowledgeStats {
  nodeCount: number;
  edgeCount: number;
  typeCounts: Record<string, number>;
  edgeTypeCounts: Record<string, number>;
  knownCount: number;
  unknownCount: number;
  weakCount: number;
  strongCount: number;
  pinnedCount: number;
  favoriteCount: number;
  aiGeneratedCount: number;
  manualCount: number;
}

export interface NodeRank {
  nodeId: string;
  label: string;
  degree: number;
  strength: number;
}

export const KNOWLEDGE_EDGE_LABELS: Record<KnowledgeEdgeType, string> = {
  contains: "contains",
  "depends-on": "depends on",
  requires: "requires",
  "related-to": "related to",
  "part-of": "part of",
  references: "references",
  mentions: "mentions",
  defines: "defines",
  cites: "cites",
  causes: "causes",
  "contrasts-with": "contrasts with",
  "example-of": "example of",
  "prerequisite-of": "prerequisite of",
};

export const KNOWLEDGE_NODE_LABELS: Record<KnowledgeNodeType, string> = {
  concept: "Concept",
  definition: "Definition",
  topic: "Topic",
  subtopic: "Subtopic",
  person: "Person",
  organization: "Organization",
  case: "Case",
  law: "Law",
  document: "Document",
  session: "Research Session",
  citation: "Citation",
  formula: "Formula",
  question: "Question",
  answer: "Answer",
  skill: "Skill",
  event: "Event",
  location: "Location",
  language: "Language",
  library: "Library",
  technology: "Technology",
};

export const KNOWLEDGE_FILTER_GROUPS = [
  "concept",
  "definition",
  "topic",
  "subtopic",
  "person",
  "organization",
  "case",
  "law",
  "technology",
  "document",
  "session",
  "citation",
  "question",
  "formula",
  "skill",
  "event",
] as const;