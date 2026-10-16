/**
 * Tools panel — what the model may ask for, and what actually happened.
 *
 * Three things are shown, all of them real:
 *
 *   1. the registry, so the operator can see the complete set of calls the model
 *      could ever make (seven read-only tools, no writes, no network);
 *   2. a proposal console, where a proposal can be run by hand — the same gate the
 *      pipeline's observations pass through, so the policy can be exercised and
 *      inspected rather than trusted;
 *   3. the audit trail, one entry per attempt, including the refusals.
 *
 * Nothing here executes automatically.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Play, RefreshCw, Shield, Terminal } from "lucide-react";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { workspaceStore } from "../../stores/workspace-store";
import {
  createToolTask,
  listTools,
  parseProposal,
  previewDecision,
  runProposal,
  subscribeToolAudit,
  toolAuditDroppedCount,
  toolAuditEntries,
  TOOL_BUDGET_LIMITS,
  type Permission,
  type ToolAuditEntry,
  type ToolOutcome,
  type ToolProposal,
} from "../../tools";
import { cn } from "../../lib/utils";

/** Every grant this console hands a task: the read-only set, nothing else. */
const CONSOLE_GRANTS: Permission[] = ["workspace:read", "evidence:read", "compute:local"];

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString();
}

function decisionClass(decision: ToolAuditEntry["decision"]): string {
  switch (decision) {
    case "allow":
      return "border-accent/30 text-accent bg-accent/[0.06]";
    case "needs-approval":
      return "border-amber-500/40 text-amber-600";
    case "observed":
      return "border-border/50 text-muted/70";
    default:
      return "border-border/60 text-muted";
  }
}

