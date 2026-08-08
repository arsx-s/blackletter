import type { PipelineContext } from "./types";

const PREREQUISITE_MAP: Record<string, string[]> = {
  "neural network": ["linear algebra", "calculus", "probability", "python"],
  "machine learning": ["statistics", "linear algebra", "python", "probability"],
  "deep learning": ["machine learning", "neural networks", "calculus", "linear algebra"],
  "transformer": ["deep learning", "attention mechanism", "nlp", "linear algebra"],
  "llm": ["transformer", "deep learning", "nlp", "probability"],
  "large language model": ["transformer", "deep learning", "nlp", "probability"],
  "graph neural network": ["graphs", "matrices", "linear algebra", "machine learning"],
  "reinforcement learning": ["probability", "markov decision process", "dynamic programming"],
  "calculus": ["algebra", "trigonometry", "functions"],
  "linear algebra": ["algebra", "matrices"],
  "quantum computing": ["linear algebra", "quantum mechanics", "complex numbers"],
  "cryptography": ["number theory", "probability", "abstract algebra"],
  "data structures": ["programming", "basic algorithms"],
  "algorithms": ["data structures", "mathematics", "logic"],
  "computer vision": ["neural networks", "linear algebra", "calculus", "python"],
  "nlp": ["machine learning", "probability", "linguistics"],
  "natural language processing": ["machine learning", "probability", "linguistics"],
  "blockchain": ["cryptography", "distributed systems", "data structures"],
  "docker": ["linux", "command line", "virtualization"],
  "kubernetes": ["docker", "networking", "distributed systems"],
  "react": ["javascript", "html", "css", "web fundamentals"],
  "python": ["programming fundamentals", "basic algorithms"],
  "javascript": ["programming fundamentals", "html", "css"],
  "sql": ["data basics", "sets", "logic"],
};

function findMatchingPrereqs(query: string, docText: string): string[] {
  const lc = (query + " " + docText).toLowerCase();
  const found = new Set<string>();
  for (const [topic, prereqs] of Object.entries(PREREQUISITE_MAP)) {
    if (lc.includes(topic)) {
      for (const p of prereqs) found.add(p);
    }
  }
  return Array.from(found);
}

export interface KnowledgeGapResult {
  prerequisites: string[];
  missingPrerequisites: string[];
  directive: string;
}

export async function executeKnowledgeGap(ctx: PipelineContext): Promise<KnowledgeGapResult> {
  const docText = ctx.documentText || "";
  const prerequisites = findMatchingPrereqs(ctx.normalizedPrompt, docText);

  if (prerequisites.length > 0) {
    const directive = `This topic requires understanding of: ${prerequisites.join(", ")}. If the learner is unfamiliar with these, briefly explain each prerequisite before teaching the main topic.`;
    return { prerequisites, missingPrerequisites: prerequisites, directive };
  }

  return { prerequisites: [], missingPrerequisites: [], directive: "" };
}
