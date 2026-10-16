# Tasks: bounded multi-step work with stop conditions

Mission 9 turned a one-pass pipeline into bounded multi-step work **without** handing
the model autonomy. This document is the contract: the state machine, the plan, the
budgets, approvals, verification, recovery, and what is **not** verified.

> **A plan is a proposal, not a permission.** Every step a task runs passes the
> Mission 7 policy gateway first. Nothing in `src/tasks` calls a tool, reads a
> file, opens a socket, or touches the host.

## The state machine

`src/tasks/machine.ts` holds one table, `ALLOWED_TRANSITIONS`, and one function,
`transition`. A move not in the table is refused with a reason — it is not
"corrected" into a legal one.

```
REQUESTED → PLANNING → RUNNING ⇄ PAUSED
                       ↕              ↘
        WAITING_FOR_APPROVAL            VERIFYING → COMPLETED
                       ↘                ↗ ↘
                        NEEDS_OPERATOR      FAILED
                                ↘          ↗
                                 CANCELLED
```

- `COMPLETED` is reachable **only** from `VERIFYING`, and only the verifier moves a
  task there. An architecture guard fails the build if the step runner ever writes
  that transition.
- `COMPLETED`, `FAILED` and `CANCELLED` have **no outgoing edges**: a finished task
  cannot be reopened, relabelled or "resumed into" something else.
- Every transition records `at`, `from`, `to`, `by` (`system` or `operator`) and a
  sentence saying why. The panel shows the whole history.

A task record retains the goal, the constraints, the plan and current step, the
steps with the arguments that were actually resolved and the evidence the tools
actually returned, the budget and the spend, approvals, failures and refusals, the
verification results, the final outcome, timestamps, the status history, and any
plan revisions.

## The planner is deterministic

`buildPlan` is a pure function of the request: same request, same plan, every time.
No model writes it, so a plan can be reproduced and reviewed, and every step states
why it exists (`because`) and why it is worth doing (`rationale`).

The steps for a level 1 task, in order:

| Step | Tool | Why it is here |
| --- | --- | --- |
| 1 | `workspace.status` | says what this workspace holds before anything is read |
| 2 | `workspace.search` | finds items that mention **one** subject term — `workspace.search` matches literally, so a phrase would find nothing |
| 3 | `workspace.read` | reads the best match in full; **optional**: skipped with a reason when nothing matched |
| 4 | `memory.search` | retrieves memory records **with their epistemic status and origin note** |
| 5 | `evidence.retrieve` | retrieves scored passages with locators, so claims can be traced |
| 6 | `calculate` | only when the goal states an arithmetic expression |

Arguments are resolved at execution time from named sources (`goal`, `terms`,
`topTerm`, `previousHitId`, `goalNumbers`). An argument that cannot be resolved is
**reported, never guessed**: a non-optional step that cannot resolve stops the task
with `needs-operator`; an optional step is skipped with the reason recorded.

## Autonomy levels

| Level | Meaning | Steps | Grants |
| --- | --- | --- | --- |
| 0 | advise | none — the plan is a proposal | none |
| 1 | investigate | the read-only steps above | `workspace:read`, `evidence:read`, `compute:local` |
| 2 | bounded execution | level 1, plus approval-gated side effects | the same, with side-effecting steps requiring approval |
| 3 | long-horizon execution | **not implemented** — the panel says so and the level is not offered | — |

Level 3 is refused with a reason rather than silently downgraded. A task's grants are
fixed when it is created, are copied (never aliased) into a tool call, and can never
be widened by an argument, a proposal or a plan revision.

## Budgets

`TASK_BUDGET_LIMITS` (in `src/tasks/types.ts`) defines level defaults and a ceiling
that `clampBudget` never exceeds: steps, wall time, tool calls, retries, output
characters.

- The step budget is checked **before** every step, and the wall-clock budget is
  measured from the task's creation time. When one is spent the task stops with
  `budget-exhausted` and says which budget and how much of it was used.
- Token and currency budgets are declared **unmeasured**: nothing in this build
  counts tokens or prices anything, so they are not shown as spent. The panel prints
  that sentence instead of a meter.
- A timeout is retried within the retry budget, and the retry is recorded. Nothing
  is retried outside a budget.

## Approvals

A step that is high-impact or side-effecting does **not** run. The task moves to
`WAITING_FOR_APPROVAL`, and the panel offers Approve and Deny.

- **Approving does not execute anything.** It records the decision and returns the
  task to `RUNNING`; the step runs on the next step request, where the recorded
  approval is what satisfies the gateway.
