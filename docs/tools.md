# Tools: a registry, a policy gateway, and an audit trail

Mission 7 gave the model a way to *ask* for things to be done, and kept the
decision about whether they happen outside the model entirely. This document is
the contract: the allowlist, the gate, the budgets, the audit trail, and what is
**not** verified.

> **A prompt is not a security boundary.** Nothing in `src/tools` treats text as
> permission. A proposal is a request; `src/tools/policy.ts` decides.

## The registry is closed

`src/tools/registry.ts` defines seven tools in code and builds one frozen-by-convention
`Map`. There is no plugin directory, no registration API in production, and no way
for a proposal to add, replace or reconfigure anything — a proposal can only *name*
a tool that already exists. Adding a tool is a code change plus a guard test.

| Tool | Permission | Side effect | Timeout | What it reads |
| --- | --- | --- | --- | --- |
| `workspace.search` | `workspace:read` | none | 4 s | documents, notes, knowledge nodes: ranked hits with excerpts |
| `workspace.read` | `workspace:read` | none | 2 s | one item by id, bounded to 4 000 chars (max 8 000) |
| `workspace.status` | `workspace:read` | none | 1 s | counts by kind, memory totals, and the last run's outcome |
| `memory.search` | `workspace:read` | none | 3 s | memory records with category, epistemic status and origin note |
| `evidence.retrieve` | `evidence:read` | none | 6 s | scored passages with locators, via the pipeline's own chunker |
| `calculate` | `compute:local` | none | 1 s | a constrained arithmetic expression |
| `numbers.stats` | `compute:local` | none | 1 s | count/sum/min/max/mean/median of ≤ 500 numbers |

Every tool declares `name`, `description`, an input schema, an output
description, a timeout, an output cap, a required permission, a side-effect
class, and its high-impact actions. `highImpact` is empty for all of them, and an
architecture guard fails the build if a tool is added that writes, installs,
sends, publishes, pays, deploys or changes permissions without going through the
approval path.

`memory.search` was added with Mission 9, so a task can retrieve what the
workspace already knows instead of re-deriving it. It reads memory and never
writes to it: a record's retrieval timestamp is **not** updated by a tool call,
because a tool that wrote while it read would no longer be a read-only tool.

### What is *not* here, deliberately

No shell, no filesystem paths, no browser, no network client, no package manager,
no host credentials. `workspace.read` takes an **item id**, not a path, so a
`../../etc/passwd`-style argument is simply an id that matches nothing in the
approved workspace. There is no surface for path traversal because there are no
paths.

## The policy gateway

`evaluateToolCall` is a pure function: proposal in, decision out. It imports
neither the registry (the caller passes the tool in) nor a model adapter, holds no
state, and applies its rules in this order:

1. **The tool must exist.** An unknown name is denied as `unknown-tool`. A
   proposal cannot introduce a tool.
2. **The arguments must match the schema exactly.** Unknown fields are *refused*,
   not ignored — which is what makes `{"permissions": ["workspace:write"]}`
   fail as `invalid-arguments` rather than travel any further. There is no
   coercion: `"5"` is not a number.
3. **High-impact and side-effecting tools need an approval.** The approval is a
   parameter to the evaluator, never a field of a proposal, so a model cannot
   approve itself. Today this is exercised by tests with a fixture write tool
   because no registered tool needs it.
4. **The task must hold the tool's permission.** Tasks start with **no** grants
   (`createToolTask` defaults to `[]`); the Workshop console grants the three
   read-only permissions explicitly.
5. **The budget must allow the call** — see below.
6. **The same (tool, arguments) pair may not repeat without limit** (3 by
   default), so a loop cannot sit on one call.

Every refusal returns a code (`unknown-tool`, `invalid-arguments`,
`permission-not-granted`, `high-impact-requires-approval`, `budget-exhausted`,
`repeated-call`, `cancelled`, `timeout`, `tool-error`) and a reason that is safe
to display and to log.

### Where the gate runs

There is no separate server process for tools in this build: the desktop app has
no backend that could host one. The gateway therefore runs in the application
process, in a module that is independent of the provider adapter — and an
architecture guard keeps it that way: `src/providers/*` may not import
`src/tools`, and `src/tools/*` may not import a provider or the graph. The
separation the pack asks for ("validate server-side, not in the model adapter")
is preserved structurally; it is not a network boundary here, and this document
does not claim one.

## How a proposal is expressed

Neither provider's tool-calling support is verified, so the app does not pretend
to speak a native protocol. A model may emit exactly one explicit block:

