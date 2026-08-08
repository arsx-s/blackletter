import type { GraphState } from "../types";
import { log } from "../logger";

const MIN_SECTION_LENGTH = 50;

function evaluateCompleteness(response: string): number {
  const sections = response.split(/\n#{1,3}\s/).length;
  if (sections >= 6) return 1;
  if (sections >= 4) return 0.8;
  if (sections >= 2) return 0.5;
  return 0.3;
}

function evaluateReadability(response: string): number {
  const lines = response.split("\n");
  const avgLineLen = lines.reduce((sum, l) => sum + l.length, 0) / Math.max(lines.length, 1);
  if (avgLineLen < 120) return 1;
  if (avgLineLen < 200) return 0.7;
  return 0.4;
}

function evaluateStructure(response: string): number {
  const hasHeadings = /^#{1,3}\s/m.test(response);
  const hasBullets = /^[-*]\s/m.test(response);
  const hasNumbers = /^\d+\./m.test(response);
  const hasExamples = /\b(example|for instance|e\.g\.|such as)\b/i.test(response);
  let score = 0;
  if (hasHeadings) score += 0.25;
  if (hasBullets) score += 0.2;
  if (hasNumbers) score += 0.15;
  if (hasExamples) score += 0.4;
  return Math.min(score, 1);
}

function evaluateEducationalValue(response: string): number {
  const hasLearningGoal = /\b(learn|understand|by the end|goal|objective)\b/i.test(response);
  const hasTakeaways = /\b(key takeaway|summary|recap|remember|conclusion)\b/i.test(response);
  const hasExamples = /\b(example|sample|demonstration|illustration)\b/i.test(response);
  const hasDefinitions = /\b(defined?|meaning|refers to|is a|are called)\b/i.test(response);
  let score = 0.2;
  if (hasLearningGoal) score += 0.2;
  if (hasTakeaways) score += 0.2;
  if (hasExamples) score += 0.2;
  if (hasDefinitions) score += 0.2;
  return score;
}

function evaluateFormatting(response: string): number {
  const codeBlocks = (response.match(/```/g) || []).length;
  const bold = (response.match(/\*\*/g) || []).length;
  const lists = (response.match(/^[-*]\s/gm) || []).length;
  let score = 0.4;
  if (codeBlocks >= 2) score += 0.2;
  if (bold >= 2) score += 0.2;
  if (lists >= 3) score += 0.2;
  return score;
}

export async function QualityNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "QualityNode: evaluating response quality");
  const response = state.aiResponse;

  if (response.length < MIN_SECTION_LENGTH) {
    log("NODE", "QualityNode: FAILED — response too short");
    return {
      qualityPassed: false,
      qualityScores: { completeness: 0, readability: 0, structure: 0, educational: 0, formatting: 0 },
      needsRegeneration: true,
    };
  }

  const scores = {
    completeness: evaluateCompleteness(response),
    readability: evaluateReadability(response),
    structure: evaluateStructure(response),
    educational: evaluateEducationalValue(response),
    formatting: evaluateFormatting(response),
  };

  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  const passed = overall >= 0.5;

  log("NODE", `QualityNode: ${passed ? "PASSED" : "FAILED"} (overall=${overall.toFixed(2)})`);
  return { qualityPassed: passed, qualityScores: scores, needsRegeneration: !passed };
}
