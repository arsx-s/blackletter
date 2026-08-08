import type { PipelineContext, FormattedSection } from "./types";

const HEADING_MAP: Record<string, string> = {
  objective: "Objective",
  foundation: "Foundation",
  principles: "Principles",
  argument: "Argument",
  demonstrations: "Demonstrations",
  "in-practice": "In Practice",
  pitfalls: "Pitfalls",
  mnemonics: "Mnemonics",
  verdict: "Verdict",
  probe: "Probe",
  drill: "Drill",
  references: "References",
  "next-steps": "Next Steps",
};

export interface ReportResult {
  report: string;
  sections: FormattedSection[];
}

export async function executeReportGenerator(ctx: PipelineContext): Promise<ReportResult> {
  const sections = ctx.formattedSections;
  const wordCount = ctx.response.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const header = [
    `# ${ctx.normalizedPrompt}`,
    "",
    `**Subject**: ${ctx.primarySubject.replace(/-/g, " ")}  |  **Difficulty**: ${ctx.difficulty || "intermediate"}  |  **Read time**: ${readTime} min`,
    "",
  ].join("\n");

  const footer = [
    "",
    "---",
    `*BlackLetter Intelligence Pipeline*`,
    `*Intent: ${ctx.intent} | Quality: ${ctx.qualityPassed ? "Passed" : "Needs improvement"}*`,
    "",
  ].join("\n");

  const body = sections
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const title = HEADING_MAP[s.type] || s.title || s.type;
      return `## ${title}\n\n${s.content}`;
    })
    .join("\n\n");

  const report = header + body + footer;

  return { report, sections };
}
