import type { PipelineContext, PipelineResult, StageTiming } from "./types";

export interface DevModeSnapshot {
  stages: StageTiming[];
  context: Partial<PipelineContext>;
  totalTimeMs: number;
}

export function formatDevMode(data: DevModeSnapshot): string {
  const lines: string[] = [];

  lines.push("=== BlackLetter Pipeline Developer Mode ===");
  lines.push(`Total time: ${data.totalTimeMs}ms`);
  lines.push("");

  if (data.stages.length === 0) {
    lines.push("No stages executed.");
    return lines.join("\n");
  }

  const maxNameLen = Math.max(...data.stages.map((s) => s.name.length), 10);
  lines.push("Pipeline execution order:");
  for (let i = 0; i < data.stages.length; i++) {
    const s = data.stages[i];
    const icon = s.status === "success" ? "OK" : s.status === "error" ? "FAIL" : "SKIP";
    const time = s.durationMs > 0 ? `${s.durationMs}ms` : "   -";
    lines.push(`  ${i + 1}. ${s.name.padEnd(maxNameLen)} ${icon.padEnd(5)} ${time}`);
    if (s.error) lines.push(`     ERROR: ${s.error}`);
  }

  const ctx = data.context;
  lines.push("");

  const meta: string[] = [];
  if (ctx.normalizedPrompt) meta.push(`Query: ${ctx.normalizedPrompt}`);
  if (ctx.intent) meta.push(`Intent: ${ctx.intent} (${(ctx.intentConfidence! * 100).toFixed(0)}%)`);
  if (ctx.primarySubject) meta.push(`Subject: ${ctx.primarySubject} (${(ctx.subjectConfidence! * 100).toFixed(0)}%)`);
  if (ctx.difficulty) meta.push(`Difficulty: ${ctx.difficulty}`);
  if (ctx.learnerProfile) meta.push(`Style: ${ctx.learnerProfile.style}`);
  if (ctx.documentText !== undefined && ctx.documentText.length > 0) meta.push(`Doc chars: ${ctx.documentChars}, words: ${ctx.documentWords}, lang: ${ctx.documentLanguage}`);
  if (ctx.prerequisites && ctx.prerequisites.length > 0) meta.push(`Prereqs: ${ctx.prerequisites.join(", ")}`);
  if (ctx.promptSize) meta.push(`Prompt size: ${ctx.promptSize} chars`);
  if (ctx.aiLatency) meta.push(`AI latency: ${ctx.aiLatency}ms`);
  if (ctx.retryCount) meta.push(`Retries: ${ctx.retryCount}`);
  if (ctx.qualityPassed !== undefined) meta.push(`Quality: ${ctx.qualityPassed ? "PASS" : "FAIL"}`);
  if (ctx.documentError) meta.push(`Doc error: ${ctx.documentError}`);

  if (meta.length > 0) {
    lines.push("Metadata:");
    for (const m of meta) lines.push(`  ${m}`);
  }

  return lines.join("\n");
}

export function snapshotDevMode(result: PipelineResult, ctx?: Partial<PipelineContext>): DevModeSnapshot {
  const totalTimeMs = result.timing.reduce((sum, t) => sum + t.durationMs, 0);
  return { stages: result.timing, context: ctx || {}, totalTimeMs };
}
