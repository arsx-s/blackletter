export type AgentId =
  | "planning"
  | "research"
  | "critical-thinking"
  | "fact-verification"
  | "teacher"
  | "writing"
  | "summarization"
  | "citation"
  | "knowledge-graph"
  | "report-generation";

export type AgentStatus = "idle" | "running" | "success" | "error";

export type QueryComplexity = "simple" | "moderate" | "complex" | "research";

export type AgentCapability =
  | "planning"
  | "research"
  | "critical-analysis"
  | "fact-checking"
  | "teaching"
  | "writing"
  | "summarization"
  | "citation"
  | "knowledge-graph"
  | "report-generation";

export interface AgentActivity {
  agentId: AgentId;
  agentName: string;
  status: AgentStatus;
  startedAt: number;
  completedAt?: number;
  summary?: string;
}

export interface AgentContext {
  query: string;
  subjectId?: string;
  subjectName?: string;
  subjectProfile?: {
    coreBelief: string;
    explanationOrder: string[];
    importantTerminology: string[];
    commonMisconceptions: string[];
    visualStrategy: string;
    practiceStrategy: string;
    responseStructure: string[];
  };
  conversationHistory?: { role: string; content: string }[];
  documentText?: string;

  researchFindings?: string;
  keyConcepts?: string[];
  terminology?: string[];
  researchContext?: string;
  researchDirection?: string;

  explanation?: string;
  analogies?: string[];
  examples?: string[];
  learningProgression?: string;

  assumptions?: string[];
  weaknesses?: string[];
  alternativeViewpoints?: string[];
  biases?: string[];
  missingEvidence?: string[];
  counterarguments?: string[];

  factCheckPassed?: boolean;
  unsupportedClaims?: string[];
  contradictions?: string[];
  hallucinationRisks?: string[];
  confidenceScore?: number;
  sourceQuality?: string;

  plan?: string;
  researchQuestions?: string[];
  methodology?: string;

  summary?: string;
  summaryBullets?: string[];

  citations?: string[];
  citationStyle?: string;

  graphUpdates?: GraphUpdate[];

  report?: string;
  reportType?: "academic" | "technical" | "executive" | "general";

  finalResponse?: string;

  reExplanation?: string;
  teachingMode?: string;
  difficulty?: string;
  isJourneyQuery?: boolean;
  journeyTopic?: string;
  socraticMode?: boolean;

  learnerPreferences?: {
    style: string;
    depth: number;
    pacing: string;
    analogies: boolean;
    examples: number;
  };

  activityLog: AgentActivity[];
  transparency: boolean;
}

export interface GraphUpdate {
  action: "create-concept" | "create-relationship" | "update-confidence";
  conceptName?: string;
  relationshipType?: string;
  sourceId?: string;
  targetId?: string;
  confidence?: number;
  label?: string;
}

export interface AgentResult {
  agentId: AgentId;
  success: boolean;
  contextUpdates: Partial<AgentContext>;
  activity: AgentActivity;
  error?: string;
}

export interface OrchestratorResult {
  finalResponse: string;
  activityLog: AgentActivity[];
  complexity: QueryComplexity;
  agentCount: number;
  successfulAgents: number;
  failedAgents: number;
  processingTimeMs: number;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  requiredContext?: (keyof AgentContext)[];
  producedContext?: (keyof AgentContext)[];
}
