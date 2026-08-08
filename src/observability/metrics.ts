/**
 * Observability: per-run telemetry and error logs.
 *
 * Records persist in IndexedDB (via lib/db) with a rolling cap, independent
 * of the workspace store, so Developer Mode / System Status have history
 * across refreshes.
 */

import { kvGet, kvPut, kvDelete } from "../lib/db";

export interface RunRecord {
  runId: string;
  at: number;
  workspaceId: string;
  tabId: string;
  query: string;
  model: string;
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

export interface ErrorRecord {
  id: string;
  at: number;
  code: string;
  message: string;
  runId?: string;
  workspaceId: string;
  tabId?: string;
  stack?: string;
}

const RUNS_KEY = "observability-runs";
const ERRORS_KEY = "observability-errors";
const MAX_RUNS = 1200;
const MAX_ERRORS = 500;

let runsCache: RunRecord[] | null = null;
let errorsCache: ErrorRecord[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeObservability(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRuns(): RunRecord[] {
  return runsCache || [];
}

export function getErrors(): ErrorRecord[] {
  return errorsCache || [];
}

export async function loadObservability(): Promise<void> {
  const [runs, errors] = await Promise.all([
    kvGet<RunRecord[]>(RUNS_KEY),
    kvGet<ErrorRecord[]>(ERRORS_KEY),
  ]);
  runsCache = runs || [];
  errorsCache = errors || [];
  notify();
}

function persistRuns(): void {
  void kvPut(RUNS_KEY, runsCache).catch(() => undefined);
}

function persistErrors(): void {
  void kvPut(ERRORS_KEY, errorsCache).catch(() => undefined);
}

export function recordRun(run: RunRecord): void {
  if (!runsCache) runsCache = [];
  runsCache.unshift(run);
  if (runsCache.length > MAX_RUNS) runsCache = runsCache.slice(0, MAX_RUNS);
  persistRuns();
  notify();
}

export function recordError(error: ErrorRecord): void {
  if (!errorsCache) errorsCache = [];
  errorsCache.unshift(error);
  if (errorsCache.length > MAX_ERRORS) errorsCache = errorsCache.slice(0, MAX_ERRORS);
  persistErrors();
  notify();
}

export async function clearObservability(): Promise<void> {
  runsCache = [];
  errorsCache = [];
  await Promise.all([kvDelete(RUNS_KEY), kvDelete(ERRORS_KEY)]);
  notify();
}

/* ── Derived analytics ── */

export interface DayUsage {
  day: string;
  runs: number;
  errors: number;
  tokensOut: number;
}

export function dailyUsage(days = 14): DayUsage[] {
  const out = new Map<string, DayUsage>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.set(d.toISOString().slice(0, 10), { day: d.toISOString().slice(0, 10), runs: 0, errors: 0, tokensOut: 0 });
  }
  for (const r of runsCache || []) {
    const day = new Date(r.at).toISOString().slice(0, 10);
    const slot = out.get(day);
    if (slot) {
      slot.runs += 1;
      slot.tokensOut += r.tokensOut;
    }
  }
  for (const e of errorsCache || []) {
    const day = new Date(e.at).toISOString().slice(0, 10);
    const slot = out.get(day);
    if (slot) slot.errors += 1;
  }
  return [...out.values()];
}

export interface ModelAnalytics {
  model: string;
  runs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgConfidence: number | null;
  errors: number;
}

export function perModel(): ModelAnalytics[] {
  const byModel = new Map<string, { runs: number; latencies: number[]; confidences: number[]; errors: number }>();
  for (const r of runsCache || []) {
    const key = r.model || "default";
    const m = byModel.get(key) || { runs: 0, latencies: [], confidences: [], errors: 0 };
    m.runs += 1;
    m.latencies.push(r.totalMs);
    if (r.confidence !== null) m.confidences.push(r.confidence);
    if (r.errorCode) m.errors += 1;
    byModel.set(key, m);
  }
  return [...byModel.entries()].map(([model, m]) => {
    const sorted = [...m.latencies].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const avgConf = m.confidences.length ? m.confidences.reduce((a, b) => a + b, 0) / m.confidences.length : null;
    return {
      model,
      runs: m.runs,
      avgLatencyMs: m.latencies.length ? Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length) : 0,
      p95LatencyMs: p95,
      avgConfidence: avgConf === null ? null : Math.round(avgConf),
      errors: m.errors,
    };
  }).sort((a, b) => b.runs - a.runs);
}

export interface WorkspaceAnalytics {
  workspaceId: string;
  name: string;
  runs: number;
  avgConfidence: number | null;
  lastRunAt: number | null;
}

export function perWorkspace(names: Record<string, string>): WorkspaceAnalytics[] {
  const byWs = new Map<string, { runs: number; confidences: number[]; lastRunAt: number | null }>();
  for (const r of runsCache || []) {
    const m = byWs.get(r.workspaceId) || { runs: 0, confidences: [], lastRunAt: null };
    m.runs += 1;
    if (r.confidence !== null) m.confidences.push(r.confidence);
    if (!m.lastRunAt || r.at > m.lastRunAt) m.lastRunAt = r.at;
    byWs.set(r.workspaceId, m);
  }
  return [...byWs.entries()].map(([id, m]) => ({
    workspaceId: id,
    name: names[id] || "Untitled",
    runs: m.runs,
    avgConfidence: m.confidences.length ? Math.round(m.confidences.reduce((a, b) => a + b, 0) / m.confidences.length) : null,
    lastRunAt: m.lastRunAt,
  })).sort((a, b) => b.runs - a.runs);
}

export interface ConfidenceTrendPoint {
  at: number;
  confidence: number;
  faithfulness: number | null;
}

export function confidenceTrend(limit = 60): ConfidenceTrendPoint[] {
  return (runsCache || []).slice(0, limit).map((r) => ({ at: r.at, confidence: r.confidence ?? 0, faithfulness: r.faithfulness }));
}

export function overallStats(): { runs: number; errors: number; avgLatencyMs: number; p95LatencyMs: number; tokensOut: number; tokensIn: number; avgConfidence: number | null; avgFaithfulness: number | null } {
  const runs = runsCache || [];
  const latencies = runs.map((r) => r.totalMs).sort((a, b) => a - b);
  const confidences = runs.filter((r) => r.confidence !== null).map((r) => r.confidence as number);
  const faithfulness = runs.filter((r) => r.faithfulness !== null).map((r) => r.faithfulness as number);
  return {
    runs: runs.length,
    errors: (errorsCache || []).length,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0,
    tokensOut: runs.reduce((a, r) => a + r.tokensOut, 0),
    tokensIn: runs.reduce((a, r) => a + r.tokensIn, 0),
    avgConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
    avgFaithfulness: faithfulness.length ? Math.round((faithfulness.reduce((a, b) => a + b, 0) / faithfulness.length) * 1000) / 1000 : null,
  };
}
