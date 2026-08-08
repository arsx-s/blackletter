export type UserIntent =
  | "learn"
  | "revise"
  | "summarize"
  | "research"
  | "exam-prep"
  | "interview-prep"
  | "solve-assignment"
  | "understand-concept"
  | "practice"
  | "roadmap"
  | "flashcards"
  | "explain-mistakes"
  | "compare"
  | "analyze"
  | "create"
  | "debate"
  | "review"
  | "plan"
  | "general";

export type SubjectId =
  | "computer-science"
  | "software-engineering"
  | "artificial-intelligence"
  | "machine-learning"
  | "cybersecurity"
  | "law"
  | "business"
  | "finance"
  | "economics"
  | "accounting"
  | "engineering"
  | "physics"
  | "chemistry"
  | "biology"
  | "mathematics"
  | "medicine"
  | "psychology"
  | "political-science"
  | "history"
  | "marketing"
  | "statistics"
  | "general";

export type OutputFormat =
  | "lesson"
  | "research-report"
  | "mind-map"
  | "timeline"
  | "comparison-table"
  | "case-analysis"
  | "legal-irac"
  | "business-swot"
  | "flowchart-description"
  | "algorithm-walkthrough"
  | "project-guide"
  | "notebook"
  | "revision-notes"
  | "flashcards"
  | "quiz"
  | "exam-guide"
  | "plain-text";

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  subIntent?: string;
}

export interface SubjectResult {
  subject: SubjectId;
  subjectName: string;
  confidence: number;
  allScores: Record<string, number>;
}

export interface KnowledgeGap {
  concept: string;
  description: string;
  isMissing: boolean;
}

export interface QualityScore {
  overall: number;
  correctness: number;
  completeness: number;
  readability: number;
  structure: number;
  logicalFlow: number;
  examples: number;
  formatting: number;
  issues: string[];
  passed: boolean;
}

export interface OutputFormatResult {
  format: OutputFormat;
  formatLabel: string;
  formattingRules: string;
}

export interface TeachingProfile {
  subject: SubjectId;
  subjectName: string;
  intent: UserIntent;
  difficulty: "elementary" | "high-school" | "undergraduate" | "graduate" | "professional" | "research";
  outputFormat: OutputFormat;
  teachingMode: "visual" | "story" | "analogy" | "technical" | "beginner" | "exam" | "interview" | "research";
  prerequisites: KnowledgeGap[];
  qualityThreshold: number;
}

export interface PromptComponents {
  subjectContext: string;
  difficultyDirective: string;
  learningProfile: string;
  teachingStrategy: string;
  outputFormatDirective: string;
  formattingRules: string;
  qualityRules: string;
  documentContext: string;
  conversationMemory: string;
  knowledgeGaps: string;
}

export interface DevModeState {
  enabled: boolean;
  lastIntent: IntentResult | null;
  lastSubject: SubjectResult | null;
  lastProfile: TeachingProfile | null;
  lastPromptComponents: PromptComponents | null;
  lastQualityScore: QualityScore | null;
  pipelineTimeMs: number;
  apiLatencyMs: number;
  totalMemoryUsage: number;
  history: DevModeEntry[];
}

export interface DevModeEntry {
  timestamp: number;
  query: string;
  intent: IntentResult;
  subject: SubjectResult;
  profile: TeachingProfile;
  qualityScore: QualityScore;
  pipelineTimeMs: number;
  apiLatencyMs: number;
}

export interface BIOContext {
  query?: string;
  documentText?: string;
  conversationHistory?: { role: string; content: string }[];
  intent?: IntentResult;
  subject?: SubjectResult;
  profile?: TeachingProfile;
  promptComponents?: PromptComponents;
  qualityScore?: QualityScore;
  outputFormat?: OutputFormatResult;
  prerequisites?: KnowledgeGap[];
  devMode?: DevModeState;
  reExplanation?: string;
  learnerPreferences?: {
    style: string;
    depth: number;
    pacing: string;
    analogies: boolean;
    examples: number;
  };
  isJourneyQuery?: boolean;
  journeyTopic?: string;
  socraticMode?: boolean;
}

export interface BIOResult {
  finalResponse: string;
  intent: IntentResult;
  subject: SubjectResult;
  profile: TeachingProfile;
  qualityScore: QualityScore;
  outputFormat: OutputFormatResult;
  pipelineTimeMs: number;
  apiLatencyMs: number;
  wasRegenerated: boolean;
}

export const INTENT_LABELS: Record<UserIntent, string> = {
  learn: "Learn New Topic",
  revise: "Revise Known Topic",
  summarize: "Summarize Content",
  research: "Research Topic",
  "exam-prep": "Exam Preparation",
  "interview-prep": "Interview Preparation",
  "solve-assignment": "Solve Assignment",
  "understand-concept": "Understand Concept",
  practice: "Practice Questions",
  roadmap: "Create Roadmap",
  flashcards: "Generate Flashcards",
  "explain-mistakes": "Explain Mistakes",
  compare: "Compare Concepts",
  analyze: "Analyze Topic",
  create: "Create Content",
  debate: "Debate Topic",
  review: "Review Content",
  plan: "Plan Project",
  general: "General Query",
};

export const SUBJECT_LABELS: Record<SubjectId, string> = {
  "computer-science": "Computer Science",
  "software-engineering": "Software Engineering",
  "artificial-intelligence": "Artificial Intelligence",
  "machine-learning": "Machine Learning",
  cybersecurity: "Cybersecurity",
  law: "Law",
  business: "Business",
  finance: "Finance",
  economics: "Economics",
  accounting: "Accounting",
  engineering: "Engineering",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  mathematics: "Mathematics",
  medicine: "Medicine",
  psychology: "Psychology",
  "political-science": "Political Science",
  history: "History",
  marketing: "Marketing",
  statistics: "Statistics",
  general: "General",
};

export const OUTPUT_LABELS: Record<OutputFormat, string> = {
  lesson: "Structured Lesson",
  "research-report": "Research Report",
  "mind-map": "Mind Map",
  timeline: "Timeline",
  "comparison-table": "Comparison Table",
  "case-analysis": "Case Analysis",
  "legal-irac": "Legal IRAC Analysis",
  "business-swot": "Business SWOT Analysis",
  "flowchart-description": "Flowchart Description",
  "algorithm-walkthrough": "Algorithm Walkthrough",
  "project-guide": "Project Guide",
  notebook: "Notebook Entry",
  "revision-notes": "Revision Notes",
  flashcards: "Flashcards",
  quiz: "Quiz",
  "exam-guide": "Exam Guide",
  "plain-text": "Plain Text",
};
