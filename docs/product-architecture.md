# BlackLetter — Architecture

This document describes how BlackLetter is organized as a local-first research operating system, how its parts work together, and where the major surfaces live in the codebase.

## Overview

BlackLetter is a single-page application composed of five integrated engines:

1. **Learning Engine (v1.0)** — adaptive study modes, structured learning paths, and review flows.
2. **Research Workspace (v2.0)** — research sessions that become living documents with sources and reports.
3. **Knowledge Engine (v3.0)** — a knowledge graph that grows from documents, links concepts, and surfaces relationships.
4. **Research Canvas (v4.0, in development)** — a visual canvas for exploring ideas and graphs spatially.
5. **Offline Intelligence (v5.0, planned)** — a fully local, connection-independent intelligence layer.

Everything runs client-side first. All user data is written to IndexedDB in the browser, which makes the product private by default and ready to operate offline.

## System layers

```
┌──────────────────────────── UI layer ────────────────────────────┐
│ React 19 + TypeScript, Tailwind CSS, Framer Motion, Lucide       │
│  Compass · Notebook · Workshop · Canvas · Research Workspace    │
├──────────────────────────── State layer ─────────────────────────┤
│  Workspace store (workspace, sessions, prefs, graph)             │
│  Persisted to IndexedDB with localStorage fallback              │
├───────────────────────── Workflow layer ────────────────────────┤
│  LangGraph-inspired pipeline: intent → subject → evidence →     │
│  prompt → execution → quality → format → report                 │
├────────────────────────── Providers layer ──────────────────────┤
│  Model router (OpenRouter) — default provider                  │
│  Provider adapter interface for model access.                    │
├────────────────────────── Shell layer ──────────────────────────┤
│  Web build (Vite) · Desktop build (Electron)                   │
│  Dev relay (scripts/dev-server.mjs) — streams model responses │
└──────────────────────────────────────────────────────────────────┘
```

## Data flow

1. The user starts a prompt in a research session.
2. The workspace store commits the input and hands it to the workflow pipeline.
3. The pipeline classifies intent, detects the subject, checks for uploaded evidence, and builds a structured prompt.
4. The provider layer sends the request through the model router and streams the response back.
5. Each stage of the pipeline writes to the session state; the report is assembled and saved.
6. Every change to session state is persisted to IndexedDB, keeping the session restorable across reloads.

## Data & persistence

| Concern | Mechanism |
| --- | --- |
| Session history | IndexedDB, per-user browser profile, schema-versioned with migrations |
| Preferences | IndexedDB with a localStorage fallback, merged with defaults |
| Documents & sources | Local browser storage: no server ever stores the user's files |
| Knowledge graph | Grows from documents and session outputs; links to context and search history |
| Offline state | Local-first storage is the default foundation for offline intelligence |

## Framework & tooling footprint

- **React 19 + TypeScript** — the UI layer, fully typed.
- **Vite** — build tooling and the development server.
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
| `src/langgraph/` | The workflow pipeline, its nodes, and shared state types |
| `src/providers/` | Model provider adapters and the model router |
| `src/intelligence/` | Intelligence helpers, diagnostics, and pipeline tooling |
| `src/hooks/` | Shared application hooks |
| `src/stores/` | State stores backed by IndexedDB persistence |
| `src/styles.css` | Global styles and design tokens |
| `api/` | The model relay for the hosted deployment |
| `scripts/` | Development tooling (relay, icon generation) |
| `electron/` | Desktop shell |
| `public/` | Static application assets |
| `docs/` | Product and technical documentation |

## Network boundaries

Practically all of BlackLetter runs on the device. The only outward boundary is a request to the model router: a small relay keeps model credentials on the server side in the hosted deployment, while the desktop build talks directly to the model provider. Nothing about the user's research — notes, sessions, documents — leaves the machine.

## Related documents

- `docs/Design-System.md` — visual and interaction design language
- `README.md` — the public product