import { generateStream } from "../providers/provider";
import type { BlackLetterMode, ThinkingToolType, ThinkingToolResult, ToolSection } from "./types";

const TOOL_PROMPTS: Record<ThinkingToolType, string> = {
  flashcards: "Convert the following content into a set of flashcards. Each flashcard should have a front (question/concept) and back (answer/definition). Format as:\n\nFRONT: [concept]\nBACK: [definition]\n---",
  quiz: "Create a quiz from the following content. Include multiple choice and short answer questions with answers. Format as:\n\nQ1: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nANSWER: [correct]\n---",
  lecture: "Create a lecture outline from the following content. Include learning objectives, main points, examples, and discussion questions. Format as:\n\nOBJECTIVE: [goal]\nPOINT 1: [main point]\n  EXAMPLE: [example]\n---",
  report: "Create a professional report from the following content. Include executive summary, findings, analysis, and conclusions.",
  "mind-map": "Extract the key concepts and their relationships from the following content. Format as:\n\nCENTRAL: [main topic]\nBRANCH 1: [concept]\n  SUB: [related concept]\nBRANCH 2: [concept]\n---",
  timeline: "Create a timeline from the following content. List key events or steps in chronological order. Format as:\n\n[TIME/DATE]: [event description]\n---",
  flowchart: "Create a flowchart description from the following content. Show decision points and process steps. Format as:\n\nSTART: [starting state]\nSTEP 1: [action]\nDECISION: [question] → YES: [path] / NO: [path]\n---",
  presentation: "Create a slide-by-slide presentation outline from the following content. Each slide should have a title and bullet points. Format as:\n\nSLIDE 1: [title]\n- [bullet]\n- [bullet]\n---",
  "study-notes": "Create comprehensive study notes from the following content. Include key terms, main ideas, summaries, and review questions.",
  "business-plan": "Create a business plan from the following content. Include executive summary, market analysis, strategy, financial projections, and milestones.",
  "legal-memo": "Create a legal memorandum from the following content. Include issue, facts, rule, analysis, and conclusion.",
  "case-analysis": "Create a case analysis from the following content. Include facts, issues, holding, reasoning, and significance.",
  "research-proposal": "Create a research proposal from the following content. Include research question, literature review, methodology, expected outcomes, and timeline.",
  "technical-documentation": "Create technical documentation from the following content. Include overview, installation, usage, API reference, and troubleshooting.",
  "project-roadmap": "Create a project roadmap from the following content. Include phases, milestones, deliverables, and timeline.",
};

const TOOL_TITLES: Record<ThinkingToolType, string> = {
  flashcards: "Flashcards",
  quiz: "Quiz",
  lecture: "Lecture Outline",
  report: "Report",
  "mind-map": "Mind Map",
  timeline: "Timeline",
  flowchart: "Flowchart",
  presentation: "Presentation",
  "study-notes": "Study Notes",
  "business-plan": "Business Plan",
  "legal-memo": "Legal Memorandum",
  "case-analysis": "Case Analysis",
  "research-proposal": "Research Proposal",
  "technical-documentation": "Technical Documentation",
  "project-roadmap": "Project Roadmap",
};

export class ThinkingTools {
  async transform(
    type: ThinkingToolType,
    query: string,
    context: string,
    documentText?: string,
  ): Promise<ThinkingToolResult> {
    const docContext = documentText ? `\n\nDocument:\n${documentText.slice(0, 2000)}` : "";
    const prompt = TOOL_PROMPTS[type];
    const fullPrompt = `${prompt}\n\nOriginal query: ${query}\n\nContent:\n${context}${docContext}`;

    let result = "";
    for await (const chunk of generateStream({ prompt: fullPrompt, systemInstruction: this.getSystemPrompt(type), fileContent: documentText })) {
      result += chunk;
    }

    const sections = this.parseSections(result, type);

    return {
      type,
      title: TOOL_TITLES[type],
      content: result,
      sections,
      metadata: { sourceQuery: query, generatedAt: Date.now() },
    };
  }

  private getSystemPrompt(type: ThinkingToolType): string {
    return `You are a specialized ${TOOL_TITLES[type]} generator. Transform educational/research content into a well-structured ${TOOL_TITLES[type].toLowerCase()}. Be thorough, accurate, and well-organized.`;
  }

  private parseSections(content: string, type: ThinkingToolType): ToolSection[] {
    const sections: ToolSection[] = [];
    const lines = content.split("\n");
    let currentSection: ToolSection | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^[A-Z ]+:/);
      if (headerMatch) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          heading: headerMatch[0].replace(":", "").trim(),
          content: line.replace(headerMatch[0], "").trim(),
          items: [],
        };
      } else if (currentSection && line.trim()) {
        if (line.match(/^[-•*]/)) {
          currentSection.items = currentSection.items ?? [];
          currentSection.items.push(line.replace(/^[-•*]\s*/, "").trim());
        } else {
          currentSection.content += `\n${line}`;
        }
      }
    }
    if (currentSection) sections.push(currentSection);
    return sections;
  }

  getAllToolTypes(): ThinkingToolType[] {
    return Object.keys(TOOL_PROMPTS) as ThinkingToolType[];
  }

  getToolTitle(type: ThinkingToolType): string {
    return TOOL_TITLES[type];
  }
}

export const thinkingTools = new ThinkingTools();
