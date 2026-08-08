import type { TeachingModeId } from "../teaching/types";

export type Tier =
  | "foundation"
  | "core"
  | "intermediate"
  | "advanced"
  | "expert"
  | "application"
  | "research"
  | "future";

export const TIER_ORDER: Tier[] = [
  "foundation",
  "core",
  "intermediate",
  "advanced",
  "expert",
  "application",
  "research",
  "future",
];

export const TIER_LABELS: Record<Tier, string> = {
  foundation: "Foundations",
  core: "Core Concepts",
  intermediate: "Intermediate Ideas",
  advanced: "Advanced Topics",
  expert: "Expert Topics",
  application: "Applications",
  research: "Research",
  future: "Future Trends",
};

export type EdgeRelationship =
  | "prerequisite"
  | "builds-on"
  | "related"
  | "application-of"
  | "alternative-to"
  | "extension-of"
  | "cross-discipline"
  | "examples"
  | "part-of";

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  subjectId: string;
  tier: Tier;
  keywords: string[];
  estimatedMinutes: number;
  confidence: number;
}

export interface ConceptEdge {
  sourceId: string;
  targetId: string;
  relationship: EdgeRelationship;
  strength: number;
  description?: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, ConceptNode>;
  edges: ConceptEdge[];
  subjectId: string;
  topicLabel: string;
  createdAt: number;
  updatedAt: number;
}

export interface TierGroup {
  tier: Tier;
  label: string;
  concepts: ConceptNode[];
}

export interface LearningPath {
  topic: string;
  subjectId: string;
  subjectName: string;
  tiers: TierGroup[];
  dependencies: ConceptEdge[];
  estimatedTotalMinutes: number;
  createdAt: number;
}

export interface LearningEvent {
  query: string;
  timestamp: number;
  conceptIds: string[];
  tier: Tier;
  subjectId: string;
  modeId: TeachingModeId;
}

export interface ProgressionState {
  conceptId: string;
  status: "encountered" | "explored" | "understood" | "mastered";
  timesEncountered: number;
  lastEncountered: number;
  notes: string[];
}

export interface PrerequisiteInfo {
  conceptId: string;
  conceptLabel: string;
  tier: Tier;
  isCovered: boolean;
  estimatedMinutes: number;
  briefExplanation: string;
}

export interface SmartContinuation {
  label: string;
  description: string;
  action: ContinuationAction;
  icon: string;
}

export interface ContinuationAction {
  type: "teach" | "switch-mode" | "explore" | "practice" | "visual" | "connection";
  payload: {
    modeId?: TeachingModeId;
    query?: string;
    conceptId?: string;
    tier?: Tier;
    subjectId?: string;
  };
}

export interface Microlesson {
  title: string;
  conceptId: string;
  conceptLabel: string;
  tier: Tier;
  estimatedMinutes: number;
  keyPoint: string;
  prerequisiteConcepts: string[];
  continuationConcepts: string[];
  teachingModeId: TeachingModeId;
}

export interface DisciplineConnection {
  sourceSubjectId: string;
  sourceConcept: string;
  targetSubjectId: string;
  targetConcept: string;
  relationship: string;
  description: string;
  strength: number;
}

export interface ArchitectResponse {
  query: string;
  modeId: TeachingModeId;
  subjectName: string;
  subjectId: string;
  fullText: string;
  tier: Tier;
  detectedConcepts: ConceptNode[];
  prerequisites: PrerequisiteInfo[];
  learningPath: LearningPath | null;
  continuations: SmartContinuation[];
  microlesson: Microlesson | null;
  crossDisciplineConnections: DisciplineConnection[];
  progress: ProgressionState[];
}

export interface ArchitectConfig {
  sessionId?: string;
  modeId: TeachingModeId;
  onChunk?: (chunk: string) => void;
}