export function ToolsPanel() {
  const state = useWorkspaceStore();
  const workspaceId = state.activeWorkspaceId;

  const [entries, setEntries] = useState<readonly ToolAuditEntry[]>(() => toolAuditEntries());
  const [draft, setDraft] = useState("");
  const [outcome, setOutcome] = useState<ToolOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  useEffect(() => subscribeToolAudit(() => setEntries(toolAuditEntries())), []);

  const tools = useMemo(() => listTools(), []);

  const parsed = useMemo(() => {
    if (!draft.trim()) return { proposal: null as ToolProposal | null, problem: undefined as string | undefined };
    const fromBlock = parseProposal(draft, "operator");
    if (fromBlock.proposal) return { proposal: fromBlock.proposal, problem: undefined };
    if (fromBlock.present) return { proposal: null, problem: fromBlock.problem };

    // A bare JSON body is accepted too, so the console can be used without the
    // block markers. It is parsed the same strict way.
    try {
      const body = JSON.parse(draft) as { tool?: unknown; arguments?: unknown; reason?: unknown };
      const wrapped = parseProposal(`<blackletter-action>${JSON.stringify(body)}</blackletter-action>`, "operator");
      return { proposal: wrapped.proposal, problem: wrapped.problem };
    } catch {
      return { proposal: null, problem: "the draft is neither an action block nor valid JSON" };
    }
  }, [draft]);

  /**
   * A throwaway task for the preview. It carries the same grants and budget as a
   * real run, so "policy would say" is the same decision the run would get.
   */
  const previewTask = useMemo(
    () => createToolTask({ workspaceId, data: workspaceStore.toolDataFor(workspaceId), grants: CONSOLE_GRANTS }),
    [workspaceId, state],
  );

  const decision = useMemo(
    () => (parsed.proposal ? previewDecision(previewTask, parsed.proposal) : null),
    [parsed.proposal, previewTask],
  );

  const execute = useCallback(
    async (approve: boolean) => {
      if (!parsed.proposal || running) return;
      const abort = new AbortController();
      setController(abort);
      setRunning(true);
      setProblem(null);
      setOutcome(null);
      try {
        const task = createToolTask({
          workspaceId,
          data: workspaceStore.toolDataFor(workspaceId),
          grants: CONSOLE_GRANTS,
          signal: abort.signal,
        });
        const result = await runProposal(task, parsed.proposal, approve ? { approve: { by: "operator" } } : {});
        setOutcome(result);
      } finally {
        setRunning(false);
        setController(null);
      }
    },
    [parsed.proposal, running, workspaceId],
  );

  const cancel = useCallback(() => {
    controller?.abort();
    setProblem("Cancelled. A call that was already running has its result discarded; nothing further will start.");
  }, [controller]);

  const inputClass =
    "w-full bg-bone/[0.04] border border-border rounded px-2.5 py-2 font-mono text-xs outline-none focus:border-accent/40 placeholder:text-faint";

  return (
    <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Tools — read-only, policy-gated</p>
        <span className="font-mono text-[10px] text-muted/60">
          {tools.length} registered · {entries.length} audited
        </span>
      </div>

      <div className="p-4 space-y-4">
        <p className="flex items-start gap-2 font-sans text-xs text-bone/70 leading-relaxed">
          <Shield size={12} className="mt-0.5 shrink-0 text-accent" />
          <span>
            A model may <em>propose</em> a tool call. It cannot approve one: every call passes the policy gateway in{" "}
            <span className="font-mono text-2xs">src/tools/policy.ts</span> before anything runs, a proposal seen in a run is recorded
            but never executed, and no tool here writes, installs, sends, publishes, pays, deploys, or reaches the network.
          </span>
        </p>

        <p className="font-sans text-[10px] text-muted/70 leading-relaxed">
          Audit entries keep three states apart: <span className="text-bone/70">requested</span> (put to the policy),{" "}
          <span className="text-bone/70">started</span> (a tool began running) and <span className="text-bone/70">finished</span>{" "}
          (it stopped, for any reason). Nothing here reports a tool result as{" "}
          <span className="text-bone/70">verified</span>: a tool returning data does not make the data true — verification is
          the grounding report's and the task machine's job.
        </p>

        <div className="border border-border/50 rounded-sm">
          <button
            onClick={() => setShowRegistry(!showRegistry)}
            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-bone/[0.03] text-left"
            aria-expanded={showRegistry}
          >
            <ChevronDown size={11} className={cn("text-muted transition-transform", showRegistry ? "" : "-rotate-90")} />
            <Terminal size={11} className="text-muted" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Registered tools</span>
          </button>
          {showRegistry && (
            <ul className="border-t border-border/40 divide-y divide-border/40">
              {tools.map((tool) => (
                <li key={tool.name} className="px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-bone/80">{tool.name}</span>
                    <span className="font-mono text-[9px] text-muted/70">{tool.permission}</span>
                    <span className={cn("font-mono text-[9px]", tool.sideEffect === "none" ? "text-accent" : "text-amber-600")}>
                      {tool.sideEffect === "none" ? "read-only" : tool.sideEffect}
                    </span>
                    <span className="font-mono text-[9px] text-muted/60">
                      timeout {tool.timeoutMs}ms · max {tool.maxOutputChars.toLocaleString()} chars
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-muted mt-1 leading-relaxed">{tool.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Proposal console</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            spellCheck={false}
            aria-label="Proposal draft"
            placeholder={`<blackletter-action>\n{"tool": "workspace.search", "arguments": {"query": "reactor"}}\n</blackletter-action>`}
            className={inputClass}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void execute(false)}
              disabled={!parsed.proposal || running}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-xs font-medium disabled:opacity-40"
            >
              <Play size={11} /> Run
            </button>
            <button
              onClick={() => void execute(true)}
              disabled={!parsed.proposal || running}
              title="Runs with an operator approval attached. Registered tools are read-only, so the gateway does not require one yet."
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors disabled:opacity-40"
            >
              Approve &amp; run
            </button>
            <button
              onClick={cancel}
              disabled={!running}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            {decision && parsed.proposal && (
              <span className="font-mono text-[10px] text-muted/70">
                policy would say:{" "}
                <span className={decision.decision === "allow" ? "text-accent" : "text-amber-600"}>{decision.decision}</span> ({decision.code})
              </span>
            )}
          </div>
          <p className="font-sans text-[10px] text-muted/70 leading-relaxed">
            Grants for this console: {CONSOLE_GRANTS.join(", ")}. Budget per run: {TOOL_BUDGET_LIMITS.maxCalls} calls,{" "}
            {TOOL_BUDGET_LIMITS.maxWallMs / 1000}s, {TOOL_BUDGET_LIMITS.maxOutputChars.toLocaleString()} characters of output,
            {" "}{TOOL_BUDGET_LIMITS.maxRetries} retry, {TOOL_BUDGET_LIMITS.maxIdenticalCalls} identical calls.
          </p>
          {problem && (
            <p className="flex items-start gap-1.5 font-sans text-xs text-accent">
              <AlertCircle size={12} className="mt-0.5 shrink-0" /> {problem}
            </p>
          )}
          {outcome && (
            <div className="border border-border/50 rounded-sm px-3 py-2 bg-bone/[0.02]">
              <p className="font-mono text-[10px] text-muted">
                #{outcome.auditSeq} · {outcome.tool} · {outcome.status} · {outcome.code}
              </p>
              <p className="font-sans text-xs text-bone/80 mt-1">{outcome.result?.summary ?? outcome.reason}</p>
              {outcome.result?.text && (
                <pre className="mt-2 max-h-40 overflow-auto border border-border/50 rounded-sm p-2 font-mono text-[10px] text-bone/70 whitespace-pre-wrap">
                  {outcome.result.text.slice(0, 2000)}
                </pre>
              )}
              {outcome.result?.truncated && <p className="font-sans text-[10px] text-amber-600 mt-1">Output truncated at the registered cap.</p>}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Audit trail</p>
            <span className="flex items-center gap-2">
              {toolAuditDroppedCount() > 0 && (
                <span className="font-mono text-[9px] text-muted/60">{toolAuditDroppedCount()} oldest dropped at the cap</span>
              )}
              <button
                onClick={() => setEntries(toolAuditEntries())}
                className="inline-flex items-center gap-1 font-sans text-[10px] text-muted hover:text-bone"
                title="Re-read the in-memory trail"
              >
                <RefreshCw size={10} /> refresh
              </button>
            </span>
          </div>
          {entries.length === 0 ? (
            <p className="font-sans text-xs text-muted/60">Nothing yet. A proposal seen in a model response is recorded here the moment a run finishes.</p>
          ) : (
            <ul className="border border-border/50 rounded-sm divide-y divide-border/40 max-h-80 overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.seq} className="px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-muted/60">#{entry.seq}</span>
                    <span className="font-mono text-[10px] text-bone/70">{entry.tool}</span>
                    <span className={cn("px-1.5 py-0.5 rounded-sm border font-mono text-[9px]", decisionClass(entry.decision))}>
                      {entry.decision}
                    </span>
                    <span className="font-mono text-[9px] text-muted/60">{entry.code}</span>
                    <span className="font-mono text-[9px] text-muted/50">{timeOf(entry.at)}</span>
                    <span className="font-mono text-[9px] text-muted/50">by {entry.by}</span>
                    {entry.result && (
                      <span className="font-mono text-[9px] text-muted/60">
                        {entry.result.status} · {entry.result.durationMs}ms · {entry.result.outputChars} chars
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-muted/50">
                      {entry.startedAt !== undefined
                        ? `started +${Math.max(0, entry.startedAt - entry.at)}ms${entry.finishedAt !== undefined ? ` · finished +${Math.max(0, entry.finishedAt - entry.at)}ms` : ""}`
                        : "not started"}
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-muted mt-1 leading-relaxed">{entry.reason}</p>
                  {entry.argSummary && <p className="font-mono text-[9px] text-muted/60 mt-0.5 truncate">{entry.argSummary}</p>}
                  {entry.result?.status === "ok" && (
                    <p className="flex items-center gap-1 font-sans text-[10px] text-bone/70 mt-1">
                      <CheckCircle2 size={10} className="text-accent" /> {entry.result.summary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
