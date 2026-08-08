# BlackLetter

A local-first AI research operating system. Run deep research sessions, keep them organized in workspaces, attach documents, and visualize everything on a research canvas and knowledge graph — with a single AI path behind a server-side key.

Live demo: **https://blackletter-three.vercel.app/**

## What BlackLetter does

- **Research sessions** — type a question, pick a subject and research mode, and the multi-stage pipeline produces a structured report with sections, entities, timeline events, follow-up questions, and an intelligence summary (grounding, confidence, trace).
- **Workspaces, folders, documents** — organize sessions into workspaces and folders; upload `.txt`, `.md`, `.pdf`, `.docx` files (up to 10 MB) and have them analyzed as the topic of a session.
- **Knowledge graph** — every run derives nodes and edges; the graph powers gap detection ("you may want to learn X first") and context for later sessions.
- **Research canvas** — a free-form board of blocks (reports, notes, document extracts, generated artifacts) with version snapshots.
- **Split view** — run two sessions side by side.
- **Notebook (Ledger), document viewer, global search (Ctrl+K)** — local-first notes and documents with instant full-text search.
- **Two interface modes** — *Intelligence* (clean, product-focused) and *Developer* (pipeline diagnostics, run traces, telemetry). Toggle from the status bar or Settings.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite |
| Desktop | Electron (packaged shell that runs its own local API server) |
| AI | A single OpenRouter relay — `api/chat.ts` (Vercel serverless in production, `scripts/dev-server.mjs` locally/Electron). The browser never holds an API key. |
| Storage | Local-first — all state persists to the device via localStorage |

## Getting started

Requirements: Node 20+, an OpenRouter API key.

```bash
npm install
$env:OPENROUTER_API_KEY = "sk-or-..."   # local shell only — never committed
npm run dev                             # Vite on :5173 + Node API on :3000 (proxy /api)
```

Browser dev flow: Vite proxies `/api/*` → `http://localhost:3000` → OpenRouter. The key is read from `process.env.OPENROUTER_API_KEY` by `scripts/dev-server.mjs` only; the client sends no credentials.

## Configuration

| Variable | Where read | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `api/chat.ts`, `scripts/dev-server.mjs` (server-side only) | OpenRouter key; set in Vercel project settings for production, in the local shell for dev |

See `AUTH-AUDIT.md` for the full request path and key-handling trace.

## Building and testing

```bash
npm run build        # tsc -b && vite build → dist/
npm test             # vitest (src/test)
npm run lint         # eslint
npm run electron:build   # build + package the Windows desktop app
```

## Running locally

```bash
npm run dev            # Vite (5173) + Node API (3000) + Electron
npm run preview        # serve the built dist/ with vite preview
```

## Deployment (Vercel)

The Vercel project is pure Node — there is no Python runtime anywhere in the repository.

- The Vite app builds to `dist/` and is served as static assets.
- `api/chat.ts` is deployed as the single serverless function (`vercel.json` pins `maxDuration`/`memory`).
- Set `OPENROUTER_API_KEY` in Vercel project environment variables. The browser never sees it.

```bash
npx vercel --prod
```

GitHub Actions CI runs `npm install → tsc → test → build` on every push to `main`.

## AI request path

```
Browser/Electron  →  POST /api/chat  →  api/chat.ts (serverless) / dev-server.mjs (local)
                    process.env.OPENROUTER_API_KEY   →   OpenRouter  →  SSE  →  renderer
```

See `AUTH-AUDIT.md` for stage-by-stage verification and `DEPLOY-AUDIT.md` for the Vercel build/detection audit. `FINAL_RELEASE_AUDIT.md` documents the pre-release product audit and the fixes applied for 3.2.0.

## Documentation

- `docs/product-architecture.md` — how BlackLetter is organized
- `docs/Design-System.md` — design tokens and interaction rules
- `docs/Roadmap.md` — release plan
- `CHANGELOG.md` — change history
- `QA-AUDIT.md`, `QA-AUDIT-RC1.md`, `USER-ACCEPTANCE-REPORT.md` — prior audit and acceptance reports
