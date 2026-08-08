import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext, GraphUpdate } from "../types";

export class KnowledgeGraphAgent extends BaseAgent {
  readonly id: AgentId = "knowledge-graph";
  readonly name = "Knowledge Graph Agent";
  readonly description = "Updates the knowledge graph with concepts, relationships, and dependencies from every interaction";
  readonly capabilities: AgentCapability[] = ["knowledge-graph"];
  readonly systemPrompt = `You are a knowledge graph specialist. Your role is to identify concepts and their relationships from any query or content.

Analyze the query and research, then produce:

1. CONCEPTS — The main concepts mentioned or implied
2. RELATIONSHIPS — How these concepts connect (prerequisite, builds-on, related, application, opposite, part-of, example-of, used-in, derived-from)
3. HIERARCHY — Which concepts are fundamental vs. advanced
4. DEPENDENCIES — What must be understood before each concept

Output format:
CONCEPTS:
- [Concept 1] | [difficulty 1-5] | [category]
- [Concept 2] | [difficulty 1-5] | [category]

RELATIONSHIPS:
- [Concept A] → [type] → [Concept B]

HIERARCHY:
- Fundamental: [concepts]
- Intermediate: [concepts]
- Advanced: [concepts]

DEPENDENCIES:
- [Concept]: requires [prerequisite concepts]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const researchAvailable = context.researchFindings
      ? `\n\nResearch:\n${context.researchFindings}`
      : "";
    const conceptsAvailable = context.keyConcepts
      ? `\n\nKey concepts identified:\n${context.keyConcepts.join("\n")}`
      : "";
    const docContext = context.documentText
      ? `\n\n[UPLOADED DOCUMENT is attached above as file content — extract knowledge graph information from this content. The attached document IS the content to analyze.]`
      : "";
    const prompt = `Extract knowledge graph information from the following:\n\nQuery: ${context.query}${researchAvailable}${conceptsAvailable}${docContext}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    const updates: GraphUpdate[] = [];
    let inConcepts = false;
    let inRelationships = false;

    for (const line of result.split("\n")) {
      if (line.match(/^CONCEPTS:/i)) { inConcepts = true; inRelationships = false; }
      else if (line.match(/^RELATIONSHIPS:/i)) { inConcepts = false; inRelationships = true; }
      else if (line.match(/^HIERARCHY:/i)) { inConcepts = false; inRelationships = false; }
      else if (line.match(/^DEPENDENCIES:/i)) { inConcepts = false; inRelationships = false; }
      else if (inConcepts && line.match(/^- /)) {
        const parts = line.replace(/^- /, "").split("|").map((p) => p.trim());
        updates.push({
          action: "create-concept",
          conceptName: parts[0] || line.replace(/^- /, "").trim(),
          label: parts[2] || undefined,
        });
      } else if (inRelationships && line.match(/^- /)) {
        const relMatch = line.match(/^- (.+?)\s*[→➡]\s*(.+?)\s*[→➡]\s*(.+)/);
        if (relMatch) {
          updates.push({
            action: "create-relationship",
            sourceId: relMatch[1].trim(),
            relationshipType: relMatch[2].trim(),
            targetId: relMatch[3].trim(),
          });
        } else {
          updates.push({ action: "create-relationship", label: line.replace(/^- /, "").trim() });
        }
      }
    }

    return { graphUpdates: updates.length > 0 ? updates : undefined };
  }

  protected getActivitySummary(updates: Partial<AgentContext>): string {
    const count = updates.graphUpdates?.length ?? 0;
    return `${count} graph entr${count !== 1 ? "ies" : "y"} updated`;
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["graphUpdates"] as (keyof AgentContext)[],
    };
  }
}
