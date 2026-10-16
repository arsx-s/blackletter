/**
 * Tasks panel — bounded multi-step work, driven by hand.
 *
 * The panel never runs a loop. Each click asks the machine for exactly one
 * permitted action, and the machine answers with either the new state or a refusal
 * with a reason. Everything shown is read from the task record: the plan and its
 * criteria, the steps with the arguments that were actually resolved, the evidence
 * the tools actually returned, the budget as spent, the transition history, and the
 * verification results.
 *
 * Two things the panel states plainly, because the alternative would be a lie:
 *
 *   - level 3 is not implemented, and the select says so;
 *   - token and currency budgets are not enforced, because nothing in this build
 *     measures them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Pause, Play, Plus, RefreshCw, Shield, X } from "lucide-react";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { workspaceStore } from "../../stores/workspace-store";
import { listTools } from "../../tools/registry";
import type { ToolDefinition } from "../../tools/types";
import { cn } from "../../lib/utils";
import {
  AUTONOMY_LEVELS,
  MAX_AUTONOMY_LEVEL,
  TASK_BUDGET_LIMITS,
  cancelTask,
  clearTasks,
  createTask,
  decideApproval,
  droppedTaskCount,
  loadTasks,
  pauseTask,
  resumeTask,
  reviseStep,
  saveTask,
  stepTask,
  subscribeTasks,
  tasksFor,
  verifyTask,
  type AutonomyLevel,
  type TaskRecord,
  type TaskStepState,
} from "../../tasks";

const LEVEL_CHOICES: AutonomyLevel[] = [0, 1, 2];

const REGISTERED_TOOLS = listTools();

/**
 * A draft of the arguments a tool requires, so the operator edits a real shape
 * instead of guessing one. It is a draft and nothing else: an empty required field
 * is refused by the tool's own schema when the step is added.
 */
function argumentDraft(tool: ToolDefinition): string {
  const draft: Record<string, unknown> = {};
  for (const field of tool.schema.input) {
    if (!field.required) continue;
    draft[field.name] = field.type === "string" ? "" : field.type === "number" ? 0 : [];
  }
  return JSON.stringify(draft);
}

function statusClass(status: TaskRecord["status"] | TaskStepState["status"]): string {
  switch (status) {
    case "COMPLETED":
    case "done":
      return "border-accent/30 text-accent";
    case "FAILED":
    case "failed":
      return "border-amber-500/40 text-amber-600";
    case "CANCELLED":
      return "border-border/60 text-muted";
    case "WAITING_FOR_APPROVAL":
    case "waiting-approval":
      return "border-amber-500/40 text-amber-600";
    case "RUNNING":
    case "running":
      return "border-accent/30 text-bone";
    default:
      return "border-border/60 text-bone";
  }
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString();
}

