# BlackLetter — RC1 QA Audit

Audit date: 2026-08-07 · Target: Release Candidate 1 stabilization sprint.

Every interactive surface was audited (buttons, modals, dropdowns, navigation, shortcuts, AI/document/research workflows, workspaces, settings, exports, uploads, rename, folders, model selector, graph, animations, resize handles, responsive breakpoints). Findings below are verified against source. Severity: Critical → High → Medium → Low.

---

## Critical

### C1. Toasts never render
`src/components/ui/toast.tsx:34` — `getToasts()` returns the live `toasts` array reference. `useSyncExternalStore` compares snapshots by `Object.is`, so when a toast is pushed/spliced in place the snapshot reference never changes and the container never re-renders. Result: every `toast(...)` call (success/error/feedback) is invisible.
- Location: `toast.tsx:29-34` (subscribe/getToasts)
- Fix: return a new array (`[...toasts]`) from `getToasts`.

### C2. NodeInspector stale drafts overwrite the wrong node
- `src/components/knowledge/NodeInspector.tsx:26-28` — `labelDraft`/`noteDraft` are initialized from `node` once at mount. `GraphView.tsx:277` renders `<NodeInspector node={selectedNode} …/>` with **no `key`**, so switching nodes keeps the previous node's drafts. The textarea's blur handler writes a stale draft into the newly-selected node (`:262`), and `saveLabel` does the same (`:50-56`). Editing node A then clicking node B and typing overwrites B's label/notes with A's content.
- Fix: key by `node.id` in `GraphView` and re-initialize drafts when `node.id` changes.

### C3. Server error codes discarded → wrong UX
- `src/providers/openrouter.ts:117-120,155` — on SSE error the server's structured `code` (e.g. `NO_KEY`, `RATE_LIMITED`, `MODEL_NOT_FOUND`) is thrown away; any `parsed.error` is re-mapped to `"SERVER"`. The `api/chat.ts` SSE contract sends `{ error: { code, message } }`, and `scripts/dev-server.mjs:74-86` emits `NO_KEY` when `OPENROUTER_API_KEY` is missing — the client never sees it.
- downstream: `src/langgraph/graph.ts` / `src/langgraph/execute` store only the message; `use-chat-turn.ts:80-86` and `ResearchWorkspace.tsx:157-164` hard-code `{ code: "SERVER" }`. `AiErrorBanner` only shows the "Open Workshop" settings button for `NO_KEY/INVALID_KEY/MODEL_NOT_FOUND` (`ai-error-banner.tsx:38-40`) but nothing passes `onOpenSettings`, so the "workshop" path is unreachable from an error.
- Fix: preserve the code end-to-end; pass `onOpenSettings` into `AiErrorBanner`.

### C4. DOCX extraction returns garbage
- `src/pipeline/documentEngine.ts:49-85` — `parseZipEntries` reads the central directory but **never inflates** entry data (compression method 8). It slices `compSize` bytes of raw deflate and decodes them as UTF-8, so real `.docx` files yield noise; only uncompressed files happen to work.
- Note: `src/lib/ai.ts:124-217` already contains a working zip-inflate implementation (`parseZip` + `inflateRaw` + Huffman trees) used for the legacy path.
- Fix: port the inflate logic from `lib/ai.ts` into `documentEngine.ts`.

### C5. Selected research mode has zero effect on the pipeline
- `src/components/research/ModeSelector.tsx` emits ids (`deep-research`, `literature-review`, …), `ResearchWorkspace.tsx:124` passes them as `metadata: { researchMode: mode }`, but:
  - `runPipeline` (`src/langgraph/index.ts:37-49`) never reads `input.metadata`.
  - Only `src/langgraph/createInitialState` reads `mode` (`state.ts:8`), but no node in `src/langgraph/*` uses it; `buildSystemPrompt`/`buildResearchPrompt` in `src/lib/research.ts` read `intent` only, never the mode.
  - `src/components/research/ModeSelector.tsx` also hardcodes `MODE_LABELS`-style labels that duplicate (and drift from) the `MODE_LABELS` map in `src/lib/research.ts`.
- Result: picking a research mode shows a misleading spinner pipeline; the model is not instructed accordingly.
- Fix: thread `researchMode` through `PipelineRunInput` → `GraphState` → prompt builder.

