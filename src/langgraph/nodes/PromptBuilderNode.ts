import type { GraphState } from "../types";
import { log } from "../logger";

const MAX_DOCUMENT_CHARS = 40000;
const MAX_KNOWLEDGE_CHARS = 8000;
const MAX_MEMORY_CHARS = 4000;
const MAX_EVIDENCE_CHUNKS = 15;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 600;

function truncate(text: string, max: number, label: string): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[... ${label} truncated; ${text.length - max} characters omitted for context budget]`;
}

const INTENT_MODE: Record<string, string> = {
  teach: "teach", research: "research", summarize: "teach", analyze: "analyze",
  compare: "compare", quiz: "teach", flashcards: "teach", "study-plan": "plan",
  "assignment-help": "analyze", "interview-prep": "teach",
  roadmap: "plan", "document-analysis": "research",
  debug: "analyze", brainstorm: "research", revision: "teach",
};

const MODE_LABELS: Record<string, string> = {
  visual: "Visual Thinking", story: "Story Mode", analogy: "Analogy Mode",
  technical: "Technical Deep Dive", beginner: "Beginner Friendly",
  exam: "Exam Preparation", interview: "Interview Preparation",
  research: "Research Mode",
};

const RESEARCH_MODE_LABELS: Record<string, string> = {
  "deep-research": "Deep Research",
  "literature-review": "Literature Review",
  "quick-analysis": "Quick Analysis",
  "conceptual": "Conceptual Framework",
  "quick-overview": "Brief",
  "student-study": "Study",
  "academic-research": "Scholarly Analysis",
  "business-analysis": "Business Analysis",
  "legal-analysis": "Legal Analysis",
  "historical-analysis": "Historical Analysis",
  "scientific-analysis": "Scientific Analysis",
  "technical-analysis": "Technical Analysis",
};

const DIFFICULTY_DESC: Record<string, string> = {
  beginner: "Assume ZERO prior knowledge. Use simple language, avoid jargon.",
  intermediate: "Assume basic familiarity. Define specialized terms.",
  advanced: "Assume solid foundation. Focus on nuances and trade-offs.",
  university: "Undergraduate level. Include formal definitions and derivations.",
  graduate: "Graduate level. Cover state-of-the-art and open questions.",
  professional: "Industry level. Focus on practical implementation and best practices.",
  research: "Research level. Include mathematical formalisms and recent literature.",
};

export async function PromptBuilderNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "PromptBuilderNode: building prompt from graph state");

  const subject = state.subject;
  const difficulty = state.difficulty || "intermediate";
  const profile = state.learnerProfile;
  const modeLabel = MODE_LABELS[state.intent] || "Adaptive Explanation";
  const diffDesc = DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC.intermediate;
  const researchMode = state.researchMode ? (RESEARCH_MODE_LABELS[state.researchMode] || state.researchMode) : null;

  const parts: string[] = [];
  parts.push(`TEACHING MODE: ${modeLabel}`);
  parts.push(`DIFFICULTY LEVEL: ${difficulty}`);
  parts.push(`DIFFICULTY GUIDELINES: ${diffDesc}`);

  if (researchMode) {
    parts.push(`RESEARCH MODE: ${researchMode}`);
  }

  if (subject !== "general" && subject !== null) {
    parts.push(`SUBJECT: ${subject.replace(/-/g, " ")}`);
  }

  if (profile) {
    const notes: string[] = [];
    if (profile.analogies) notes.push("Use analogies to connect new concepts to familiar ideas");
    if (profile.examples > 0) notes.push(`Include ${profile.examples}+ concrete examples`);
    if (profile.weakConcepts.length > 0) notes.push(`Learner struggles with: ${profile.weakConcepts.join(", ")}. Explain these carefully.`);
    if (notes.length > 0) parts.push(`LEARNER PREFERENCES: ${notes.join(". ")}.`);
  }

  if (state.knowledgeGaps.directive) {
    parts.push(`PREREQUISITE GUIDANCE: ${state.knowledgeGaps.directive}`);
  }

  if (state.knowledgeContext) {
    parts.push("KNOWLEDGE GRAPH CONTEXT:\n" + truncate(state.knowledgeContext, MAX_KNOWLEDGE_CHARS, "knowledge graph"));
  }

  const recentHistory = state.conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  if (recentHistory.length > 0) {
    const lines = recentHistory.map((m) => `[${m.role === "user" ? "USER" : "ASSISTANT"}]: ${m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS)}`);
    parts.push("PREVIOUS EXCHANGE:\n" + lines.join("\n"));
  }

  if (state.memoryContext) {
    parts.push("RESEARCH MEMORY:\n" + truncate(state.memoryContext, MAX_MEMORY_CHARS, "memory"));
  }

  if (state.canvasContext && state.canvasContext.trim().length > 80) {
    parts.push("CANVAS CONTEXT (blocks on the research canvas):\n" + state.canvasContext);
  }

  const evidence = state.retrievedChunks || [];
  if (evidence.length > 0) {
    const evidenceLines = evidence.slice(0, MAX_EVIDENCE_CHUNKS).map((c, i) => `[${i + 1}] <source: ${c.source}> ${c.text.slice(0, 500)}`);
    parts.push(`RETRIEVED EVIDENCE (ground your factual claims in these where possible, and cite the source name inline e.g. (per ${evidence[0].source})):\n${evidenceLines.join("\n")}`);
  }

  const outputStructure = `OUTPUT STRUCTURE:
