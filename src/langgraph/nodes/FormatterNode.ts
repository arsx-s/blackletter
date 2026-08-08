import type { GraphState, FormattedSection } from "../types";
import { log } from "../logger";

const SECTION_PATTERNS: Array<{ type: string; title: string; patterns: RegExp[] }> = [
  { type: "objective", title: "Objective", patterns: [/objective/i, /learning goal/i, /what you.ll learn/i, /by the end/i] },
  { type: "foundation", title: "Foundation", patterns: [/foundation/i, /prerequisites?/i, /what you should know/i, /background/i, /prior knowledge/i, /groundwork/i] },
  { type: "principles", title: "Principles", patterns: [/principles?/i, /core concept/i, /key concept/i, /fundamental/i, /main idea/i] },
  { type: "argument", title: "Argument", patterns: [/argument/i, /explanation/i, /how it works/i, /breakdown/i, /in detail/i, /step.by.step/i, /brief/i] },
  { type: "demonstrations", title: "Demonstrations", patterns: [/demonstration/i, /example/i, /for instance/i, /e\.g\./i, /illustration/i, /sample/i] },
  { type: "pitfalls", title: "Pitfalls", patterns: [/pitfall/i, /common mistake/i, /gotcha/i, /warning/i, /caution/i, /avoid/i, /edge case/i] },
  { type: "mnemonics", title: "Mnemonics", patterns: [/mnemonic/i, /memory/i, /trick/i, /remember/i, /mental model/i] },
  { type: "verdict", title: "Verdict", patterns: [/verdict/i, /key takeaway/i, /summary/i, /recap/i, /in summary/i, /to sum up/i, /conclusion/i] },
  { type: "drill", title: "Drill", patterns: [/drill/i, /practice exercise/i, /exercise/i, /problem/i, /assignment/i, /try it/i] },
  { type: "references", title: "References", patterns: [/references?/i, /further reading/i, /next step/i, /related topic/i, /explore more/i, /recommend/i, /source/i] },
  { type: "in-practice", title: "In Practice", patterns: [/in practice/i, /real.world/i, /application/i, /use case/i, /practical/i, /industry/i, /production/i] },
  { type: "next-steps", title: "Next Steps", patterns: [/next steps?/i, /action plan/i, /next action/i, /what to do next/i, /implementation plan/i] },
  { type: "probe", title: "Probe", patterns: [/probe/i, /mini.?quiz/i, /check your understanding/i, /test yourself/i, /practice question/i] },
];

export async function FormatterNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "FormatterNode: formatting response into sections");
  const response = state.aiResponse;
  if (!response) {
    log("NODE", "FormatterNode: no response to format");
    return { formattedSections: [] };
  }

  const lines = response.split("\n");
  const sections: FormattedSection[] = [];
  let currentSection: { type: string; title: string; lines: string[] } = { type: "argument", title: "", lines: [] };
  let order = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentSection.lines.length > 0) {
        const content = currentSection.lines.join("\n").trim();
        if (content.length > 10) {
          sections.push({ type: currentSection.type, title: currentSection.title, content, order: order++ });
        }
      }
      const headingText = headingMatch[1];
      let matchedType = "argument";
      let matchedTitle = "";
      for (const sp of SECTION_PATTERNS) {
        if (sp.patterns.some((p) => p.test(headingText))) {
          matchedType = sp.type;
          matchedTitle = sp.title;
          break;
        }
      }
      currentSection = { type: matchedType, title: matchedTitle || headingText, lines: [] };
      continue;
    }
    if (line.trim()) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection.lines.length > 0) {
    const content = currentSection.lines.join("\n").trim();
    if (content.length > 10) {
      sections.push({ type: currentSection.type, title: currentSection.title, content, order: order++ });
    }
  }

  if (sections.length === 0) {
    const totalContent = response.trim();
    if (totalContent.length > 0) {
      sections.push({ type: "objective", title: "Objective", content: `Understand ${state.userPrompt}`, order: 0 });
      sections.push({ type: "argument", title: "Argument", content: totalContent, order: 1 });
      sections.push({ type: "verdict", title: "Verdict", content: `Review the argument above for the key points of ${state.userPrompt}.`, order: 2 });
    }
  }

  sections.sort((a, b) => a.order - b.order);
  log("NODE", `FormatterNode: ${sections.length} sections`);
  return { formattedSections: sections };
}
