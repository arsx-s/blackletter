# Projects: long-horizon work without long-horizon authority

Mission 11 turns a chain of tasks into work that survives a session. The risk is
not losing data — it is a project that keeps going: a schedule that wakes up, a
retry that decides for itself, a task that still holds a permission the operator
revoked. This document is the contract for what a project is allowed to do, and
what it is deliberately unable to do.

> **A project is a plan with a watch, not an engine.** It records goals,
> milestones and budgets; a milestone is executed by a Mission 9 task; every step
> of that task still passes the Mission 7 policy gateway. There is no timer, no
> interval, no worker and no startup entry anywhere in `src/projects`, and an
> architecture guard fails the build if one is added.

## 1. The shape of a project

```
Project
├─ goal: { text, version, previousText }        versioned; a change is visible
├─ milestones[]: { id, title, deliverable, acceptanceCriteria,
│                  dependsOn[], checkpoint, dueAt?, taskId?, taskGoalVersion? }
├─ budget: { maxTasks, maxToolCalls, deadlineAt?, unmeasured: ["tokens","currency"] }
├─ grants[]:      the exact permissions a task may inherit
├─ approvals[]:   checkpoint approvals with an expiry
├─ schedule:      { enabled: false, everyMinutes, maxRuns, runsDone, lastRunAt? }
├─ notifications[]: in-app only; the rest exist to say they are unavailable
├─ appliedActions[]: the idempotency keys that already succeeded
└─ events[]:      the project's own history, redacted and capped
```

A milestone stores **no state**. `completed`, `pending`, `ready`, `in-progress`,
`blocked`, `failed` and `approval-needed` are derived on every read from the
linked task, its dependencies and the approval clock (`src/projects/derive.ts`).
A cached state is how a dashboard starts lying after a restart, so there is none.

## 2. Creating work

`createTaskForMilestone` is the only way a project causes execution, and it
refuses in this order:

| Check | Refusal |
| --- | --- |
| the action key already succeeded | `duplicate-action` |
| the milestone already has a live task | `duplicate-task` |
| the deadline has passed | `deadline-passed` |
| the task budget or the tool-call budget is spent | `budget-exhausted` |
| a dependency is unfinished | `dependency-incomplete` |
| a dependency failed | `dependency-failed` |
| the milestone is a checkpoint without a current approval | `checkpoint-missing` |

A refusal that is worth remembering appends a `refused` event to the project, and
that updated project is returned on the refusal itself so the caller persists it.
What a refusal does **not** do is spend the action key: a key is consumed only by
success, so retrying a refused attempt with the same key is not mistaken for a
duplicate of work that never happened.

The task a milestone creates:

- gets the milestone's acceptance criteria as its constraints (so the task's
  verifier checks them) and its deliverable in the goal;
- gets `grants: project.grants` — exactly, never widened by the plan, the model
  or a default;
- runs under the same budgets, levels and gateway as any other task, and only
  reaches `COMPLETED` from `VERIFYING`.

## 3. Budgets and deadlines

- `maxTasks` and `maxToolCalls` are checked **before** a task exists. The
  tool-call figure is the sum of the linked tasks' own `spend.toolCalls`.
- `deadlineAt` stops new work; it does not stop a running task, because stopping
  mid-step would leave the operator without the evidence the step had gathered.
  The dashboard shows the deadline and says when it has passed.
- `tokens` and `currency` are declared **unmeasured**, like Mission 9's budgets,
  because this build has no tokenizer and no price list. They appear on screen as
  what they are: not enforced.

## 4. Checkpoints and expiring approvals

A milestone marked `checkpoint: true` cannot create a task until an operator
approves it, and the approval carries an `expiresAt` (24 hours by default). An
expired approval is not an approval: `approvalStatus` returns `expired` rather
than `missing` so the board can say why the gate is open again, and the milestone
returns to `approval-needed`. Approvals are never edited, only added; the panel
shows the recorded ones.

## 5. Pause, resume, cancel, and revoking a grant

`pauseProject`, `resumeProject` and `cancelProject` walk the linked tasks and
call the task machine's own operations, saving each result. They report what they
changed and what they skipped, with a reason for every skip.

Revoking a grant is more than a record: a task that holds the revoked permission
is **paused**, not left to finish on authority the operator has taken back. The
task keeps its own record of what it held — its history is not rewritten — and
the project notes how many tasks it stopped.

Resuming has one extra rule. A task whose plan was built against an older goal
version will not resume: the plan was made for a goal that no longer exists, so
`resumeProject` skips it and says to re-create the task. Re-planning happens when
the operator cancels the obsolete task and creates a new one, which is recorded
as `Replanned against goal version N`.

## 6. Retry policy

