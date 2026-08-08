import type { GraphState } from "../types";
import { log } from "../logger";

const INTENT_PATTERNS: Array<{ intent: string; patterns: RegExp[] }> = [
  { intent: "teach", patterns: [/^(teach|learn|understand|what is|what are|explain|define|introduce)\b/i] },
  { intent: "research", patterns: [/\b(research|study|analyse?|investigate|explore|literature|paper|article)\b/i] },
  { intent: "summarize", patterns: [/\b(summarize|summary|recap|key point|brief|tl;dr|overview|digest)\b/i] },
  { intent: "analyze", patterns: [/\b(analyse?|evaluate|critique|examine|break down|deconstruct|reasoning)\b/i] },
  { intent: "compare", patterns: [/\b(compare|contrast|difference|similarit|vs\.?|versus|pro.?con|trade.?off)\b/i] },
  { intent: "quiz", patterns: [/\b(quiz|test|exam|practice question|assessment|mcq|multiple choice)\b/i] },
  { intent: "flashcards", patterns: [/\b(flashcard|card|anki|spaced repetition|review card)\b/i] },
  { intent: "study-plan", patterns: [/\b(study plan|curriculum|syllabus|s?chedule|roadmap|path|track|course)\b/i] },
  { intent: "assignment-help", patterns: [/\b(assignment|homework|problem set|exercise|solve|solution|due)\b/i] },
  { intent: "interview-prep", patterns: [/\b(interview|coding interview|behavioural|hr question|technical round)\b/i] },
  { intent: "roadmap", patterns: [/\b(roadmap|path|career|how to become|how to learn|learning path)\b/i] },
  { intent: "document-analysis", patterns: [/\b(document|uploaded|file|attachment|this (pdf|doc|file|paper))\b/i] },
  { intent: "debug", patterns: [/\b(debug|error|bug|issue|fix|broken|not working|crash|exception)\b/i] },
  { intent: "brainstorm", patterns: [/\b(brainstorm|idea|generat|suggest|creative|possibilit|alternative)\b/i] },
  { intent: "revision", patterns: [/\b(revise|revision|review|refresh|recap|remember|revisit|brush up)\b/i] },
  { intent: "followup", patterns: [/^(continue|go on|keep going|carry on|proceed|next)\b/i, /\b(explain further|elaborate|expand on|go deeper|dig deeper|more detail|further detail|in more depth|tell me more)\b/i, /\b(compare with (the )?previous|contrast with|vs\.? the previous|relation to the previous)\b/i, /^why\?$|^how\?$|^what next\?$|^explain$/i, /^(this|that|it|the previous topic)\b/i] },
];

export async function IntentNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "IntentNode: detecting intent");

  const query = state.userPrompt;
  const docHint = state.uploadedDocuments.length > 0;

  const scores: Array<{ intent: string; score: number }> = [];

  for (const entry of INTENT_PATTERNS) {
    let score = 0;
    for (const p of entry.patterns) {
      const matches = query.match(p);
      if (matches) score += matches.length;
    }
    if (score > 0) scores.push({ intent: entry.intent, score });
  }

  if (docHint) {
    const existing = scores.find((s) => s.intent === "document-analysis");
    if (existing) existing.score += 3;
    else scores.push({ intent: "document-analysis", score: 3 });
  }

  if (query.split(/\s+/).length <= 5 && !docHint) {
    const existing = scores.find((s) => s.intent === "teach");
    if (existing) existing.score += 1;
    else scores.push({ intent: "teach", score: 1 });
  }

  if (scores.length === 0) {
    log("NODE", "IntentNode: no patterns matched, defaulting to teach");
    return { intent: "teach", intentConfidence: 0.6 };
  }

  scores.sort((a, b) => b.score - a.score);
  const total = scores.reduce((s, r) => s + r.score, 0);
  const top = scores[0];
  const confidence = total > 0 ? top.score / total : 0.6;

  log("NODE", `IntentNode: intent=${top.intent}, confidence=${confidence.toFixed(2)}`);
  return { intent: top.intent, intentConfidence: confidence };
}
