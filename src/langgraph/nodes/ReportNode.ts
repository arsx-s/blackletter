import type { GraphState, FormattedSection } from "../types";
import { log } from "../logger";

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

export async function ReportNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "ReportNode: generating final report");

  const sections = state.formattedSections;
  const wordCount = state.aiResponse.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  const displaySubject = state.subject === "general" ? "General" : state.subject.replace(/-/g, " ");

  const header = [
    `# ${state.userPrompt}`,
    "",
    `**Subject**: ${displaySubject}  |  **Difficulty**: ${state.difficulty || "intermediate"}  |  **Read time**: ${readTime} min`,
    "",
  ].join("\n");

  const footer = [
    "",
    "---",
    `*BlackLetter Intelligence Pipeline*`,
    `*Intent: ${state.intent} | Quality: ${state.qualityPassed ? "Passed" : "Needs improvement"}*`,
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

  log("NODE", `ReportNode: report=${report.length}ch`);
  return { formattedReport: report };
}
