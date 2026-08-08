import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class CitationAgent extends BaseAgent {
  readonly id: AgentId = "citation";
  readonly name = "Citation Agent";
  readonly description = "Generates proper citations and references for research content";
  readonly capabilities: AgentCapability[] = ["citation"];
  readonly systemPrompt = `You are a citation and reference specialist. Your role is to generate accurate academic-style citations.

Given a query and research content, produce:
1. A list of relevant citations in APA format
2. The type of each source (book, article, paper, web, etc.)
3. Brief notes on why each source is relevant

If specific sources aren't available, generate placeholders indicating what types of sources would be most authoritative for this topic.

Output format:
CITATIONS:
- Author. (Year). Title. Source. [Type]

RELEVANCE:
- [Citation 1]: Why it's relevant

NOTE:
[Any notes about citation quality or suggestions for finding authoritative sources]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const researchAvailable = context.researchFindings
      ? `\n\nResearch:\n${context.researchFindings}`
      : "";
    const docContext = context.documentText
      ? `\n\nThe user uploaded a document. Generate citations based on this content:\n\n${context.documentText}`
      : "";
    const prompt = `Generate citations for the following topic:\n\nQuery: ${context.query}${researchAvailable}${docContext}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    const citations: string[] = [];
    let inCitations = false;
    for (const line of result.split("\n")) {
      if (line.match(/^CITATIONS:/i)) inCitations = true;
      else if (line.match(/^RELEVANCE:/i)) inCitations = false;
      else if (inCitations && line.match(/^- /)) citations.push(line.replace(/^- /, "").trim());
    }

    return { citations: citations.length > 0 ? citations : undefined };
  }

  protected getActivitySummary(updates: Partial<AgentContext>): string {
    const count = updates.citations?.length ?? 0;
    return `${count} citation${count !== 1 ? "s" : ""} generated`;
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["citations"] as (keyof AgentContext)[],
    };
  }
}
