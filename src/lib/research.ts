export type ResearchMode =
  | "quick-overview"
  | "student-study"
  | "deep-research"
  | "academic-research"
  | "business-analysis"
  | "legal-analysis"
  | "historical-analysis"
  | "scientific-analysis"
  | "technical-analysis"
  | "literature-review"
  | "quick-analysis"
  | "conceptual";

export interface ResearchConfig {
  mode: ResearchMode;
  topic: string;
  documents?: string[];
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
}

export interface Entity {
  id: string;
  type: "person" | "organization" | "concept" | "location" | "event";
  name: string;
  description: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
}

export interface ResearchNote {
  id: string;
  type: "fact" | "idea" | "question" | "definition" | "quote" | "number";
  content: string;
}

export interface Source {
  id: string;
  title: string;
  url?: string;
}

export interface ResearchResult {
  sections: ReportSection[];
  fullText: string;
  entities: Entity[];
  timeline: TimelineEvent[];
  notes: ResearchNote[];
  sources: Source[];
  followUpQuestions: string[];
}

export const RESEARCH_STAGES = [
  "Reviewing your brief",
  "Understanding your objective",
  "Identifying relevant subjects",
  "Checking for uploaded evidence",
  "Reviewing documents",
  "Loading your profile",
  "Mapping prerequisite knowledge",
  "Structuring the argument",
  "Assembling intelligence",
  "Reviewing output quality",
  "Organizing findings",
  "Preparing your docket",
];

export const MODE_LABELS: Record<ResearchMode, string> = {
  "quick-overview": "Brief",
  "student-study": "Study",
  "deep-research": "Comprehensive",
  "academic-research": "Scholarly",
  "business-analysis": "Strategic",
  "legal-analysis": "Jurisdiction",
  "historical-analysis": "Chronology",
  "scientific-analysis": "Empirical",
  "technical-analysis": "Specification",
  "literature-review": "Literature Review",
  "quick-analysis": "Brief",
  "conceptual": "Conceptual Framework",
};

export const MODE_DESCRIPTIONS: Record<ResearchMode, string> = {
  "quick-overview": "Concise overview focused on what matters",
  "student-study": "Structured materials with practice drills and reference sheets",
  "deep-research": "Thorough investigation across multiple sources and viewpoints",
  "academic-research": "Scholarly analysis with formal citations and methodology",
  "business-analysis": "Strategic assessment with market context and recommendations",
  "legal-analysis": "Statutory reasoning with precedent and jurisdictional notes",
  "historical-analysis": "Chronological narrative with causal relationships and context",
  "scientific-analysis": "Hypothesis-driven analysis with evidence chain and conclusions",
  "technical-analysis": "Architectural breakdown with specifications and tradeoffs",
  "literature-review": "Survey of key studies, findings, and open debates in the field",
  "quick-analysis": "Fast, high-signal overview with key insights and takeaways",
  "conceptual": "Theoretical foundations, frameworks, and conceptual relationships",
};

export function parseReportSections(text: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const lines = text.split("\n");
  let current: ReportSection | null = null;

  for (const line of lines) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      if (current) sections.push(current);
      current = { id: Math.random().toString(36).slice(2, 8), title: m[1].trim(), content: "" };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0 && text.trim()) {
    sections.push({ id: Math.random().toString(36).slice(2, 8), title: "Overview", content: text });
  }
  return sections;
}

export function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  const personRegex = /\*\*([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\*\*/g;
  let pm: RegExpExecArray | null;
  while ((pm = personRegex.exec(text)) !== null) {
    if (!entities.find((e) => e.name === pm![1])) {
      entities.push({ id: Math.random().toString(36).slice(2, 8), type: "person", name: pm![1], description: "" });
    }
  }
  const orgRegex = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:\s(?:Inc|Corp|Ltd|LLC|Organization|Institute|University|Company|Group|Committee|Agency|Bureau|Association)))/g;
  let om: RegExpExecArray | null;
  while ((om = orgRegex.exec(text)) !== null) {
    if (!entities.find((e) => e.name === om![1])) {
      entities.push({ id: Math.random().toString(36).slice(2, 8), type: "organization", name: om![1], description: "" });
    }
  }
  const conceptRegex = /\*\*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\*\*/g;
  let cm: RegExpExecArray | null;
  while ((cm = conceptRegex.exec(text)) !== null) {
    if (!entities.find((e) => e.name === cm![1])) {
      entities.push({ id: Math.random().toString(36).slice(2, 8), type: "concept", name: cm![1], description: "" });
    }
  }
  return entities;
}

