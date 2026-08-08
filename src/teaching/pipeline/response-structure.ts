import type { ResponseStructureConfig, VisualPreferences, UnderstandingCheckConfig } from "../types";
import { DEFAULT_SECTIONS } from "../types";

interface SectionDirective {
  name: string;
  instruction: string;
}

export const SECTION_DIRECTIVES: Record<string, string> = {
  "Overview": "Open with a brief overview that sets expectations, motivates the topic, and outlines what will be covered.",
  "Core Idea": "Define the concept with precision. State what it is, what problem it solves, and its essential characteristics.",
  "Intuition": "Build intuition using an analogy, mental model, or thought experiment that connects the unfamiliar to the familiar.",
  "Step-by-Step Explanation": "Break the concept into sequential steps. Each step builds on the previous one. Number each step.",
  "Worked Example": "Provide a concrete example worked through step by step. Show the thinking process, not just the solution.",
  "Visual Description": "Describe a table, diagram, chart, or other visual that clarifies relationships, comparisons, or processes.",
  "Real World Application": "Show how this concept is applied in practical, real-world situations. Include specific examples.",
  "Common Mistakes": "Identify specific mistakes learners make with this concept. Explain why they happen and how to avoid them.",
  "Memory Technique": "Provide a mnemonic, memorable phrase, acronym, or mental image that helps retain the key idea.",
  "Challenge Question": "Ask ONE thoughtful question that tests understanding. The question should require applying the concept.",
  "Summary": "Summarize the key takeaways. Aim for 3-5 bullet points, each capturing one essential idea.",
};

export class ResponseStructureBuilder {
  buildDirective(
    structureConfig: ResponseStructureConfig,
    visualPrefs: VisualPreferences,
    understandingCheck: UnderstandingCheckConfig,
  ): string {
    const sections = structureConfig.includeSections;
    const directives: string[] = [];

    if (structureConfig.ordered && sections.length > 0) {
      directives.push(`## RESPONSE STRUCTURE`);
      directives.push(``);
      directives.push(`Structure your response using these sections:`);
      directives.push(``);

      sections.forEach((section, i) => {
        const guideline = structureConfig.sectionGuidelines?.[section];
        const baseInstruction = SECTION_DIRECTIVES[section] || "";
        const instruction = guideline
          ? `${baseInstruction}\n\n${guideline}`
          : baseInstruction;

        const headingStyle = structureConfig.showHeadings;
        let headingNote = "";
        if (headingStyle === "always") {
          headingNote = ` Use "${structureConfig.headingLevel === "h2" ? "##" : structureConfig.headingLevel === "h3" ? "###" : "**"}${section}${structureConfig.headingLevel === "bold" ? "**" : ""}" as the heading.`;
        } else if (headingStyle === "when-helpful") {
          headingNote = ` Use a heading for this section only if it improves readability.`;
        } else {
          headingNote = ` Do not use explicit headings — transition naturally between sections.`;
        }

        directives.push(`### Section ${i + 1}: ${section}`);
        directives.push(instruction + headingNote);
        directives.push(``);
      });

      directives.push(`## SECTION TRANSITIONS`);
      directives.push(`Transition smoothly between sections. Do not announce the next section — lead into it naturally.`);
      directives.push(``);
    }

    if (!visualPrefs.enabled) {
      directives.push(`## VISUAL ELEMENTS`);
      directives.push(`Do not use visual elements (tables, diagrams, charts) in this response.`);
      directives.push(``);
    } else {
      directives.push(`## VISUAL ELEMENTS`);
      const typeMap: Record<string, string> = {
        "table": "Use tables for structured comparisons and classifications.",
        "comparison": "Use comparison formats for showing trade-offs and alternatives.",
        "ascii-diagram": "Use ASCII diagrams for showing structural relationships.",
        "process-flow": "Use process flows for multi-step procedures.",
        "decision-tree": "Use decision trees for branching logic and choices.",
        "concept-map": "Use concept maps for showing relationships between ideas.",
        "timeline": "Use timelines for historical or sequential development.",
      };
      const typeInstructions = visualPrefs.preferredTypes
        .map((t) => `- ${typeMap[t] || t}`)
        .join("\n");

      directives.push(`Integrate visual elements where they enhance understanding.`);
      directives.push(``);
      directives.push(`Preferred visual types:`);
      directives.push(typeInstructions);
      directives.push(``);

      if (visualPrefs.guidelines) {
        directives.push(`Visual guidelines:`);
        directives.push(visualPrefs.guidelines);
        directives.push(``);
      }
    }

    if (understandingCheck.enabled && understandingCheck.frequency === "every-response") {
      directives.push(`## UNDERSTANDING CHECK`);
      directives.push(`At the end of your response, include ONE thoughtful question that checks understanding.`);
      directives.push(``);
      directives.push(`Question style:`);
      directives.push(understandingCheck.questionStyle);
      directives.push(``);
      if (understandingCheck.guidelines) {
        directives.push(understandingCheck.guidelines);
        directives.push(``);
      }
      directives.push(`CRITICAL: Never end with "Anything else?" or "Let me know if you have questions." End with the understanding check question.`);
      directives.push(``);
    }

    return directives.join("\n");
  }

  getDefaultSections(): string[] {
    return [...DEFAULT_SECTIONS];
  }
}