```text
<blackletter-action>
{"tool": "workspace.search", "arguments": {"query": "reactor"}, "reason": "check the log"}
</blackletter-action>
```

Parsing rules (`src/tools/proposals.ts`):

- only an explicit block is a proposal; ordinary prose that mentions a tool name
  is just prose;
- one block per response, at most 4 000 characters, JSON object only;
- the envelope accepts `tool`, `arguments`, `reason` and **nothing else**;
- a malformed block is reported as unreadable, never guessed at.

**Parsing is not permission.** A parsed proposal goes through the same gateway as
one written by the operator by hand.

## Observing is not executing

When a run finishes, the pipeline records any proposal it finds in the model's
response (`observeProposals` in `src/langgraph/index.ts`). The audit entry says
`observed` / `observed-not-executed`, and nothing runs. Execution is a separate,
deliberate step: the Developer Mode console, or (in Mission 9) a task loop that
holds a budget.

Tool output is **neutralised** on the way out (`neutraliseActionBlocks`): a
document that contains its own `<blackletter-action>` block cannot smuggle a
proposal back in through retrieval. The text stays readable — it simply stops
being executable.

## Budgets

Per task, from `TOOL_BUDGET_LIMITS` (`src/tools/types.ts`):

| Budget | Default | Enforced by |
| --- | --- | --- |
| Call count | 12 | policy (before each attempt) |
| Wall time | 60 000 ms | policy (measured as accepted call time) |
| Output size | 200 000 chars | policy + executor (hard cap per tool) |
| Retries | 1 | policy (`isRetry` requests) |
| Identical calls | 3 | policy (history digests) |

**Characters, not tokens.** No tokenizer is available offline, and reporting a
token count the app did not measure would be a fabricated number. The budget is
therefore expressed in characters, and the panel shows it that way.

Retries happen for one reason only — a **timeout** — and only while the retry
budget lasts. A tool error is not retried; a refusal is not retried; a
cancellation is never retried.

## Cancellation

- A cancelled task executes nothing: the executor refuses before the tool runs
  and records `cancelled`.
- An in-flight asynchronous call is aborted through a linked signal (the task's
  signal merged with the tool's timeout), its result is **discarded**, and a late
  resolution of the tool's promise is ignored. The audit entry says the result was
  discarded.
- JavaScript cannot interrupt a synchronous function mid-flight. Every registered
  tool is synchronous and bounded; for those the abort is checked immediately
  before and immediately after the call. This is a real limitation and is stated
  rather than papered over.

## The audit trail

One entry per attempt — allowed, denied, needs-approval, cancelled, timed out, or
failed. Each entry carries the sequence number, time, task and workspace, tool,
who asked (`model` or `operator`), a digest of the arguments, a **summary** of
them, the decision, the code, the reason, any approval identity, the result
status, duration, output size, and a safe error code.

- **Content is not copied in.** Ids, numbers and short non-content strings are
  kept so the operator can see *what* was asked; content-bearing fields
  (`content`, `text`, `expression`, `passage`) are reduced to a digest and a
  length. Remembering what the app did never means storing what the operator read.
- **Immutable enough.** Entries are frozen, there is no update or delete API,
  each entry digests its own fields, and sequence numbers are monotonic across
  reloads. The trail is capped at 500 entries; what falls off is counted and
  shown rather than silently lost.

## Visibility

Developer Mode → **Tools** shows the registry (names, permissions, side effects,
timeouts, caps), a proposal console that runs a draft through the real gate with
the read-only grants, and the live audit trail including refusals. Nothing on
that panel executes automatically.

## What is not verified

- **No live model has proposed a tool call.** There is no `OPENROUTER_API_KEY` and
  no local model on this machine, so the observation path is covered by tests
  (`src/test/tools/proposals.test.ts`) rather than by a real completion.
- **No tool has run against a real research session.** The seven tools are tested
  against fixtures and the real workspace store (`src/test/tools/*.test.ts`), and
  the panel drives the real registry, gateway and audit trail — but a real run on
  a real document set has not been performed here.
- **The approval path is exercised with a test fixture**, because no registered
  tool requires approval. The gateway is tested independently of the registry;
  the fixture is refused if the test gate is closed outside a test build.
- **`workspace.status` is the honest stand-in for "repository status and test
  output".** This app has no repository and no test runner inside it; the tool
  reports workspace counts and the last run's evaluation outcome. No test output
  is invented to look complete.
- **Budgets are per task and in-memory**; they are not persisted, because a task
  does not outlive the request that created it. Durable tasks arrive in Mission 11.