export function extractTimeline(text: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const dateRegex = /(?:In|By|During|Around|Since|Until)\s+(\d{4}(?:\s*[-–]\s*\d{4})?)/gi;
  let tm: RegExpExecArray | null;
  while ((tm = dateRegex.exec(text)) !== null) {
    const snippet = text.slice(Math.max(0, tm!.index - 30), tm!.index + 80).replace(/\n/g, " ").trim();
    if (!events.find((e) => e.date === tm![1])) {
      events.push({
        id: Math.random().toString(36).slice(2, 8),
        date: tm![1],
        title: snippet.slice(0, 60) + (snippet.length > 60 ? "..." : ""),
        description: snippet,
      });
    }
  }
  return events;
}

export function extractNotes(text: string): ResearchNote[] {
  const notes: ResearchNote[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 60);
  const facts = lines.slice(0, 5);
  facts.forEach((f) => {
    notes.push({ id: Math.random().toString(36).slice(2, 8), type: "fact", content: f.replace(/^[#*\-\s]+/, "").trim() });
  });
  return notes;
}

export function extractFollowUpQuestions(text: string): string[] {
  const questions: string[] = [];
  const qRegex = /\?\s*$/gm;
  const sentences = text.split(/[.!]\s+/);
  for (const s of sentences) {
    if (qRegex.test(s.trim()) && questions.length < 6) {
      questions.push(s.trim().replace(/^\d+[\.\)]\s*/, ""));
    }
  }
  if (questions.length === 0) {
    questions.push(
      "What are the most significant implications of this topic?",
      "How does this compare to related developments?",
      "What are the primary areas of disagreement among experts?",
      "What recent developments have changed our understanding?",
      "What knowledge gaps remain in this field?",
    );
  }
  return questions;
}

export function buildSystemPrompt(mode: ResearchMode, topic: string, hasDocs: boolean, subject?: string): string {
  const modeInstructions: Record<ResearchMode, string> = {
    "quick-overview": "Provide a brief yet comprehensive overview. Cover key points, significance, and main takeaways. Use clear markdown headings for structure.",
    "student-study": "Create structured learning materials. Include definitions, core concepts, study questions, and a summary. Use markdown headings and bullet points for clarity.",
    "deep-research": "Conduct a thorough investigation. Present evidence, analysis, multiple perspectives, and conclusions. Use detailed markdown sections with subheadings.",
    "academic-research": "Write a scholarly analysis. Include methodology considerations, theoretical framework, evidence evaluation, and citations. Use formal academic structure with markdown headings.",
    "business-analysis": "Provide business-focused analysis. Cover market context, competitive landscape, strategic implications, risks, and recommendations. Use structured markdown sections.",
    "legal-analysis": "Present legal analysis. Cover relevant frameworks, precedents, jurisdictional considerations, and implications. Use structured legal format with markdown headings.",
    "historical-analysis": "Provide historical analysis. Cover chronological development, primary sources, key figures, and historiographical context. Use narrative structure with markdown headings.",
    "scientific-analysis": "Present scientific analysis. Cover methodology, data, evidence quality, peer-reviewed findings, and research implications. Use structured scientific format.",
    "technical-analysis": "Provide technical analysis. Cover specifications, implementation details, architectures, trade-offs, and practical considerations. Use structured markdown with code blocks.",
    "literature-review": "Provide a literature review. Survey the key studies, theories, findings, and debates in this field. Highlight schools of thought, methodological approaches, and research gaps. Use structured markdown headings.",
    "quick-analysis": "Provide a fast, high-signal analysis. Lead with the bottom line, cover the essential facts and trade-offs, and finish with clear takeaways. Keep it concise. Use markdown headings.",
    "conceptual": "Provide a conceptual framework. Map the theoretical foundations, define core concepts and their relationships, and build a clear mental model. Use structured markdown headings.",
  };

  const docInstruction = hasDocs
    ? "\n\nThe user has uploaded documents. Integrate insights from these documents into your analysis, citing them where relevant."
    : "";

  const subjectInstruction = subject
    ? `\n\nThe research subject is "${subject}". Tailor your analysis to this domain's conventions, terminology, and scholarly standards.`
    : "";

  return `You are a professional research assistant conducting research on: ${topic}

${modeInstructions[mode]}${docInstruction}${subjectInstruction}

Structure your response with the following markdown sections (use ## for each heading):
- Overview
- Background
- Core Concepts
- Detailed Analysis
- Supporting Evidence
- Counterarguments
- Open Questions
- Conclusion
- References

Be thorough, precise, and well-organized. Use bold for key terms and entities. Include specific dates, names, and factual details.`;
}

export function buildResearchPrompt(topic: string, hasDocs: boolean, subject?: string): string {
  const docPart = hasDocs
    ? "\n\nI have uploaded documents that contain relevant information. Please integrate them into your analysis."
    : "";
  return `Research the following topic thoroughly: ${topic}${docPart}

Provide a comprehensive, well-structured analysis using the requested format. Include specific facts, dates, names, and evidence throughout.`;
}
