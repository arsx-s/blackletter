/**
 * Pipeline trace + live event emitter.
 *
 * Every run records a structured trace (stages with timings) which is
 * persisted on the run result for the trace viewer. A lightweight event
 * emitter broadcasts live stage transitions so Developer Mode can render the
 * pipeline in real time without coupling to React state.
 */

export const PIPELINE_STAGES = [
  "Intent",
  "Subject",
  "Retrieval",
  "Scoring",
  "Prompt",
  "OpenRouter",
  "Evaluation",
  "Formatting",
  "Response",
] as const;

export type TraceStageId =
  | "intent"
  | "subject"
  | "router"
  | "document"
  | "profile"
  | "gaps"
  | "retrieval"
  | "scoring"
  | "prompt"
  | "openrouter"
  | "quality"
  | "evaluation"
  | "formatting"
  | "report"
  | "response";

export type TraceStatus = "running" | "success" | "skipped" | "error";

export interface TraceStage {
  id: TraceStageId;
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: TraceStatus;
  data?: Record<string, unknown>;
  error?: string;
}

export interface PipelineTelemetry {
  runId: string;
  workspaceId: string;
  tabId: string;
  query: string;
  model: string;
  startedAt: number;
  finishedAt: number;
  totalMs: number;
  retrievalMs: number;
  generationMs: number;
  tokensIn: number;
  tokensOut: number;
  confidence: number | null;
  faithfulness: number | null;
  retrievedChunks: number;
  groundedSources: number;
  errorCode?: string;
}

export interface PipelineEvent {
  runId: string;
  stageId: TraceStageId;
  stageName: string;
  status: TraceStage["status"];
  atMs: number;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

export type PipelineEventCallback = (event: PipelineEvent) => void;

const listeners = new Set<PipelineEventCallback>();
export const LAST_EVENTS: PipelineEvent[] = [];
const MAX_EVENTS = 200;

export function onPipelineEvent(cb: PipelineEventCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(event: PipelineEvent): void {
  LAST_EVENTS.push(event);
  if (LAST_EVENTS.length > MAX_EVENTS) LAST_EVENTS.shift();
  for (const cb of listeners) {
    try {
      cb(event);
    } catch {
      /* listener errors are non-fatal */
    }
  }
}

export class Trace {
  readonly runId: string;
  readonly stages: TraceStage[] = [];
  private readonly byId = new Map<TraceStageId, TraceStage>();
  private startedAt = performance.now();

  constructor(runId: string) {
    this.runId = runId;
  }

  private ensure(id: TraceStageId, name: string): TraceStage {
    let stage = this.byId.get(id);
    if (!stage) {
      stage = { id, name, startMs: performance.now(), endMs: 0, durationMs: 0, status: "running" };
      this.byId.set(id, stage);
      this.stages.push(stage);
    }
    return stage;
  }

  start(id: TraceStageId, name: string): void {
    const stage = this.ensure(id, name);
    stage.startMs = performance.now();
    stage.status = "running";
  }

  end(id: TraceStageId, data?: Record<string, unknown>): void {
    const stage = this.byId.get(id);
    if (!stage) return;
    const endMs = performance.now();
    stage.endMs = endMs;
    stage.durationMs = Math.round(endMs - stage.startMs);
    stage.status = "success";
    stage.data = data;
    emit({
      runId: this.runId,
      stageId: id,
      stageName: stage.name,
      status: "success",
      atMs: endMs,
      durationMs: stage.durationMs,
      detail: data,
    });
  }

  skip(id: TraceStageId, detail?: Record<string, unknown>): void {
    const stage = this.ensure(id, stageNameFor(id));
    stage.status = "skipped";
    stage.endMs = performance.now();
    stage.data = detail;
  }

  fail(id: TraceStageId, error?: string): void {
    const stage = this.byId.get(id);
    if (!stage) return;
    const endMs = performance.now();
    stage.endMs = endMs;
    stage.durationMs = Math.round(endMs - stage.startMs);
    stage.status = "error";
    stage.error = error;
    emit({ runId: this.runId, stageId: id, stageName: stage.name, status: "error", atMs: endMs, durationMs: stage.durationMs });
  }

  totalMs(): number {
    return Math.round(performance.now() - this.startedAt);
  }
}

export function stageNameFor(id: TraceStageId): string {
  const names: Record<TraceStageId, string> = {
    intent: "Intent",
    subject: "Subject",
    router: "Router",
    document: "Document",
    profile: "Learning Profile",
    gaps: "Knowledge Gaps",
    retrieval: "Retrieval",
    scoring: "Scoring",
    prompt: "Prompt",
    openrouter: "OpenRouter",
    quality: "Quality",
    evaluation: "Evaluation",
    formatting: "Formatting",
    report: "Report",
    response: "Response",
  };
  return names[id] || id;
}