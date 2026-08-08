export { LearningArchitect } from "./architect";
export { KnowledgeGraph } from "./graph/knowledge-graph";
export { SessionStore } from "./graph/session-store";
export { LearningPathEngine } from "./path/learning-path";
export { TopicBreakdownEngine } from "./path/topic-breakdown";
export { PrerequisiteDetector } from "./path/prerequisite-detector";
export { ProgressionTracker } from "./progression/progression-tracker";
export { SmartContinuationGenerator } from "./progression/smart-continuations";
export { MultiDisciplineConnector } from "./connections/discipline-connector";
export { MicrolessonGenerator } from "./connections/microlesson";

export type {
  ConceptNode,
  ConceptEdge,
  KnowledgeGraph as KnowledgeGraphType,
  LearningPath,
  TierGroup,
  Tier,
  LearningEvent,
  ProgressionState,
  PrerequisiteInfo,
  SmartContinuation,
  ContinuationAction,
  Microlesson,
  DisciplineConnection,
  ArchitectResponse,
  ArchitectConfig,
  EdgeRelationship,
} from "./types";

export { TIER_ORDER, TIER_LABELS } from "./types";
