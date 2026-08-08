import { tokenize } from "../pipeline/scoring";

/**
 * True research memory — not chat history. Per-workspace accumulated
 * knowledge (documents, questions, answers, concepts, goals, gaps) that is
 * injected into future prompts and survives refresh.
 */

export interface MemoryEntry {
  q: string;
  a: string;
  at: number;
  concepts: string[];
  confidence?: number;
}

export interface WorkspaceMemory {
  goals: string[];
  concepts: string[];
  gaps: string[];
  entries: MemoryEntry[];
  updatedAt: number;
}

export function emptyMemory(): WorkspaceMemory {
  return { goals: [], concepts: [], gaps: [], entries: [], updatedAt: 0 };
}

const FOLLOWUP_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "continue", re: /^(continue|go on|keep going|carry on|proceed|next|more)\b/i },
  { label: "elaborate", re: /\b(explain further|elaborate|expand on|go deeper|more detail|further detail|dig deeper|in more depth)\b/i },
  { label: "compare", re: /\b(compare (with|to)|contrast with|versus|vs\.?\s+the|how does.*relate|in relation to the previous)\b/i },
  { label: "clarify", re: /^why$|^how$|^what do you mean\b|not clear|i don'?t understand|rephrase|simpler/ },
  { label: "summary", re: /\b(summarize|summary|recap|in short|in brief)\b/ },
  { label: "examples", re: /\b(example|examples|illustrate|for instance|concrete case)\b/ },
];

export interface FollowupResolution {
  isFollowup: boolean;
  kind: string;
  prompt: string;
  subjectHint: string | null;
}

/**
 * Detect whether a prompt is a follow-up/continuation and resolve enough
 * context so the pipeline treats it as research on the previous topic.
 */
export function resolveFollowup(prompt: string, memory: WorkspaceMemory, latestTopic?: string | null): FollowupResolution {
  const clean = prompt.trim();
  if (!clean) return { isFollowup: false, kind: "", prompt: clean, subjectHint: null };

  let kind = "";
  let subjectHint: string | null = null;
  const matched = FOLLOWUP_PATTERNS.find((p) => p.re.test(clean));
  if (matched) {
    kind = matched.label;
  }

  const prior = latestTopic && latestTopic !== clean ? latestTopic : memory.entries.length ? memory.entries[memory.entries.length - 1].q : null;
  const topicRef = /\b(this|the previous topic|that|it|the last one|above|the prior)\b/i.test(clean);

  if ((kind && prior) || (kind && topicRef && prior) || (clean.split(/\s+/).length <= 6 && prior && kind)) {
    subjectHint = prior;
  }

  let resolved = clean;
  if (subjectHint) {
    resolved = `${clean}\n\n[CONTEXT] This continues the previous research topic: "${subjectHint}". Connect to it explicitly where relevant.`;
  }

  return { isFollowup: Boolean(kind) || Boolean(subjectHint), kind, prompt: resolved, subjectHint };
}

export function extractConcepts(text: string): string[] {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const concepts = [...freq.entries()]
    .filter(([t]) => t.length > 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
  // prefer capitalized phrase-ish terms from the text
  const headings = text.match(/^##\s+(.+)$/gm) || [];
  const headingTerms = headings.map((h) => h.replace(/^##\s+/, "").trim());
  return [...new Set([...headingTerms, ...concepts])].slice(0, 8);
}

export function extractGoals(prompt: string): string[] {
  const goals: string[] = [];
  if (/\b(learn|understand|master|study)\b/i.test(prompt)) goals.push(prompt.trim().slice(0, 160));
  if (/\b(research|investigate|analyze)\b/i.test(prompt)) goals.push(`Research: ${prompt.trim().slice(0, 160)}`);
  return goals.slice(0, 6);
}

export function extractGaps(answer: string): string[] {
  const gaps: string[] = [];
  const qMatch = answer.match(/\b(?:further|open|interesting|remaining)\s*(?:questions?|areas?|topics?)\b[^.\n]*(?:[?.])?/gi);
  if (qMatch) gaps.push(...qMatch.slice(0, 6));
  const clashRace = answer.match(/[A-Z][^.\n]{10,}?\?/g);
  if (clashRace) gaps.push(...clashRace.slice(0, 3));
  return [...new Set(gaps.map((g) => g.trim()).filter(Boolean))].slice(0, 6);
}

function summarize(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

export function rememberExchange(memory: WorkspaceMemory, q: string, a: string, goalHint?: string): WorkspaceMemory {
  const next: WorkspaceMemory = {
    ...memory,
    concepts: dedupe([...memory.concepts, ...extractConcepts(a)]).slice(0, 24),
    goals: dedupe([...memory.goals, ...(goalHint ? [goalHint] : extractGoals(q))]).slice(0, 12),
    gaps: dedupe([...memory.gaps, ...extractGaps(a)]).slice(0, 12),
    entries: [...memory.entries, { q, a: summarize(a), at: Date.now(), concepts: extractConcepts(a) }].slice(-40),
    updatedAt: Date.now(),
  };

  return next;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

export function formatMemoryContext(memory: WorkspaceMemory): string {
  const parts: string[] = [];
  if (memory.entries.length) {
    const recent = memory.entries.slice(-6);
    parts.push("PAST RESEARCH IN THIS WORKSPACE (use as background; stay consistent with earlier findings unless the user asks to revisit):");
    for (const e of recent) {
      parts.push(`- Q: ${e.q}\n  A: ${e.a}`);
    }
  }
  if (memory.goals.length) parts.push(`RESEARCH GOALS: ${memory.goals.join("; ")}`);
  if (memory.concepts.length) parts.push(`CONCEPTS ALREADY EXPLORED: ${memory.concepts.join(", ")}`);
  if (memory.gaps.length) parts.push(`KNOWN KNOWLEDGE GAPS: ${memory.gaps.join("; ")}`);
  return parts.join("\n\n");
}