`src/projects/retry.ts` classifies a tool outcome into exactly three classes, and
the classification is a closed set rather than a guess:

| Class | When | Retried? |
| --- | --- | --- |
| `transient` | a timeout, or an error whose code is in the declared set (`etimedout`, `econnreset`, `rate-limited`, `busy`, …) | yes, inside the task's retry budget, with exponential backoff (500 ms × 2ⁿ, capped at 30 s) |
| `deterministic` | the call ran and failed on its arguments; an unknown error code | no — repeating it unchanged is a repeat, not a retry; changing the arguments is a plan revision |
| `operator` | a denial, a cancellation, a pending approval | no — retrying a decision would be a way of asking twice |

`retryDecision` produces a decision and a delay; it does not sleep, schedule or
execute anything.

## 7. Idempotency

Every creation, approval and schedule change carries an action key. The keys that
succeeded are kept on the project (last 40) and a repeat is refused with
`duplicate-action`. The invariant is narrow on purpose: a *successful* action is
applied once; a refused attempt changes nothing, so it spends nothing.

## 8. Scheduling: opt-in, inert, bounded

There is no autonomous execution in this build. A schedule is:

- **off by default** (`enabled: false`);
- only switched on with `acknowledged: true`, which the API refuses to infer —
  the panel makes it a checkbox with the consequences written next to it;
- clamped: 15 minutes to 24 hours between runs, at most 20 recorded runs;
- **never run by the module.** `scheduleDue` answers a question; the panel shows
  "due"; the operator presses the button and the run is recorded. The module
  contains no timer and no callback loop, and a guard enforces that.

A scheduled run grants nothing new: it records an intent. Any work it leads to
still creates a task through `createTaskForMilestone`, with the same budget,
dependency, checkpoint and grant checks as a hand-made one.

## 9. Notifications

Only channels this build can deliver through can be enabled — which is `in-app`
alone. `webhook` and `email` are listed with the reason they are unavailable
(there is no outbound transport and no mail transport), and their buttons are
disabled. Enabling a channel records an event; it does not create a subscription
to anything. The project's event log is recorded whether a channel is on or off.

## 10. Secrets

Secrets come from the environment or a broker, and never from a project field.
Everything user-supplied that is stored goes through `storedText`, which calls
`redactSecrets` first: OpenRouter-style keys, bearer tokens, AWS access-key ids
and `*_KEY=…`/`*_TOKEN=…` assignments are replaced with `[redacted]`, and event
details are redacted again on the way in. `src/projects` never reads
`import.meta.env` or `process.env` (guarded), and no file in the module names a
credential variable.

## 11. History

Each project keeps its own event log — created, goal changed, task created,
approval recorded, checkpoint blocked, grant granted/revoked, schedule
enabled/disabled/run, paused, resumed, cancelled, refused — capped at 200 events
with the dropped count kept. It is the project's history, not the audit trail:
`src/tools/audit.ts` and the memory history own that. The panel offers exactly
the actions the module exposes; nothing is edited after the fact.

## 12. Tests and guards

| Area | Where |
| --- | --- |
| creating work, budgets, deadlines, dependency failure, duplicate task and action, grants passed exactly | `src/test/projects/projects.test.ts` |
| checkpoint gating, approval expiry, default TTL, duplicate approval key | same |
| pause/resume/cancel, revocation pausing a task, changed-goal resume refusal and explicit re-plan | same |
| progress counts, stale tasks | same |
| schedule: acknowledgement, clamps, idempotent runs, not-due, exhaustion, disable | same |
| retry classification and backoff | same |
| redaction and stored-text bounds | same |
| persistence: round trip, version refusal, corrupt entries, legacy field, cap, workspace-scoped clear | `src/test/projects/store.test.ts` |
| panel: honest empty state, create, task creation, checkpoint, inert schedule, unavailable channels | `src/test/projects/panel.test.tsx` |
| guards: no timers/workers/network in the module, schedule off by default, one task importer and exact grants, no tool calls, no environment reads, derived states, panel honesty, developer-mode-only mounting | `src/test/architecture/import-guards.test.ts` |

## 13. Limitations, stated plainly

- A project cannot stop a task mid-step. Pause and cancel take effect at the next
  transition, which is a boundary the task machine defines.
- The deadline stops *creation*, not execution, as described above.
- Resuming a project resumes the tasks the task machine allows to resume; a task
  that is not paused is skipped with a reason rather than forced.
- Scheduling is a recorded intent plus a due calculation. Nothing here runs while
  the window is closed — by design, and the panel says so in the same words.
- There is no notification transport, so no notification is ever sent; only the
  in-app log records what happened.
- No live model and no Ollama were available in this environment: the module is
  verified by its unit, store and panel tests and by architecture guards. The
  panels were not re-checked in a real browser for this mission.