1. OBJECTIVE — What the learner will understand after this
2. FOUNDATION — Prerequisite knowledge required
3. PRINCIPLES — The core concepts
4. ARGUMENT — Step-by-step breakdown
5. DEMONSTRATIONS — Concrete, worked examples (${profile?.examples || 3}+)
6. VERDICT — Bullet summary of what was learned
7. PITFALLS — Edge cases and common errors
8. DRILL — A problem to solve
9. REFERENCES — Where to go next`;

  parts.push(outputStructure);
  parts.push(`QUALITY RULES:
- Every response must be self-contained. Do not assume prior context.
- Define every technical term the first time it appears.
- Use headings and subheadings to organize content.
- Use bullet points for lists, numbered steps for procedures.
- Include at least one concrete example.
- Break content into digestible sections. No walls of text.`);

  const systemInstruction = `You are BlackLetter, an intelligence layer — NOT a chatbot.
You are an adaptive reasoning engine. Follow the TEACHING MODE and DIFFICULTY LEVEL exactly.
Adapt to the learner's profile preferences.
Structure your response according to the OUTPUT STRUCTURE.
Follow all QUALITY RULES.
${subject !== "general" ? `You are teaching ${subject.replace(/-/g, " ")}. Ensure accuracy for this domain.` : ""}
${state.documentText ? `CRITICAL: An uploaded document is the topic. Teach its contents. Do not treat the user's typed message as the subject.` : ""}
${(state.retrievedChunks || []).length > 0 ? `GROUNDING RULE: When RETRIEVED EVIDENCE is present, base factual claims on it and cite the source name inline where used. Never invent specifics that contradict the retrieved evidence; if evidence is missing, say so and label the point as inferred.` : ""}
${state.memoryContext ? "CONTINUITY RULE: This session has prior research in this workspace (RESEARCH MEMORY + PREVIOUS EXCHANGE). Build on it, avoid repeating what was already covered, and explicitly connect answers to earlier topics when the query references them." : ""}`;

  const userPrompt = `${state.documentText ? `--- DOCUMENT CONTENT ---\n${truncate(state.documentText, MAX_DOCUMENT_CHARS, "document")}\n--- END DOCUMENT ---\n\n` : ""}Query: ${state.userPrompt}

${parts.join("\n\n")}`;

  const promptSize = userPrompt.length + systemInstruction.length;
  log("NODE", `PromptBuilderNode: prompt=${userPrompt.length}ch, system=${systemInstruction.length}ch, total=${promptSize}ch`);

  return {
    generatedPrompt: userPrompt,
    systemInstruction: systemInstruction.trim(),
  };
}
