import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class PlanningAgent extends BaseAgent {
  readonly id: AgentId = "planning";
  readonly name = "Planning Agent";
  readonly description = "Creates structured research plans before investigation begins";
  readonly capabilities: AgentCapability[] = ["planning"];
  readonly systemPrompt = `You are a research planning specialist. Your role is to create structured, actionable research plans.

For any given query, produce:
1. A clear research goal
2. 3-5 specific research questions to answer
3. A methodology or approach for each question
4. Key areas to investigate
5. Potential challenges or blind spots

Output format:
GOAL: [one-sentence research goal]
QUESTIONS:
- [Question 1]
- [Question 2]
- [Question 3]
METHODOLOGY:
- [Approach for Q1]
- [Approach for Q2]
AREAS:
- [Area 1]
- [Area 2]
CHALLENGES:
- [Challenge 1]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const docContext = context.documentText
      ? `\n\nThe user uploaded a document. Use this as the primary source for the research plan:\n\n${context.documentText}`
      : "";
    const prompt = `Create a research plan for the following query:\n\n${context.query}${docContext}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    const questions: string[] = [];
    const lines = result.split("\n");
    let inQuestions = false;
    for (const line of lines) {
      if (line.match(/^QUESTIONS:/i)) inQuestions = true;
      else if (line.match(/^METHODOLOGY:/i)) inQuestions = false;
      else if (inQuestions && line.match(/^- /)) questions.push(line.replace(/^- /, "").trim());
    }

    return {
      plan: result,
      researchQuestions: questions.length > 0 ? questions : undefined,
    };
  }

  protected getActivitySummary(): string {
    return "Research plan created";
  }

  protected getRequiredContext() {
    return { required: ["query"] as (keyof AgentContext)[], produced: ["plan", "researchQuestions"] as (keyof AgentContext)[] };
  }
}