- **Denying ends the task** with `approval-denied`, marks the step skipped, and the
  tool is never called. Tests assert the write tool's call count is still zero
  afterwards.
- An approval cannot be granted by the model, by an argument, or by a plan
  revision. No registered tool is high-impact, so this path is exercised with a
  fixture tool that only exists in a test build.

## Verification: what "done" means

`verifyTask` runs only from `VERIFYING`, and its criteria are **checks, not prose**:

| Criterion | Evaluated by |
| --- | --- |
| `steps-completed` | every step finished, or was skipped with a stated reason |
| `evidence-present` | at least one step returned evidence from this workspace's tools |
| `no-tool-calls` | level 0 called nothing |
| `numbers-grounded` | no sentence of the answer states a number the evidence does not contain |
| `support-ratio` | ≥ 60 % of the answer's judged sentences are supported by the retrieved evidence |

Claim support is decided by `attributeClaims` from `src/pipeline/grounding.ts` — the
same function the grounded pipeline uses, so a sentence cannot pass here and fail
there.

- Every criterion met → `COMPLETED`.
- A criterion about the investigation itself unmet (no evidence, steps unfinished)
  → `FAILED`, with the unmet criteria named.
- A criterion about the **answer's support** unmet (an unsupported number, a low
  support ratio) → `NEEDS_OPERATOR` with `insufficient-evidence`: the operator may
  add evidence, revise the plan, or start a different task. The system does not
  decide that a weakly supported answer is good enough.
- With no answer to judge, the answer-specific criteria are reported as met **with
  that fact stated**, and the outcome summary says no sentence was judged.

The outcome lists completed work, incomplete work (skipped and failed steps, plus
every refusal), the evidence count, the unmet criteria and the budget spent. It is
built from the record, not written by a model.

## Pause, resume, cancel, revise, recovery

- **Pause** is legal from any live state; **resume** is legal from `PAUSED` and
  `NEEDS_OPERATOR`. Resuming walks past steps that already finished, so a
  pause/resume cycle **cannot duplicate a tool call** (there is a test for exactly
  that).
- **Cancel** moves any non-terminal task to `CANCELLED` with a reason; every later
  step request is refused.
- **Revise** (`reviseStep`) adds exactly one step to a `RUNNING` or `PAUSED` plan.
  It is validated at the moment it is added: the tool must be registered, the
  arguments must satisfy that tool's schema, the task must hold the permission, the
  level must allow it, and the step budget must have room. A plan only ever grows —
  removing a step that ran would erase its result — and the revision is recorded
  with the reason and shown in the panel.
- **Recovery**: on load, any task that was `REQUESTED`, `PLANNING`, `RUNNING`,
  `WAITING_FOR_APPROVAL` or `VERIFYING` is moved to `PAUSED` with a reason saying the
  app restarted, and a step that was mid-flight goes back to `pending` with its
  attempt count kept. A task never resumes on its own, and an interrupted task can
  never be mistaken for a finished one.
- **Persistence** is one key-value entry (`tasks`), versioned, validated on load, and
  capped at 20 records. The cap drops the oldest *finished* work first; a live task is
  never discarded to make room. A record written by another version is left alone and
  reported rather than guessed at, and an additive field (`revisions`) is migrated to
  its empty value instead of rejecting the record.

## The tool layer this reuses

Every step goes through `createToolTask` + `runProposal` from `src/tools/executor.ts`:
schema validation, deny-by-default permissions, budget checks, timeouts,
cancellation, the approval check, and the audit trail. Tool output is untrusted
data: evidence stored on a step is neutralised with the same routine the tool layer
uses, and no step can be turned into a permission by anything a tool returned.

`memory.search` was added in this mission so a task can retrieve what the workspace
already knows; it reads memory and never writes to it (a record's retrieval
timestamp is not updated by a tool call).

## What is not verified

- **No model and no live inference.** There is no `OPENROUTER_API_KEY` and no local
  model on this machine. The verification path is judged against supplied text and
  real tool results; no model wrote any of the answers used in tests.
- **No real-document run.** Tasks are tested against fixtures and the real workspace
  store; the panel was exercised in jsdom, not in a browser at 1440/834/390 px.
- **No side-effecting tool exists**, so the approval path is exercised with a
  test-only fixture. The Mission 14 threat model covers what a real write tool would
  need before one is added.
- **Token and currency budgets are not enforced** because nothing measures them.
- **Revising a plan is operator-driven.** There is no automatic re-planning on new
  evidence; that is a deliberate limit of Mission 9, and the panel says so.
- **Scheduled or background execution does not exist.** Every step is requested by
  the operator; nothing wakes up and runs a step.
