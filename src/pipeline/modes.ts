import type { BlackLetterMode, ModeConfig } from "./types";

export function getModeConfig(mode: BlackLetterMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

export function getAllModeConfigs(): ModeConfig[] {
  return Object.values(MODE_CONFIGS);
}

export function getModeLabel(mode: BlackLetterMode): string {
  return MODE_CONFIGS[mode].label;
}

export function getModeDescription(mode: BlackLetterMode): string {
  return MODE_CONFIGS[mode].description;
}

export function detectMode(query: string): BlackLetterMode {
  const lower = query.toLowerCase();
  if (/\b(teach|explain|understand|learn|what is|how does)\b/.test(lower) && !/\b(compare|vs|versus)\b/.test(lower)) return "teach";
  if (/\b(research|investigate|study|analyze|literature|sources|paper)\b/.test(lower)) return "research";
  if (/\b(build|create|implement|code|write|develop|make)\b/.test(lower)) return "build";
  if (/\b(debate|argue|opposing|critique|challenge)\b/.test(lower)) return "debate";
  if (/\b(compare|contrast|vs|versus|difference|similar)\b/.test(lower)) return "compare";
  if (/\b(plan|roadmap|step|timeline|milestone|strategy)\b/.test(lower)) return "plan";
  if (/\b(analyze|break down|examine|evaluate|assess)\b/.test(lower)) return "analyze";
  if (/\b(create|design|brainstorm|generate|idea|novel)\b/.test(lower)) return "create";
  if (/\b(review|feedback|improve|suggest|critique|optimize)\b/.test(lower)) return "review";
  if (/\b(master|deep|thorough|comprehensive|expert|advanced)\b/.test(lower)) return "master";
  return "teach";
}

const MODE_CONFIGS: Record<BlackLetterMode, ModeConfig> = {
  teach: {
    mode: "teach",
    label: "Teach",
    description: "Clear explanations with examples and analogies",
    complexity: "moderate",
    enableCriticalThinking: false,
    enableFactCheck: false,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["teacher", "knowledge-graph"],
  },
  research: {
    mode: "research",
    label: "Research",
    description: "Deep investigation with sources and citations",
    complexity: "complex",
    enableCriticalThinking: true,
    enableFactCheck: true,
    enableCitations: true,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "thorough",
    reasoningDepth: "deep",
    agents: ["planning", "research", "critical-thinking", "fact-verification", "teacher", "citation", "knowledge-graph", "writing", "summarization"],
  },
  build: {
    mode: "build",
    label: "Build",
    description: "Practical step-by-step implementation guidance",
    complexity: "moderate",
    enableCriticalThinking: false,
    enableFactCheck: false,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["research", "teacher", "knowledge-graph", "writing"],
  },
  debate: {
    mode: "debate",
    label: "Debate",
    description: "Multiple viewpoints with critical analysis",
    complexity: "complex",
    enableCriticalThinking: true,
    enableFactCheck: true,
    enableCitations: true,
    enableVisualThinking: false,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "thorough",
    reasoningDepth: "deep",
    agents: ["research", "critical-thinking", "fact-verification", "teacher", "citation", "knowledge-graph", "writing"],
  },
  compare: {
    mode: "compare",
    label: "Compare",
    description: "Structured comparison of concepts or approaches",
    complexity: "moderate",
    enableCriticalThinking: true,
    enableFactCheck: false,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["research", "critical-thinking", "teacher", "knowledge-graph", "writing"],
  },
  plan: {
    mode: "plan",
    label: "Plan",
    description: "Structured plans with timelines and milestones",
    complexity: "moderate",
    enableCriticalThinking: true,
    enableFactCheck: false,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["planning", "research", "teacher", "knowledge-graph", "writing"],
  },
  analyze: {
    mode: "analyze",
    label: "Analyze",
    description: "Deep breakdown of components and relationships",
    complexity: "complex",
    enableCriticalThinking: true,
    enableFactCheck: true,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "deep",
    agents: ["planning", "research", "critical-thinking", "fact-verification", "teacher", "knowledge-graph", "writing"],
  },
  create: {
    mode: "create",
    label: "Create",
    description: "Generate novel ideas and creative solutions",
    complexity: "moderate",
    enableCriticalThinking: false,
    enableFactCheck: false,
    enableCitations: false,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["research", "teacher", "knowledge-graph", "writing"],
  },
  review: {
    mode: "review",
    label: "Review",
    description: "Assessment with constructive feedback",
    complexity: "moderate",
    enableCriticalThinking: true,
    enableFactCheck: true,
    enableCitations: false,
    enableVisualThinking: false,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "balanced",
    reasoningDepth: "moderate",
    agents: ["critical-thinking", "fact-verification", "teacher", "knowledge-graph", "writing"],
  },
  master: {
    mode: "master",
    label: "Master",
    description: "Deep understanding with comprehensive connections",
    complexity: "complex",
    enableCriticalThinking: true,
    enableFactCheck: true,
    enableCitations: true,
    enableVisualThinking: true,
    enableKnowledgeGraph: true,
    enableFollowUp: true,
    verbosity: "thorough",
    reasoningDepth: "deep",
    agents: ["planning", "research", "critical-thinking", "fact-verification", "teacher", "citation", "knowledge-graph", "writing", "summarization", "report-generation"],
  },
};
