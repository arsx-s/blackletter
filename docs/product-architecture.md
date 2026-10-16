# BlackLetter — Architecture

This document describes how BlackLetter is organized as a local-first research operating system, how its parts work together, and where the major surfaces live in the codebase.

It is written against the code as it exists. Where a capability is partial or planned, it is labelled as such rather than described as finished.

## Overview

BlackLetter is a single-page application built around five engines. They are at very different levels of maturity, and the difference matters when reading the rest of this document:

| # | Engine | Status | What that means |
| --- | --- | --- | --- |
| 1 | **Learning Engine** | In use | Adaptive study modes drive both the Simple shell and the Workshop pipeline. |
| 2 | **Research Workspace** | In use | Research sessions produce stored reports, sources, entities, and follow-up questions. |
| 3 | **Knowledge Engine** | In use | A knowledge graph grows from documents and session outputs. |
| 4 | **Research Canvas** | In use, still evolving | A spatial canvas over the knowledge graph. |
| 5 | **Offline Intelligence** | Planned, not implemented | No local model runtime ships today; see "Network boundaries". |

All *user data* is written client-side first, into IndexedDB in the browser. That part is complete and is what "local-first" refers to here. Model inference is not local: every answer is produced by a remote provider, reached through a server-side relay.

## Runtime processes

There are three processes, and knowing which holds what is the key to reading the rest of this file:

| Process | Role | Holds `OPENROUTER_API_KEY` |
| --- | --- | --- |
| Vite / packaged renderer | The React app. Owns all user data. | No |
| `api/chat.ts` (Vercel function) | Hosted relay. | Yes |
| `scripts/dev-server.mjs` (Node) | Local dev relay **and** the relay used by the packaged desktop app. | Yes |

Both relays run the same request policy, which lives in one shared module, `src/server/relay-guard.mjs`: origin check, required bearer token for hosted use, per-client rate limit, body-size cap, and field/model validation. Local loopback development can omit the token. Client-facing errors never carry stack traces or upstream provider bodies. See `SECURITY.md` for the full description.

The default model id is likewise defined once, in `src/config/model-defaults.mjs`, and imported by the browser catalogue and by both relays.

## System layers

```
┌──────────────────────────── UI layer ────────────────────────────┐
│ React 19 + TypeScript, Tailwind CSS, Framer Motion, Lucide       │
│  Compass · Notebook · Workshop · Canvas · Research Workspace     │
│  Simple (chat) shell, and a developer-mode shell                 │
├──────────────────────────── State layer ─────────────────────────┤
│  Workspace store (workspaces, tabs, prefs, graph, memory)        │
│  Persisted to IndexedDB with a localStorage fallback             │
├───────────────────────── Workflow layer ────────────────────────┤
│  LangGraph-style state machine (src/langgraph/):                 │
│    UserInput → Intent → Subject → Router → Document →            │
│    LearningProfile → KnowledgeGap → Retrieval → PromptBuilder →  │
│    LLM → Quality → Evaluation → Formatter → Report               │
├────────────────────────── Providers layer ──────────────────────┤
│  AiRequest / AiStreamEvent interface (src/providers/)            │
│  OpenRouter relay and opt-in local Ollama adapter                │
├────────────────────────── Relay layer ──────────────────────────┤
│  src/server/relay-guard.mjs — the shared request policy          │
├────────────────────────── Shell layer ──────────────────────────┤
│  Web build (Vite) · Desktop build (Electron)                     │
│  Both reach the model through a relay on 127.0.0.1 or the host   │
└──────────────────────────────────────────────────────────────────┘
```

## Data flow

1. The user submits a prompt in a research session (Simple shell or Workshop).
2. The caller (`src/components/canvas/use-chat-turn.ts`, or `ResearchWorkspace`) creates an `AbortController` and calls `runPipeline` from `src/pipeline/index.ts`.
3. The state machine runs the nodes above. Nodes mutate a per-run `GraphState`; they do **not** write to the workspace store.
4. `LLMNode` streams from the provider. The stream is currently **buffered to completion** before the caller sees anything — there is no token-by-token UI yet.
5. On success the caller writes once to the workspace store: report text, parsed sections, entities, timeline, notes, follow-up questions, telemetry, and a derived graph.
6. Every workspace-store change is persisted to IndexedDB, keeping the session restorable across reloads.
7. Cancellation is honoured end to end: the `AbortSignal` is threaded through `runPipeline` → the graph node → `generateStream` → `fetch`, so stopping a run aborts the network request rather than merely hiding it. A cancelled run writes no partial result.

