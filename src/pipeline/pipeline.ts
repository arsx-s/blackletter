import type { PipelineContext, PipelineInput, PipelineResult, StageTiming } from "./types";
import { getReadableError, logError } from "../lib/error-utils";
import { devLog } from "../lib/dev-log";
import { executeUserInput } from "./userInput";
import { executeIntent } from "./intentEngine";
import { executeSubject } from "./subjectEngine";
import { executeDecision } from "./decisionNode";
import { executeDocument } from "./documentEngine";
import { executeLearningProfile } from "./learningProfile";
import { executeKnowledgeGap } from "./knowledgeGap";
import { executePromptBuilder } from "./promptBuilder";
import { executeLLM } from "./llmExecutor";
import { executeQualityCheck } from "./qualityChecker";
import { executeFormatter } from "./formatter";
import { executeReportGenerator } from "./reportGenerator";

function timing(name: string): StageTiming {
  return { name, startMs: performance.now(), endMs: 0, durationMs: 0, status: "success" };
}

function finish(t: StageTiming, status: StageTiming["status"], error?: string): StageTiming {
  t.endMs = performance.now();
  t.durationMs = Math.round(t.endMs - t.startMs);
  t.status = status;
  if (error) t.error = error;
  return t;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  devLog(`[PIPELINE] runPipeline called: prompt="${input.prompt}", files=${input.files?.length || 0}, subject=${input.subject}, mode=${input.mode}`);
  const ctx: PipelineContext = {
    input,
    timing: [],
    normalizedPrompt: "",
    intent: "teach",
    intentConfidence: 0.6,
    difficulty: "intermediate",
    primarySubject: "general",
    subjectConfidence: 0,
    allSubjects: [],
    hasDocuments: !!(input.files && input.files.length > 0),
    documentText: "",
    documentChars: 0,
    documentWords: 0,
    documentLanguage: "en",
    documentHeadings: [],
    documentKeywords: [],
    documentConcepts: [],
    documentObjectives: [],
    documentError: null,
    learnerProfile: null,
    prerequisites: [],
    missingPrerequisites: [],
    knowledgeGapDirective: "",
    prompt: "",
    systemInstruction: "",
    promptSize: 0,
    response: "",
    aiLatency: 0,
    retryCount: 0,
    qualityPassed: false,
    qualityScores: {},
    needsRegeneration: false,
    formattedSections: [],
    finalReport: "",
  };

  const stageResults: StageTiming[] = [];

  /* ── Stage 1: User Input ── */
  const t1 = timing("user-input");
  devLog(`[PIPELINE] Stage 1: user-input`);
  try {
    const r = await executeUserInput(ctx);
    ctx.normalizedPrompt = r.normalizedQuery;
    stageResults.push(finish(t1, "success"));
    devLog(`[PIPELINE] Stage 1 OK: normalizedPrompt="${ctx.normalizedPrompt}"`);
  } catch (e) {
    const msg = (e as { code?: string; message?: string }).message || getReadableError(e);
    stageResults.push(finish(t1, "error", msg));
    console.error(`[PIPELINE] Stage 1 FAIL: ${msg}`);
    ctx.timing = stageResults;
    return buildErrorResult(ctx, msg);
  }

  /* ── Stage 2: Intent Detection ── */
  const t2 = timing("intent-detection");
  devLog(`[PIPELINE] Stage 2: intent-detection`);
  try {
    const r = await executeIntent(ctx);
    ctx.intent = r.intent;
    ctx.intentConfidence = r.confidence;
    stageResults.push(finish(t2, "success"));
    devLog(`[PIPELINE] Stage 2 OK: intent=${ctx.intent}, confidence=${ctx.intentConfidence}`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t2, "error", msg));
    ctx.intent = "teach";
    console.error(`[PIPELINE] Stage 2 FAIL: ${msg}, fallback intent=teach`);
  }

  /* ── Stage 3: Subject Detection ── */
  const t3 = timing("subject-detection");
  devLog(`[PIPELINE] Stage 3: subject-detection`);
  try {
    const r = await executeSubject(ctx);
    ctx.primarySubject = r.primary;
    ctx.subjectConfidence = r.confidence;
    ctx.allSubjects = r.all;
    stageResults.push(finish(t3, "success"));
    devLog(`[PIPELINE] Stage 3 OK: subject=${ctx.primarySubject}, confidence=${ctx.subjectConfidence}`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t3, "error", msg));
    console.error(`[PIPELINE] Stage 3 FAIL: ${msg}`);
  }

  /* ── Stage 4: Decision Node ── */
  const t4 = timing("decision-node");
  devLog(`[PIPELINE] Stage 4: decision-node`);
  let runDocEngine = false;
  try {
    const r = await executeDecision(ctx);
    runDocEngine = r.runDocumentEngine;
    stageResults.push(finish(t4, "success"));
    devLog(`[PIPELINE] Stage 4 OK: runDocumentEngine=${runDocEngine}`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t4, "error", msg));
    console.error(`[PIPELINE] Stage 4 FAIL: ${msg}`);
  }

  /* ── Stage 5: Document Engine (conditional) ── */
  devLog(`[PIPELINE] Stage 5: document-engine (${runDocEngine ? "running" : "skipped"})`);
  if (runDocEngine) {
    const t5 = timing("document-engine");
    try {
      const r = await executeDocument(ctx);
      ctx.documentText = r.text;
      ctx.documentChars = r.chars;
      ctx.documentWords = r.words;
      ctx.documentLanguage = r.language;
      ctx.documentHeadings = r.headings;
      ctx.documentKeywords = r.keywords;
      ctx.documentConcepts = r.concepts;
      ctx.documentObjectives = r.objectives;
      ctx.documentError = r.error;
      stageResults.push(finish(t5, "success"));
      devLog(`[PIPELINE] Stage 5 OK: ${ctx.documentChars} chars, ${ctx.documentWords} words`);
    } catch (e) {
      const msg = (e as { code?: string; message?: string }).message || getReadableError(e);
      stageResults.push(finish(t5, "error", msg));
      ctx.documentError = msg;
      ctx.documentText = "";
      console.error(`[PIPELINE] Stage 5 FAIL: ${msg} — continuing with empty document text`);
    }
  } else {
    stageResults.push(finish(timing("document-engine"), "skipped"));
  }

  /* ── Stage 6: Learning Profile ── */
  const t6 = timing("learning-profile");
  devLog(`[PIPELINE] Stage 6: learning-profile`);
  try {
    const r = await executeLearningProfile(ctx);
    ctx.learnerProfile = r;
    stageResults.push(finish(t6, "success"));
    devLog(`[PIPELINE] Stage 6 OK: profile=${JSON.stringify(r ? { style: r.style, depth: r.depth } : null)}`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t6, "error", msg));
    console.error(`[PIPELINE] Stage 6 FAIL: ${msg}`);
  }

  /* ── Stage 7: Knowledge Gap ── */
  const t7 = timing("knowledge-gap");
  devLog(`[PIPELINE] Stage 7: knowledge-gap`);
  try {
    const r = await executeKnowledgeGap(ctx);
    ctx.prerequisites = r.prerequisites;
    ctx.missingPrerequisites = r.missingPrerequisites;
    ctx.knowledgeGapDirective = r.directive;
    stageResults.push(finish(t7, "success"));
    devLog(`[PIPELINE] Stage 7 OK: ${r.prerequisites.length} prerequisites`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t7, "error", msg));
    console.error(`[PIPELINE] Stage 7 FAIL: ${msg}`);
  }

  /* ── Stage 8: Prompt Builder ── */
  const t8 = timing("prompt-builder");
  devLog(`[PIPELINE] Stage 8: prompt-builder`);
  try {
    const r = await executePromptBuilder(ctx);
    ctx.prompt = r.prompt;
    ctx.systemInstruction = r.systemInstruction;
    ctx.promptSize = r.promptSize;
    stageResults.push(finish(t8, "success"));
    devLog(`[PIPELINE] Stage 8 OK: prompt=${r.promptSize}ch total (prompt=${ctx.prompt.length}ch, system=${ctx.systemInstruction.length}ch)`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t8, "error", msg));
    console.error(`[PIPELINE] Stage 8 FAIL: ${msg}`);
    ctx.timing = stageResults;
    return buildErrorResult(ctx, msg);
  }

  /* ── Stage 9: LLM Executor ── */
  const t9 = timing("llm-executor");
  devLog(`[PIPELINE] Stage 9: llm-executor — calling AI`);
  try {
    const r = await executeLLM(ctx);
    ctx.response = r.response;
    ctx.aiLatency = r.latency;
    ctx.retryCount = r.retryCount;
    stageResults.push(finish(t9, "success"));
    devLog(`[PIPELINE] Stage 9 OK: response=${ctx.response.length}ch, latency=${r.latency}ms, retries=${r.retryCount}`);
  } catch (e) {
    const msg = (e as { code?: string; message?: string }).message || getReadableError(e);
    stageResults.push(finish(t9, "error", msg));
    console.error(`[PIPELINE] Stage 9 FAIL: ${msg}`);
    ctx.timing = stageResults;
    return buildErrorResult(ctx, msg);
  }

  /* ── Stage 10: Quality Checker ── */
  const t10 = timing("quality-checker");
  devLog(`[PIPELINE] Stage 10: quality-checker`);
  try {
    const r = await executeQualityCheck(ctx);
    ctx.qualityPassed = r.passed;
    ctx.qualityScores = r.scores;
    ctx.needsRegeneration = r.needsRegeneration;
    stageResults.push(finish(t10, "success"));
    devLog(`[PIPELINE] Stage 10 OK: passed=${r.passed}, scores=${JSON.stringify(r.scores)}`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t10, "error", msg));
    console.error(`[PIPELINE] Stage 10 FAIL: ${msg}`);
  }

  /* ── Stage 11: Formatter ── */
  const t11 = timing("formatter");
  devLog(`[PIPELINE] Stage 11: formatter`);
  try {
    const r = await executeFormatter(ctx);
    ctx.formattedSections = r.sections;
    stageResults.push(finish(t11, "success"));
    devLog(`[PIPELINE] Stage 11 OK: ${r.sections.length} sections parsed`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t11, "error", msg));
    console.error(`[PIPELINE] Stage 11 FAIL: ${msg}`);
  }

  /* ── Stage 12: Report Generator ── */
  const t12 = timing("report-generator");
  devLog(`[PIPELINE] Stage 12: report-generator`);
  try {
    const r = await executeReportGenerator(ctx);
    ctx.finalReport = r.report;
    ctx.formattedSections = r.sections;
    stageResults.push(finish(t12, "success"));
    devLog(`[PIPELINE] Stage 12 OK: report=${ctx.finalReport.length}ch, ${ctx.formattedSections.length} sections`);
  } catch (e) {
    const msg = (e as { message?: string }).message || getReadableError(e);
    stageResults.push(finish(t12, "error", msg));
    console.error(`[PIPELINE] Stage 12 FAIL: ${msg}`);
  }

  ctx.timing = stageResults;

  devLog(`[PIPELINE] Pipeline complete: response=${ctx.finalReport.length || ctx.response.length}ch, ${ctx.formattedSections.length} sections`);
  return {
    response: ctx.finalReport || ctx.response || "",
    sections: ctx.formattedSections,
    timing: stageResults,
    intent: ctx.intent,
    subject: ctx.primarySubject,
    difficulty: ctx.difficulty || "intermediate",
    retryCount: ctx.retryCount,
    aiLatency: ctx.aiLatency,
    qualityPassed: ctx.qualityPassed,
    qualityScores: ctx.qualityScores,
    documentAnalyzed: ctx.documentText.length > 0,
    documentError: ctx.documentError,
  };
}

function buildErrorResult(ctx: PipelineContext, errorMessage: string): PipelineResult {
  return {
    response: "",
    sections: [],
    timing: ctx.timing,
    intent: ctx.intent,
    subject: ctx.primarySubject,
    difficulty: ctx.difficulty || "intermediate",
    retryCount: 0,
    aiLatency: 0,
    qualityPassed: false,
    qualityScores: {},
    documentAnalyzed: false,
    documentError: errorMessage,
  };
}
