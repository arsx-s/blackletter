import { agentRegistry } from "./registry";
import { PlanningAgent } from "./agents/planning-agent";
import { ResearchAgent } from "./agents/research-agent";
import { CriticalThinkingAgent } from "./agents/critical-thinking-agent";
import { FactVerificationAgent } from "./agents/fact-verification-agent";
import { TeacherAgent } from "./agents/teacher-agent";
import { WritingAgent } from "./agents/writing-agent";
import { SummarizationAgent } from "./agents/summarization-agent";
import { CitationAgent } from "./agents/citation-agent";
import { KnowledgeGraphAgent } from "./agents/knowledge-graph-agent";
import { ReportGenerationAgent } from "./agents/report-generation-agent";

agentRegistry.register(new PlanningAgent());
agentRegistry.register(new ResearchAgent());
agentRegistry.register(new CriticalThinkingAgent());
agentRegistry.register(new FactVerificationAgent());
agentRegistry.register(new TeacherAgent());
agentRegistry.register(new WritingAgent());
agentRegistry.register(new SummarizationAgent());
agentRegistry.register(new CitationAgent());
agentRegistry.register(new KnowledgeGraphAgent());
agentRegistry.register(new ReportGenerationAgent());

export { Orchestrator, orchestrator } from "./orchestrator";
export { AgentRegistry, agentRegistry } from "./registry";
export { BaseAgent } from "./base-agent";

export type {
  AgentId,
  AgentStatus,
  AgentContext,
  AgentResult,
  AgentActivity,
  AgentCapability,
  AgentDefinition,
  GraphUpdate,
  OrchestratorResult,
  QueryComplexity,
} from "./types";

export type { PlanningAgent } from "./agents/planning-agent";
export type { ResearchAgent } from "./agents/research-agent";
export type { CriticalThinkingAgent } from "./agents/critical-thinking-agent";
export type { FactVerificationAgent } from "./agents/fact-verification-agent";
export type { TeacherAgent } from "./agents/teacher-agent";
export type { WritingAgent } from "./agents/writing-agent";
export type { SummarizationAgent } from "./agents/summarization-agent";
export type { CitationAgent } from "./agents/citation-agent";
export type { KnowledgeGraphAgent } from "./agents/knowledge-graph-agent";
export type { ReportGenerationAgent } from "./agents/report-generation-agent";