## Data & persistence

| Concern | Mechanism |
| --- | --- |
| Session history | IndexedDB, per-user browser profile |
| Preferences | IndexedDB with a localStorage fallback, merged with defaults |
| Documents & sources | Local browser storage; no server stores the user's files |
| Knowledge graph | Grows from documents and session outputs; links to context and search history |
| Schema versioning | **Not yet implemented.** A single IndexedDB `kv` store at `DB_VERSION = 1`, with no application-level record versioning or migration step. Treat this as a gap, not a guarantee. |
| Offline state | Local-first storage is the default foundation for offline intelligence; inference still requires network access. |

## Network boundaries

The only outward boundary is the relay call to the model provider. Two corrections to how this is often described:

- **The desktop build does not talk to the provider directly.** `electron/main.cjs` starts `scripts/dev-server.mjs` and the renderer calls `http://127.0.0.1:<port>/api/chat`. The packaged app therefore ships the same relay — which is why that relay binds to loopback only and enforces the shared policy.
- **Not everything about the user's research stays on the machine.** Notes, sessions, documents, and the knowledge graph are stored locally and are never uploaded as files. But the pipeline builds a prompt from your question plus the extracted text of any attached documents, and that prompt is sent to the model provider to produce the answer. Attaching a document means its text is processed remotely.

Requests to the relay are subject to the policy described in `SECURITY.md`, including a model-id allowlist, because an unrestricted model id is an unbounded-spend vector.

## Framework & tooling footprint

- **React 19 + TypeScript** — the UI layer, strictly typed.
- **Vite** — build tooling and the development server (loopback by default).
- **Tailwind CSS** — utilities plus a tailored design language (see `docs/Design-System.md`).
- **Framer Motion** — motion and interaction.
- **React Flow** — canvas-based graph rendering.
- **lucide-react** — iconography.
- **Vitest** — unit and integration tests.
- **Electron** — the desktop distribution.

## Module map

| Path | Purpose |
| --- | --- |
| `src/` | Application source: components, stores, providers, and the workflow engine |
| `src/langgraph/` | The live workflow state machine, its nodes, and shared state types |
| `src/pipeline/` | Public pipeline barrel (`index.ts`) plus scoring, tracing, and the document engine |
| `src/providers/` | The provider interface and its single OpenRouter implementation |
| `src/server/` | Server-side modules shared by both relays |
| `src/lib/` | Cross-cutting utilities (cancellation, relay auth, storage, formatting) |
| `src/stores/` | State stores backed by IndexedDB persistence |
| `src/intelligence/` | Pipeline diagnostics and tooling. **Not reachable from the UI** — no component imports it. |
| `src/styles.css` | Global styles and design tokens |
| `api/` | The model relay for the hosted deployment |
| `scripts/` | Development tooling (relay, icon generation) |
| `electron/` | Desktop shell |
| `public/` | Static application assets |
| `docs/` | Product and technical documentation |

Three further trees exist in the repository but are not wired into the running application: `src/teaching`, `src/cognitive`, `src/learning`, `src/architect`, `src/multi-agent`, and `src/engine`. Some of them are covered by tests and some of their types are imported by live code, so they are not dead in the "safe to delete" sense — but no route reaches them. They are listed here so the module map matches reality rather than intent.

## Known gaps

These are recorded deliberately, so the next reader does not have to rediscover them:

- No schema versioning or migration for persisted records.
- Responses are not streamed to the UI; a long answer shows a progress indicator, not tokens.
- Ollama is an opt-in adapter for an already-running local runtime; it does not install or download models. Hardware/model compatibility remains runtime-dependent.
- `src/pipeline/pipeline.ts` contains a second, unreferenced `runPipeline`. It is intentionally left in place and is kept unreferenced by an architecture test.

## Related documents

- `SECURITY.md` — the relay's access model and reporting process
- `docs/Design-System.md` — visual and interaction design language
- `README.md` — the public product
