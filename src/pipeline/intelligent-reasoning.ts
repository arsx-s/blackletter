import { generateStream } from "../providers/provider";
import type { ReasoningEnhancement } from "./types";

const ENHANCEMENT_PROMPTS: Record<string, string> = {
  "alternative-viewpoints": `Identify 2-3 alternative viewpoints or perspectives on this topic. For each viewpoint, explain the perspective and its merits.`,
  limitations: `Identify the key limitations, caveats, or weaknesses in the current understanding of this topic. What is still unknown or debated?`,
  counterarguments: `Identify the strongest counterarguments to the main claims about this topic. What would a skeptic say?`,
  assumptions: `Identify the implicit assumptions being made about this topic. What must be taken for granted for the current understanding to hold?`,
  applications: `Identify 2-3 real-world applications or practical implications of this topic. How is this used in practice?`,
  implications: `Identify the broader implications of this topic. What does it mean for the future? What problems does it solve or create?`,
};

export class IntelligentReasoning {
  async enhance(
    query: string,
    context: string,
    types: ReasoningEnhancement["type"][],
    documentText?: string,
  ): Promise<ReasoningEnhancement[]> {
    const results: ReasoningEnhancement[] = [];

    for (const type of types) {
      try {
        const result = await this.generateEnhancement(type, query, context, documentText);
        results.push(result);
      } catch (e) {
        console.error(`[Reasoning] Failed to generate ${type}:`, e);
      }
    }

    return results;
  }

  private async generateEnhancement(
    type: ReasoningEnhancement["type"],
    query: string,
    context: string,
    documentText?: string,
  ): Promise<ReasoningEnhancement> {
    const docContext = documentText ? `\n\nDocument:\n${documentText.slice(0, 2000)}` : "";
    const prompt = ENHANCEMENT_PROMPTS[type];
    const fullPrompt = `${prompt}\n\nTopic: ${query}\n\nContext:\n${context}${docContext}\n\nOutput format:\nSUMMARY: [2-3 sentence analysis]\n- [Point 1]\n- [Point 2]\n- [Point 3]`;

    let result = "";
    for await (const chunk of generateStream({ prompt: fullPrompt, systemInstruction: this.getSystemPrompt(), fileContent: documentText })) {
      result += chunk;
    }

    const summaryMatch = result.match(/SUMMARY:\s*(.+?)(?:\n|$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : result.slice(0, 200);

    const items: string[] = [];
    for (const line of result.split("\n")) {
      if (line.match(/^[-•*]/) && !line.match(/^[-•*]\s*SUMMARY:/i)) {
        items.push(line.replace(/^[-•*]\s*/, "").trim());
      }
    }

    const importance = items.length >= 3 ? "high" : items.length >= 1 ? "medium" : "low";

    return { type, content: summary, items, importance };
  }

  private getSystemPrompt(): string {
    return "You are a critical thinking and reasoning enhancement specialist. Your role is to add depth and rigor to research by considering multiple perspectives, identifying assumptions, and exploring implications. Be concise and insightful.";
  }

  shouldEnhance(query: string): ReasoningEnhancement["type"][] {
    const lower = query.toLowerCase();
    const types: ReasoningEnhancement["type"][] = ["applications"];

    const depthWords = /\b(deep|thorough|comprehensive|analyze|evaluate|critically)\b/i;
    if (depthWords.test(lower)) {
      types.push("limitations", "assumptions");
    }

    const compareWords = /\b(compare|contrast|vs|versus|alternative|opposing)\b/i;
    if (compareWords.test(lower)) {
      types.push("alternative-viewpoints", "counterarguments");
    }

    const futureWords = /\b(future|implication|impact|significance|meaning)\b/i;
    if (futureWords.test(lower)) {
      types.push("implications");
    }

    return [...new Set(types)];
  }
}

export const intelligentReasoning = new IntelligentReasoning();