### C6. HTML export is raw markdown
- `src/components/research/ReportExport.tsx:30-31` — the HTML format just replaces `\n` with `<br>` on raw markdown (`#`, `**`, `-`, backticks all appear literal). The app already has a working markdown renderer in `ResearchReport.tsx:28` (`renderMarkdown`); the report modal is `ResearchWorkspace`'s own `ReportExport`.
- Also the modal has no Escape/backdrop-close.
- Fix: export/reuse `renderMarkdown`, add Escape + backdrop close.

### C8. Follow-up retry re-runs wrong query and hides the report
- `src/components/research/ResearchWorkspace.tsx:81-165`:
  - `commitRun` pushes the user message and sets `phase:"researching"` but doesn't persist the topic for a follow-up question; on failure the catch (`:157-164`) stores `error` and keeps `phase:"researching"`. Combined with `handleFollowUp`/`handleRetry` (`:174-180`) that re-call `commitRun(tab.topic||tab.title,…)`, a failed retry does **not** preserve the user's failed query, and the phase machine on an already-`complete` tab flips back to the "Assembling intelligence" spinner, hiding the existing report.
- Fix: on error, keep the report visible (don't force `researching` when a report already exists); make retry reuse the exact failing prompt.

### C7. Server-sent error codes lost in `api/chat` SSE path (client)
- same family as C3 but on the direct `openrouter.ts` SSE consume path (`:100-120`) — the client treats every `{error}` as HTTP `SERVER`; the `code` field isn't forwarded to `AiError`. Even correct `429` counts up (HTTP-level handles 429, ok) but structured body codes (`NO_KEY`, etc.) are dropped.

---

## High

### H1. Canvas chat block hides failure state
- `src/components/canvas/blocks.tsx:141-204` — `ChatBlockContent` renders messages but never displays `tab.error`; `use-chat-turn` sets `phase:"complete"` + `error` on failure (`use-chat-turn.ts:81-84`), so a canvas session that fails with "NO_KEY" looks like a completed session with zero messages and no "Open Workshop" affordance.
- Fix: render the error banner inside the chat block (needs an `onOpenSettings` path).

### H2. Knowledge graph not interactive
- `src/components/knowledge/KnowledgeCanvas.tsx:171-172` — `onNodesChange=noop`, `onEdgesChange=noop`; node drag and edge creation do nothing. GraphView's `selectedId`/`onSelect` works but the canvas advertises drag handles that are dead.
- Fix: wire `onNodesChange`/`onEdgesChange` through a local flow state (or pass through `nodesDraggable`/`edgesConnectable` + `onConnect`).

### H3. Canvas "New AI session" from empty state selects wrong id
- `src/components/canvas/CanvasView.tsx:417` — creates a tab then calls `setSelectedId(id)` with the **tab id**, not the returned **block id**. Selection/deletion/arrow keys act on a non-existent block.
- Fix: capture `addCanvasBlock` return value.

### H4. Zoom keyboard anchor uses container coords as viewport coords
- `src/components/canvas/CanvasView.tsx:117-124` — `zoomAt(clientX, clientY, …)` expects viewport coords but the Ctrl+/-/0 handlers (`:266-269`) pass `size.w/2, size.h/2` (container-relative). Deeper zoom centers wrong; `zoom` uses `px = clientX - rect.left`, but should use `rect.width/2`.
- Fix: pass `rect.left + size.w/2` etc.

### H5. Snapshot restore has no confirm
- `src/components/canvas/CanvasView.tsx:491-492` — one click on a version row immediately overwrites the canvas via `restoreCanvasSnapshot` with no dialog.
- Fix: in `workspaceStore.restoreCanvasSnapshot` or in the history menu, confirm first.

### H6. Electron `file://` dev launch can't reach API
- `package.json` `electron:dev` = `concurrently "vite" "wait-on http://localhost:5173 && electron ."` — but the `dev` script also needs `node scripts/dev-server.mjs`. The user gets 5173 UI with no backend, and the dev-server (serving `/api/chat`) only runs under the "web" `npm run dev`. `api/chat.ts` other than path `/api/chat` reachable via `file://` in Electron anyway.
- Fix: start dev-server in the electron:dev script (document) or document.

### H7. Landing: several footer links dead/no-op
- `src/components/landing/Landing.tsx:901, 1246, 1249` — "Documentation", "Privacy" are `href="#"` no-ops. `How it works` is an anchor (fine).
- Fix: point documentation to real docs path or open modal.

### H8. Data-viewer DocumentViewer not integrated
- `src/components/app/DocumentViewer.tsx` — entirely local `useState` (`documents`, `activeDocId`), not wired to the workspace store; annotations button (`:98` BookMarked) and download (`:99`) have no `onClick`; PDF upload shows `[PDF: name]` placeholder text (`:35`); search input has no filtering logic.

### H9. Doc clicks in LeftSidebar/Dashboard do nothing relevant
- `src/components/app/LeftSidebar.tsx:337-340` — document rows are `div` with no `onClick`. `GlobalSearch.tsx:60-62` navigates workspace only (not the document). `Dashboard.tsx:104` recent docs also only switch workspace.
- Fix: document-row clicks should open Documents workspace (add `prefs.documentsViewOpen`) and focus the doc.

### H10. Graph edges style/layout no drag, but `GraphView` layout jumps on selection
- `GraphView.tsx:87-89` re-runs `layoutKnowledge` with new `anchorId` on every selection, which re-centers/relayout the graph — jarring when selecting nodes. Medium but listed high since it is actively present on the primary "Knowledge Graph" tool.

---

## Medium

### M1. `prefs.autosave` is respected, but preferences-like `requestSave` writes per-scroll
- `src/stores/workspace-store.ts:572-577` — `setTabScrollTop` calls `requestSave()` → debounced `localStorage` write + notify on every scroll frame (performance + storage churn).
- Fix: don't `requestSave` in `setTabScrollTop` (or throttle to visibility-hide).

### M2. Electron dev and build full-flow (structural)
- `electron/main.cjs` dev path loads `http://localhost:5173` (fine); packaged build (`dist/index.html`) has no `/api/chat` — everything AI is period dead in the packaged app. Needs a local runtime or documented limitation banner.

---

## Low / Cosmetic

- `AiEcosystem.tsx` marquee config — verified working (injects `@keyframes` via `<style>` and uses `marquee-left/right` classes); documented here as verified-OK to avoid regressions.
- `MODE_LABELS` label drift vs `ModeSelector` — covered in C5.
- `intelligence/`, `teaching/adaptive-engine.tsx`, `pipeline/` may be unused orphan code paths — check and trim.

---

## Verification notes
- `python -m pytest`: 22 passed, 0 failed (baseline, before fixing).
- `npm run typecheck` — baseline before sprint; not yet re-run (pending after fixes).

---

## Fix status (post-audit, same day)

| ID | Status | Fix |
|----|--------|-----|
| C1 | Fixed | `toast.tsx:34` `getToasts()` returns `[...toasts]` |
| C2 | Fixed | NodeInspector rendered with `key={selectedNode.id}` in `GraphView.tsx` |
| C3 / C7 | Fixed | `openrouter.ts` preserves `err.code` on SSE error; `errorCode` threaded `GraphState` → `LLMNode` → `graph.ts` → `runPipeline` throw (`Error` with `.code`) → `use-chat-turn`/`ResearchWorkspace` catch; `AiErrorBanner` `onOpenSettings` wired in ResearchWorkspace + canvas block |
| C4 | Fixed | `documentEngine.ts` `parseZipEntries` rewritten with full raw-DEFLATE inflater (fixed/dynamic Huffman, method 8); verified typecheck |
| C5 | Fixed | `researchMode` threaded `PipelineRunInput.metadata` → `GraphState` (`state.ts`) → `PromptBuilderNode` (RESEARCH MODE line + subject guard); `lib/research.ts` union/labels widened |
| C6 | Fixed | `ReportExport.tsx` rewritten: `renderMarkdown` (exported from `ResearchReport.tsx`) for HTML; Escape-key + backdrop close |
| C8 | Fixed | `commitRun` persists `topic`; on error phase stays `complete` when report exists (else `researching`); retry reuses exact failing prompt |
| H1 | Fixed | `blocks.tsx` ChatBlockContent renders `AiErrorBanner` with retry/dismiss/open-settings |
| H2 | Fixed | `KnowledgeCanvas.tsx`: `nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false}` |
| H3 | Fixed | `CanvasView.tsx` empty-state uses returned block id |
| H4 | Fixed | `CanvasView.tsx` `zoomAtCenter` uses `rect.left + size.w/2` (viewport coords) |
| H5 | Fixed | `CanvasView.tsx` snapshot restore gated by `window.confirm` |
| H6 | Fixed | `package.json` `electron:dev` starts `node scripts/dev-server.mjs` alongside vite/electron (waits on 5173 + 3000) |
| H7 | Fixed | `Landing.tsx`: logo → `#top` (id added); Documentation/Privacy → GitHub repo (target=_blank) |
| H8 | Fixed | `DocumentViewer.tsx` wired to workspace store (`documents` of active workspace), real text extraction via `extractTextFromFile` (txt/md/pdf/docx), search filters pages with hit count + jump, working download, annotations → "coming soon" toast, `focusDocumentId` pref opens + resets |
| H9 | Fixed | Doc row clicks in `LeftSidebar.tsx`, recent docs in `Dashboard.tsx`, document hits in `GlobalSearch.tsx` → `documentsViewOpen: true, focusDocumentId: doc.id` (view-switch handled by `OperatingSystem.tsx`) |
| H10 | Fixed | `GraphView.tsx` layout memo deps `[subgraph, navAnchor, timelineMode]` (no `selectedId`); `anchorId={navAnchor}` |
| M1 | Fixed | `setTabScrollTop` no longer `requestSave()`s (notify only; scroll restored on tab mount) |
| M2 | Documented | Packaged build has no AI backend — structural limitation; dev/web flows fine (documented, no code fix) |
| Low | Kept | `AiEcosystem` marquee verified working (inline styles) — untouched; orphan code paths (`intelligence/`, `teaching/adaptive-engine.tsx`, `pipeline/`) still to trim in a later sprint |

Regression checks after fixes:
- `npx tsc -b` (noEmit): clean.
- `.venv\Scripts\python.exe -m pytest tests/`: 22 passed.
- `npm run test` (vitest): 12 files, 168 tests passed.
- `npm run lint`: not runnable (eslint not installed — no eslint config/dep in repo).

---

## RC2 sprint — AI Workspace upgrade (post-audit, same day)

No UI redesign. All intelligence implemented in TypeScript inside the live langgraph pipeline so the client works in Electron without the Python backend (Python `api/` + `retrieval/` kept as a separate, unintegrated reference).

### New intelligence pipeline (live path)
- `src/pipeline/scoring.ts` — tokenize/estimateTokens/queryTerms, BM25-lite `scoreChunks` (relevance + coverage + sourceQuality + recency + positionBias composite), `rerankChunks(topK=8)`, `groundedSources(threshold 0.22)`, `computeFaithfulness` (claim-level support ratio; `score:null` when no corpus), `detectHallucination` (numeric/named-claim flags), `computeConfidence` (0–100 from retrieval/faithfulness/completeness/stability; clamp 5–98), `confidenceLabel`.
- `src/pipeline/trace.ts` — `Trace` (start/end/skip/fail), 15-stage `TraceStageId`, `PipelineTelemetry`, `onPipelineEvent` emitter + `LAST_EVENTS` (cap 200, powers Developer Mode).
- `src/observability/metrics.ts` — `recordRun`/`recordError`/`loadObservability`/`clearObservability` persisted to IndexedDB kv (`observability-runs` cap 1200 / `observability-errors` cap 500); derived `dailyUsage`, `perModel` (avg + p95 latency), `perWorkspace`, `confidenceTrend`, `overallStats`.
- `src/lib/memory.ts` — `WorkspaceMemory` (goals/concepts/gaps/entries), `FOLLOWUP_PATTERNS`, `resolveFollowup` (continue/elaborate/compare/clarify/summary/examples → expands prompt with prior topic), `extractConcepts/Goals/Gaps`, `rememberExchange` (cap 40), `formatMemoryContext`.
- Langgraph wiring: `GraphState`/`PipelineRunInput` gained `runId/workspaceId/tabId/memoryContext/canvasContext/trace/retrievedChunks/groundedSources/faithfulness/hallucination/confidence/telemetry/traceStages`; `state.ts` generates `runId` + Trace; new `RetrievalNode` (corpus = document chunks via `--- Name ---` split, knowledge context, canvas context, history; 700-char/120-overlap sentence-boundary chunks; score + rerank top 8; self-traced) and `EvaluationNode` (faithfulness/hallucination/confidence + telemetry). `graph.ts` edges `KnowledgeGapNode→RetrievalNode→PromptBuilderNode`, `QualityNode→EvaluationNode→FormatterNode`; per-node trace wrapper (node→stage); `response` end stage. `PromptBuilderNode` adds PREVIOUS EXCHANGE (last 6), RESEARCH MEMORY, CANVAS CONTEXT, RETRIEVED EVIDENCE, GROUNDING RULE, CONTINUITY RULE. `IntentNode` followup patterns; `SubjectNode` inherits prior subject for followups. `runPipeline`/`toPipelineResult` expose full intelligence envelope and record run/error telemetry (failure still `Error` with `.code`). `PipelineResult.intelligence` added.
- Every response now carries Confidence, Grounded Sources, Retrieved Chunks, Reasoning Trace, Faithfulness — surfaced via `IntelligenceStrip` in the research report, canvas chat block, canvas report block, and appended to HTML/Markdown report exports.

### Store + session features
- `Prefs` + `defaultPrefs` + `PersistedState` extended (`developerMode`, `splitView`, `splitTabId`, `floatingChatOpen`, `floatingChatTabId`, `workspaceSnapshots`, `templates`, `memory`); hydrate merges defaults + loads observability.
- New store methods: `pushTabEvent`, memory CRUD (`getMemory/setMemory/clearMemory/rememberExchange/memoryContextFor/resolveFollowupQuery`), `canvasContextFor` (block texts incl. new types, capped 6000 chars), workspace snapshots (`addWorkspaceSnapshot` cap 10 / `restoreWorkspaceSnapshot` with confirm / `deleteWorkspaceSnapshot`), templates (`addTemplate` cap 20 / `deleteTemplate` / `createWorkspaceFromTemplate`).
- `ResearchWorkspace.tsx` + `use-chat-turn.ts`: pass `workspaceId/tabId/memoryContext/canvasContext` into `runPipeline`, persist compacted `tab.intelligence` (4 chunks × 400 chars), `rememberExchange` on success, `pushTabEvent` created/started/completed/failed; followup prompts rewritten via `resolveFollowup` before dispatch.
- Split view (draggable divider, side-tab picker, toggle in session header) and draggable Floating AI chat (StatusBar toggle, own pinned tab, reuses chat block incl. intelligence strip).
- Canvas expansion: new block types `mindmap`, `table`, `image`, `pdf` (types, default sizes, glyph menu entries, editable renderers, PDF reuses linked document text); `CANVAS_BLOCK_TITLES` + canvas context extended.
- Observability UI: new `SystemStatus` tool view (overview stats, 14-day usage, confidence trend, per-model/per-workspace tables, run + error logs, clear) and `DeveloperMode` (live pipeline event feed + last-run stage trace + timings; enabled via Settings or System Status toggle). Settings gained Research memory (show/clear), Developer Mode, session timeline, snapshots, templates; `StatusBar` gained AI-chat toggle. `OperatingSystem` registers the `system` tool.
- QA refresh: `npx tsc -b` clean; `.venv\Scripts\python.exe -m pytest tests/` 22 passed; vitest 12 files / 168 tests passed.

---

## RC-1 hardening audit (august sprint)

Second full audit pass against the post-RC2 tree. Findings verified against source (agent import-graph cross-checks + manual verification; several agent claims were refuted on inspection and are marked verified-not-issue).

### Critical
- **Packaged Electron has no AI backend.** `electron/main.cjs` loads `dist/index.html`, which fetches `/api/chat` with no server in the packaged app — every AI/research flow is dead on a release build (also H6/M2 from the earlier audit were only "documented"). `package.json` `build.files` only ships `dist/`, `electron/`, `public/`.
  - Fix: `main.cjs` spawns the existing `scripts/dev-server.mjs` when `!isDev` (via `process.execPath` + `ELECTRON_RUN_AS_NODE=1`), kills it on `will-quit`; `scripts/**` added to `build.files`. `preload.cjs` exposes `electronAPI.apiBase` (`""` in dev, `http://127.0.0.1:3000` packaged, passed through `additionalArguments`). `dev-server.mjs` gained CORS + `OPTIONS` preflight so the packaged renderer can call it cross-origin. `openrouter.ts` prefixes `fetch` with `apiBase` when Electron is detected (`lib/electron.ts`), falling back to relative `/api/chat` (Vite proxy / Vercel serverless).

### High
- **`fileContent` contract drift.** `openrouter.ts` serialized `fileContent` into the `/api/chat` body, but neither `dev-server.mjs` nor `api/chat.ts` reads it (the document already flows inside the prompt). Sent duplicate tokens and implied server support that does not exist. Fix: the client body no longer sends `fileContent`; `AiRequest.fileContent` kept as a deprecated-inert field so all callers compile; `LLMNode`/`provider.ts` calls updated.
- **Unbounded prompt size.** `PromptBuilderNode` embedded document text, knowledge graph context and memory verbatim (a 10 MB PDF could inflate the prompt). Fix: truncation guards — document 40k chars, knowledge 8k, memory 4k, evidence 15 chunks, history 6×600 — with inline truncation markers.

### Medium
- **C3-family error-code loss on thrown node errors.** `graph.ts:172` catch block dropped a thrown `{ code }` (only message). Fixed: `errorCode: (e as {code})?.code ?? (e as {errorCode})?.errorCode ?? "SERVER"` in the returned `GraphRunResult`. `DocumentNode` unsupported-type now throws `Error` with `code: "UNSUPPORTED_FILE_TYPE"`; empty extraction returns `errorCode: "EXTRACTION_FAILED"`.
- **Dead code removed.** Verified zero-importer files deleted: `src/lib/ai.ts` (legacy parser that also logged 500 chars of every uploaded document to the console), `src/components/ui/{ai-aurora-blob,badge,dock,download-modal,glass-folder,knowledge-convergence,looping-words,separator}.tsx`, `src/components/onboarding/Onboarding.tsx`, `src/components/research/KnowledgeGraph.tsx`. Also removed an accidentally-created corrupt root file (`scripts import tmp-cycle import spec js import`).

### Low
- `Timeline.tsx:35` removed `cursor-pointer` from a non-interactive card.
- `src/lucide-react.d.ts` — duplicated `export const Scale` declarations collapsed to one.
- `LeftSidebar.tsx` archived workspace rows wired to the real rename flow (previously `renaming={null}` / `onRename={() => {}}`).
- `Landing.tsx` "Launch BlackLetter" CTA pointed at the stale Vercel link; now calls `onEnter` to launch the app.

### Agent claims refuted on verification (no change made)
- "Unused `useWorkspaceHotkeys` in `LeftSidebar.tsx`" — actually used. "Timeline `onClick`" — no, but cursor-pointer was misleading; removed. "11 UI dead components" — reduced to 10 after verifying actual importers. Missing renames/role gaps already covered by prior sprint fixes.

### Live verification
- `npx tsc --noEmit`: clean (exit 0).
- `node --check` on `electron/main.cjs`, `electron/preload.cjs`, `scripts/dev-server.mjs`: clean.
- `npm run build` (tsc -b + vite): built in 28.8s, exit 0.
- `npx vitest run`: 12 files / 168 tests passed.
- `.venv\Scripts\python.exe -m pytest`: 22 passed.
- `npm run lint`: not available (eslint not configured in repo).

### Known remaining (deferred, non-blocking)
- Whole-directory dead code (`src/multi-agent`, `src/architect`, `src/cognitive`, `src/learning`, `src/research`, `src/intelligence`, `src/studio`, dead `src/pipeline/*` modules, `src/engine`, `src/teaching`) verified zero importers from the live graph but left in place because they are wired into shared `tsconfig` and have passing tests; removal needs a coordinated sprint.
- Single `index-*.js` chunk > 500 kB (vite warning) — candidate for route-based code-splitting in a later sprint.