export function TasksPanel() {
  const state = useWorkspaceStore();
  const workspaceId = state.activeWorkspaceId;
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  const lastAnswer = useMemo(
    () => [...(tab?.messages ?? [])].reverse().find((message) => message.role === "assistant")?.content ?? "",
    [tab?.messages],
  );

  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [criteria, setCriteria] = useState("");
  const [level, setLevel] = useState<AutonomyLevel>(1);
  const [answer, setAnswer] = useState("");
  const [answerTouched, setAnswerTouched] = useState(false);
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [history, setHistory] = useState<readonly TaskRecord[]>(() => tasksFor(workspaceId));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTransitions, setShowTransitions] = useState(false);
  const [revisionTool, setRevisionTool] = useState<string>(REGISTERED_TOOLS[0]?.name ?? "");
  const [revisionArgs, setRevisionArgs] = useState<string>(() => {
    const first = REGISTERED_TOOLS[0];
    return first ? argumentDraft(first) : "{}";
  });
  const [revisionReason, setRevisionReason] = useState("");

  useEffect(() => {
    void loadTasks();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTasks(() => setHistory(tasksFor(workspaceId)));
    setHistory(tasksFor(workspaceId));
    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    if (!answerTouched && lastAnswer.length > 0) setAnswer(lastAnswer);
  }, [lastAnswer, answerTouched]);

  const apply = useCallback(
    (next: TaskRecord | null, error?: string) => {
      if (error) setProblem(error);
      else setProblem(null);
      if (next) {
        saveTask(next);
        setTask(next);
        setHistory(tasksFor(workspaceId));
      }
    },
    [workspaceId],
  );

  const propose = useCallback(() => {
    const result = createTask({
      workspaceId,
      goal,
      constraints: constraints.split(/\n+/),
      level,
      criteria: criteria
        .split(/\n+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    });

    if (!result.ok) {
      apply(null, result.reason);
      return;
    }
    apply(result.task);
  }, [apply, constraints, criteria, goal, level, workspaceId]);

  const runStep = useCallback(async () => {
    if (!task) return;
    setBusy(true);
    try {
      const result = await stepTask(task, { data: workspaceStore.toolDataFor(workspaceId) });
      if (result.ok) apply(result.task);
      else apply(result.task, result.reason);
    } finally {
      setBusy(false);
    }
  }, [apply, task, workspaceId]);

  const verify = useCallback(() => {
    if (!task) return;
    const result = verifyTask(task, { answer });
    if (result.ok) apply(result.task);
    else apply(result.task, result.reason);
  }, [apply, answer, task]);

  const addStep = useCallback(() => {
    if (!task) return;
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(revisionArgs);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        apply(task, "the arguments must be a JSON object");
        return;
      }
      parsed = value as Record<string, unknown>;
    } catch (error) {
      apply(task, `the arguments are not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const result = reviseStep(task, {
      tool: revisionTool,
      arguments: parsed,
      rationale: revisionReason,
      because: revisionReason,
    });
    if (result.ok) {
      apply(result.task);
      setRevisionReason("");
    } else {
      apply(result.task, result.reason);
    }
  }, [apply, revisionArgs, revisionReason, revisionTool, task]);

  const transitions = task?.transitions ?? [];
  const spend = task?.spend;
  const budget = task?.budget;

  return (
    <section className="surface-default rounded-md border border-border/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-muted" />
          <h3 className="text-body-sm text-bone">Tasks</h3>
          <span className="text-micro text-muted">
            {history.length} task{history.length === 1 ? "" : "s"} in this workspace · one permitted action per click
          </span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              className="text-micro text-muted hover:text-bone"
              onClick={() => {
                // Clears this workspace's tasks and their persisted copy; other
                // workspaces' records are left alone.
                void clearTasks(workspaceId);
                setTask(null);
                setHistory([]);
              }}
            >
              Clear list
            </button>
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <label className="block">
          <span className="text-micro text-muted">Goal</span>
          <textarea
            aria-label="Task goal"
            rows={2}
            className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
            placeholder="What should be established, and to what standard?"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-micro text-muted">Constraints (one per line)</span>
            <textarea
              aria-label="Task constraints"
              rows={2}
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
              placeholder="e.g. read-only; do not leave this workspace"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-micro text-muted">Extra success criteria (one per line)</span>
            <textarea
              aria-label="Extra success criteria"
              rows={2}
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
              placeholder="Shown with the plan. Criteria this build cannot evaluate are shown as unmet, never as met."
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-micro text-muted">Autonomy level</span>
            <select
              aria-label="Autonomy level"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={level}
              onChange={(event) => setLevel(Number(event.target.value) as AutonomyLevel)}
            >
              {LEVEL_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {AUTONOMY_LEVELS.find((entry) => entry.level === choice)?.label ?? `Level ${choice}`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-micro text-muted">
              {AUTONOMY_LEVELS.find((entry) => entry.level === level)?.description} Level {MAX_AUTONOMY_LEVEL + 1} is not
              implemented in this build.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-caption text-accent disabled:opacity-50"
            onClick={propose}
            disabled={goal.trim().length === 0}
          >
            <Play size={13} /> Propose plan
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            onClick={() => void runStep()}
            disabled={!task || task.status !== "RUNNING" || busy}
          >
            {busy ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />} Run next step
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            onClick={verify}
            disabled={!task || task.status !== "VERIFYING"}
          >
            <CheckCircle2 size={13} /> Verify
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            onClick={() => task && apply(pauseTask(task).task)}
            disabled={!task || !["REQUESTED", "PLANNING", "RUNNING", "WAITING_FOR_APPROVAL", "VERIFYING", "NEEDS_OPERATOR"].includes(task.status)}
          >
            <Pause size={13} /> Pause
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            onClick={() => {
              if (!task) return;
              const result = resumeTask(task);
              apply(result.ok ? result.task : result.task, result.ok ? undefined : result.reason);
            }}
            disabled={!task || !["PAUSED", "NEEDS_OPERATOR"].includes(task.status)}
          >
            <Play size={13} /> Resume
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            onClick={() => {
              if (!task) return;
              const result = cancelTask(task);
              apply(result.ok ? result.task : result.task, result.ok ? undefined : result.reason);
            }}
            disabled={!task || ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)}
          >
            <X size={13} /> Cancel
          </button>
          {task && (
            <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", statusClass(task.status))}>{task.status}</span>
          )}
          {task?.currentStep !== undefined && task && task.steps.length > 0 && (
            <span className="text-micro text-muted">
              step {Math.min(task.currentStep + 1, task.steps.length)} of {task.steps.length}
            </span>
          )}
          {droppedTaskCount() > 0 && <span className="text-micro text-muted">· {droppedTaskCount()} older finished task(s) dropped</span>}
        </div>

        {problem && (
          <p className="flex items-start gap-2 rounded-xs border border-amber-500/40 px-3 py-2 text-caption text-amber-600">
            <AlertCircle size={14} className="mt-0.5" /> {problem}
          </p>
        )}

        {task && (
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="rounded-xs border border-border/60 px-3 py-2">
              <p className="text-caption text-muted">
                <span className="text-bone">Goal. </span>
                {task.goal}
              </p>
              {task.constraints.length > 0 && (
                <p className="mt-1 text-micro text-muted">Constraints: {task.constraints.join(" · ")}</p>
              )}
              <p className="mt-1 text-micro text-muted">
                Difficulty {task.plan.estimate.difficulty} · risk {task.plan.estimate.risk} · {task.plan.estimate.note}
              </p>
              <p className="mt-1 text-micro text-muted">{task.plan.estimate.uncertainty}</p>
            </div>

            <div>
              <h4 className="text-micro text-muted">Success criteria ({task.plan.successCriteria.length})</h4>
              <ul className="mt-1 space-y-0.5">
                {task.plan.successCriteria.map((criterion, index) => {
                  const result = task.verification?.criteria[index];
                  return (
                    <li key={`${criterion.id}-${index}`} className="text-caption text-muted">
                      <span className={cn("mr-1", result ? (result.met ? "text-accent" : "text-amber-600") : "")}>
                        {result ? (result.met ? "met" : "unmet") : "not checked"}
                      </span>
                      {criterion.text}
                      {result && <span className="block text-micro">{result.detail}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h4 className="text-micro text-muted">Plan ({task.steps.length} step(s))</h4>
              {task.steps.length === 0 ? (
                <p className="mt-1 text-caption text-muted">
                  This level executes nothing, so the plan is empty by design. Raise the level to investigate.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {task.steps.map((step) => (
                    <li key={step.spec.id} className="rounded-xs border border-border/60 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", statusClass(step.status))}>{step.status}</span>
                        <span className="font-mono text-caption text-bone">{step.spec.tool}</span>
                        <span className="text-caption text-muted">{step.spec.rationale}</span>
                      </div>
                      <p className="mt-1 text-micro text-muted">Included because {step.spec.because}</p>
                      {step.resolvedArgs && (
                        <p className="mt-1 font-mono text-micro text-muted">
                          arguments: {JSON.stringify(step.resolvedArgs)}
                        </p>
                      )}
                      {step.outcome && (
                        <p className="mt-1 text-micro text-muted">
                          {step.outcome.summary} · {step.outcome.durationMs}ms · {step.evidence.length} evidence item(s)
                        </p>
                      )}
                      {step.note && <p className="mt-1 text-micro text-amber-600">{step.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {task.status === "WAITING_FOR_APPROVAL" && (
              <div className="rounded-xs border border-amber-500/40 px-3 py-2">
                <p className="text-caption text-amber-600">
                  An action is waiting for your approval. Nothing has run yet, and approving does not run it either — it
                  allows the next step click to run it once.
                </p>
                {task.approvals
                  .filter((approval) => approval.decision === "pending")
                  .map((approval) => (
                    <div key={approval.stepId} className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-caption text-bone">{approval.tool}</span>
                      <span className="text-micro text-muted">step {approval.stepId}</span>
                      <button
                        type="button"
                        className="rounded-xs border border-accent/40 px-2 py-1 text-micro text-accent"
                        onClick={() => {
                          const result = decideApproval(task, { stepId: approval.stepId, decision: "approved" });
                          apply(result.ok ? result.task : result.task, result.ok ? undefined : result.reason);
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-xs border border-border/60 px-2 py-1 text-micro text-muted hover:text-bone"
                        onClick={() => {
                          const result = decideApproval(task, { stepId: approval.stepId, decision: "denied", reason: "declined in the tasks panel" });
                          apply(result.ok ? result.task : result.task, result.ok ? undefined : result.reason);
                        }}
                      >
                        Deny
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {task && !["COMPLETED", "FAILED", "CANCELLED"].includes(task.status) && (
              <div className="rounded-xs border border-border/60 px-3 py-2">
                <h4 className="text-micro text-muted">Revise the plan: add one step</h4>
                <p className="mt-1 text-micro text-muted">
                  A plan only ever grows, and the added step is validated now: it must name a registered tool, satisfy that
                  tool's schema, fit the remaining step budget, and respect this task's level and permissions. It then runs
                  through the same checks as every other step.
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <label className="block">
                    <span className="text-micro text-muted">Tool</span>
                    <select
                      aria-label="Step tool"
                      className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                      value={revisionTool}
                      onChange={(event) => {
                        setRevisionTool(event.target.value);
                        const tool = REGISTERED_TOOLS.find((entry) => entry.name === event.target.value);
                        if (tool) setRevisionArgs(argumentDraft(tool));
                      }}
                    >
                      {REGISTERED_TOOLS.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-micro text-muted">Arguments (JSON)</span>
                    <textarea
                      aria-label="Step arguments"
                      rows={2}
                      className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 font-mono text-micro text-bone"
                      value={revisionArgs}
                      onChange={(event) => setRevisionArgs(event.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="text-micro text-muted">Why this step</span>
                    <textarea
                      aria-label="Step reason"
                      rows={2}
                      className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-micro text-bone"
                      placeholder="What did the earlier steps show that makes this necessary?"
                      value={revisionReason}
                      onChange={(event) => setRevisionReason(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
                  onClick={addStep}
                  disabled={!task || (task.status !== "RUNNING" && task.status !== "PAUSED")}
                >
                  <Plus size={13} /> Add step
                </button>
                {task && task.status !== "RUNNING" && task.status !== "PAUSED" && (
                  <span className="ml-2 text-micro text-muted">
                    A plan is revised while the task is RUNNING or PAUSED; this one is {task.status}.
                  </span>
                )}
              </div>
            )}

            {spend && budget && (
              <div className="rounded-xs border border-border/60 px-3 py-2">
                <p className="text-micro text-muted">
                  Budget spent: {spend.steps}/{budget.maxSteps} steps · {spend.toolCalls}/{budget.maxToolCalls} tool calls ·{" "}
                  {Math.round(spend.wallMs / 1000)}s of {Math.round(budget.maxWallMs / 1000)}s · {spend.outputChars.toLocaleString()}/
                  {budget.maxOutputChars.toLocaleString()} output characters · {spend.retries}/{budget.maxRetries} retries
                </p>
                <p className="mt-1 text-micro text-muted">
                  Not enforced: {TASK_BUDGET_LIMITS.unmeasured.join(" and ")} budgets — nothing in this build measures them, so
                  they are not shown as spent.
                </p>
              </div>
            )}

            <label className="block">
              <span className="text-micro text-muted">
                Answer to verify (defaults to this tab's last answer; judged against the evidence the steps returned)
              </span>
              <textarea
                aria-label="Answer to verify"
                rows={3}
                className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                placeholder="Paste the text whose sentences should be checked against the retrieved evidence."
                value={answer}
                onChange={(event) => {
                  setAnswerTouched(true);
                  setAnswer(event.target.value);
                }}
              />
            </label>

            {task.verification && (
              <div className="rounded-xs border border-border/60 px-3 py-2">
                <p className="text-caption text-bone">
                  Verification {task.verification.met ? "met every criterion" : "did not meet every criterion"} ·{" "}
                  {task.verification.evidenceChunks} evidence passage(s) judged
                  {task.verification.supportRatio !== null && ` · ${Math.round(task.verification.supportRatio * 100)}% of judged sentences supported`}
                </p>
                {task.verification.unsupportedClaims.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {task.verification.unsupportedClaims.map((claim) => (
                      <li key={claim} className="text-micro text-amber-600">
                        unsupported: {claim}
                      </li>
                    ))}
                  </ul>
                )}
                {task.verification.notes.map((note) => (
                  <p key={note} className="mt-1 text-micro text-muted">
                    {note}
                  </p>
                ))}
              </div>
            )}

            {task.outcome && (
              <div className="rounded-xs border border-border/60 px-3 py-2">
                <p className="text-caption text-muted">
                  <span className="text-bone">Outcome. </span>
                  {task.outcome.summary}
                </p>
                {task.outcome.completed.length > 0 && (
                  <p className="mt-1 text-micro text-muted">Completed: {task.outcome.completed.join(" · ")}</p>
                )}
                {task.outcome.incomplete.length > 0 && (
                  <p className="mt-1 text-micro text-amber-600">Incomplete: {task.outcome.incomplete.join(" · ")}</p>
                )}
              </div>
            )}

            {task.revisions.length > 0 && (
              <div>
                <h4 className="text-micro text-muted">Plan revisions ({task.revisions.length})</h4>
                <ul className="mt-1 space-y-0.5">
                  {task.revisions.map((revision, index) => (
                    <li key={`${revision.at}-${index}`} className="font-mono text-micro text-muted">
                      {timeOf(revision.at)} added {revision.tool} as {revision.stepId} · {revision.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-caption text-muted hover:text-bone"
                onClick={() => setShowTransitions((current) => !current)}
              >
                <ChevronDown size={13} className={cn("transition-transform", showTransitions && "rotate-180")} />
                State transitions ({transitions.length})
              </button>
              {showTransitions && (
                <ul className="mt-2 space-y-0.5">
                  {transitions.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="font-mono text-micro text-muted">
                      {timeOf(entry.at)} {entry.from} → {entry.to} · {entry.by} · {entry.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {history.length > 1 && (
              <div>
                <h4 className="text-micro text-muted">Task history ({history.length})</h4>
                <ul className="mt-1 space-y-0.5">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={cn("text-left text-caption hover:text-accent", entry.id === task.id ? "text-accent" : "text-muted")}
                        onClick={() => setTask(entry)}
                      >
                        {timeOf(entry.updatedAt)} · {entry.status} · level {entry.level} · {entry.goal.slice(0, 60)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
