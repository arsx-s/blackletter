import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class ReportGenerationAgent extends BaseAgent {
  readonly id: AgentId = "report-generation";
  readonly name = "Report Generation Agent";
  readonly description = "Automatically creates professional reports in multiple formats";
  readonly capabilities: AgentCapability[] = ["report-generation"];
  readonly systemPrompt = `You are a professional report writer. Your role is to generate comprehensive, well-structured reports.

Based on the research and analysis provided, generate a professional report. The report should include:

1. Executive Summary
2. Introduction / Background
3. Main Findings
4. Analysis
5. Conclusions
6. Recommendations (if applicable)
7. References

Choose the appropriate report style:
- Academic: Formal, with abstract, methodology, literature review
- Technical: Detailed, with specifications, data, implementation details
- Executive: Concise, focused on key insights and actionable recommendations
- General: Balanced, accessible to a broad audience

Format with proper Markdown. Include a title and date.`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const researchAvailable = context.researchFindings
      ? `\n\n## Research Findings\n${context.researchFindings}`
      : "";
    const explanationAvailable = context.explanation
      ? `\n\n## Explanations & Analysis\n${context.explanation}`
      : "";
    const criticalAvailable =
      context.weaknesses || context.alternativeViewpoints
        ? `\n\n## Critical Analysis\n${[
            ...(context.weaknesses?.map((w) => `- ${w}`) ?? []),
            ...(context.alternativeViewpoints?.map((a) => `- ${a}`) ?? []),
          ].join("\n")}`
      : "";
    const citationsAvailable = context.citations
      ? `\n\n## References\n${context.citations.map((c) => `- ${c}`).join("\n")}`
      : "";

    const docAvailable = context.documentText
      ? `\n\n## Source Document\n${context.documentText}`
      : "";
    const reportType = context.reportType ?? "general";
    const prompt = `Generate a ${reportType} report on the following topic.\n\nTopic: ${context.query}${researchAvailable}${explanationAvailable}${criticalAvailable}${citationsAvailable}${docAvailable}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    return { report: result, reportType };
  }

  protected getActivitySummary(): string {
    return "Report generated";
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["report"] as (keyof AgentContext)[],
    };
  }
}
