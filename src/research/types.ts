import type { TeachingModeId } from "../teaching/types";
import type { KnowledgeGraph } from "../architect/graph/knowledge-graph";

export type SourceType =
  | "academic-paper"
  | "government-source"
  | "textbook"
  | "research-organization"
  | "news"
  | "legal-authority"
  | "technical-documentation"
  | "company-documentation"
  | "lecture-notes"
  | "book"
  | "article"
  | "other";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  "academic-paper": "Academic Paper",
  "government-source": "Government Source",
  "textbook": "Textbook",
  "research-organization": "Research Organization",
  "news": "News",
  "legal-authority": "Legal Authority",
  "technical-documentation": "Technical Documentation",
  "company-documentation": "Company Documentation",
  "lecture-notes": "Lecture Notes",
  "book": "Book",
  "article": "Article",
  "other": "Other",
};

export interface ResearchSource {
  id: string;
  title: string;
  authors: string[];
  sourceType: SourceType;
  publicationDate: string;
  url?: string;
  credibilityScore: number;
  authorityScore: number;
  relevanceScore: number;
  keyFindings: string[];
  methodology?: string;
  limitations?: string[];
  citations: string[];
}

export interface ResearchDocument {
  id: string;
  fileName: string;
  fileType: string;
  content: string;
  extractedConcepts: string[];
  extractedEntities: string[];
  summary: string;
  source: ResearchSource;
  addedAt: number;
  wordCount: number;
  language: string;
}

export interface DocumentComparison {
  documentIds: string[];
  agreements: string[];
  contradictions: string[];
  mergedConcepts: string[];
  missingInformation: string[];
  highlightSections: { documentId: string; section: string; relevance: number }[];
  synthesisSummary: string;
}

export interface ResearchMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  modeId: TeachingModeId;
  documentIds: string[];
  sourceIds: string[];
  conceptIds: string[];
}

export interface ResearchNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  linkedConceptIds: string[];
  linkedDocumentIds: string[];
  linkedSourceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ResearchTask {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high";
  linkedConceptIds: string[];
  createdAt: number;
  completedAt?: number;
}

export interface OpenQuestion {
  id: string;
  question: string;
  context: string;
  category: "unknown" | "controversy" | "assumption" | "future-work" | "methodology";
  linkedConceptIds: string[];
  linkedSourceIds: string[];
  isResolved: boolean;
  resolution?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Insight {
  id: string;
  type: "key-insight" | "pattern" | "relationship" | "conclusion" | "recommendation";
  title: string;
  description: string;
  evidence: string[];
  linkedConceptIds: string[];
  linkedSourceIds: string[];
  linkedDocumentIds: string[];
  confidence: number;
  createdAt: number;
}

export interface ResearchReport {
  id: string;
  title: string;
  type: ReportType;
  sections: ReportSection[];
  sources: string[];
  generatedAt: number;
  wordCount: number;
}

export type ReportType =
  | "executive-summary"
  | "literature-review"
  | "analysis"
  | "research-paper"
  | "briefing"
  | "technical-report";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  "executive-summary": "Executive Summary",
  "literature-review": "Literature Review",
  "analysis": "Analysis",
  "research-paper": "Research Paper",
  "briefing": "Briefing",
  "technical-report": "Technical Report",
};

export const REPORT_SECTIONS: Record<ReportType, string[]> = {
  "executive-summary": [
    "Executive Summary", "Key Findings", "Recommendations", "Conclusion",
  ],
  "literature-review": [
    "Introduction", "Scope of Review", "Thematic Analysis",
    "Consensus", "Contradictions", "Gaps in Literature",
    "Conclusion", "References",
  ],
  "analysis": [
    "Introduction", "Methodology", "Evidence",
    "Counterarguments", "Discussion", "Conclusion", "References",
  ],
  "research-paper": [
    "Abstract", "Introduction", "Background",
    "Methodology", "Results", "Discussion",
    "Conclusion", "References", "Appendices",
  ],
  "briefing": [
    "Executive Summary", "Situation Overview",
    "Key Developments", "Implications",
    "Recommendations", "Next Steps",
  ],
  "technical-report": [
    "Executive Summary", "Introduction",
    "Technical Background", "Implementation Details",
    "Evaluation", "Limitations",
    "Conclusion", "References", "Appendices",
  ],
};

export interface ReportSection {
  heading: string;
  content: string;
  subsections: ReportSection[];
  sources: string[];
}

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  timestamp: number;
  linkedDocumentIds: string[];
  linkedMessageIds: string[];
  linkedInsightIds: string[];
  milestone: boolean;
}

export type TimelineEventType =
  | "project-created"
  | "document-added"
  | "source-categorized"
  | "insight-generated"
  | "question-identified"
  | "question-resolved"
  | "report-generated"
  | "bookmark-added"
  | "milestone"
  | "conclusion-reached";

export interface Bookmark {
  id: string;
  type: BookmarkType;
  title: string;
  description: string;
  targetId: string;
  targetContext: string;
  tags: string[];
  createdAt: number;
}

export type BookmarkType =
  | "concept"
  | "paragraph"
  | "source"
  | "diagram"
  | "explanation"
  | "report"
  | "insight"
  | "question";

export interface ResearchPlannerOutput {
  researchGoal: string;
  learningObjectives: string[];
  researchQuestions: string[];
  keyConcepts: { term: string; definition: string }[];
  areasToInvestigate: string[];
  potentialChallenges: string[];
  futureTopics: string[];
  generatedAt: number;
}

export interface ResearchProject {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  goal: string;
  createdAt: number;
  updatedAt: number;
  messages: ResearchMessage[];
  documents: ResearchDocument[];
  notes: ResearchNote[];
  sources: ResearchSource[];
  reports: ResearchReport[];
  bookmarks: Bookmark[];
  timeline: TimelineEvent[];
  tasks: ResearchTask[];
  openQuestions: OpenQuestion[];
  insights: Insight[];
  plannerOutput: ResearchPlannerOutput;
  activeModeId: TeachingModeId;
}

export interface ResearchConfig {
  projectId?: string;
  modeId: TeachingModeId;
  documents?: { fileName: string; fileType: string; content: string }[];
  onChunk?: (chunk: string) => void;
}

export interface ResearchResponse {
  query: string;
  fullText: string;
  project: ResearchProject;
  openQuestions: OpenQuestion[];
  insights: Insight[];
  timeline: TimelineEvent[];
  sources: ResearchSource[];
}
