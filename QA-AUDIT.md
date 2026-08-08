# BlackLetter — Stability & QA Audit

**Status:** Complete
**Build:** `npm run build` (tsc -b + vite build) — PASS
**Tests:** `npm test` — 11 files, 167/167 PASS (incl. 32 workspace-store tests)
**Scope:** v1.0 — stability pass only, no new features. Verified settings, persistence, and all seven high-priority bugs.

---

## Bugs (high priority)

| # | Location | Problem | Root cause | Fix | Status |
|---|----------|---------|------------|-----|--------|
| 1 | LeftSidebar | Sessions could not be renamed in the sidebar | No rename affordance; `commitRename` only handled folders | Inline rename input (`TabItem`): double-click or context menu → Rename; Enter commits via `renameTab`, Escape cancels, blur commits | Fixed |
| 2 | Shell | No explicit "New Research Session" flow; sessions created with placeholder title | Only bare `createTab` exposed | `NewSessionModal` (name + workspace + optional folder; Enter creates, Esc/backdrop cancels) + store `createSession`; wired into OperatingSystem (Ctrl+N), ResearchWorkspace (empty state + toolbar), TabBar "+", Dashboard quick action | Fixed |
| 3 | Model picker | Flat model list; unclear grouping | Only `MODEL_CATALOG` used | `MODEL_CATEGORIES` (6 categories: fast/balanced/reasoning/creative/coding/research) with descriptions; picker groups by category, checkmark = `categoryForModel(tab.model)`; chip label now matches checkmark logic | Fixed |
| 4 | OperatingSystem | Sidebar only rendered on Home; collapsed on every other screen | `view === "home"` gate | Sidebar + resize handle render on all views; Ctrl+B toggles everywhere | Fixed |
| 5 | Editor font size | Setting had no effect on report/notebook/inputs | Hardcoded font sizes | CSS vars `--bl-font/--bl-code/--bl-lh` + `[data-fontsize]` on shell root + `.bl-prose`/`.bl-code`; ResearchReport, Notebook, ResearchWorkspace textareas wired; Settings select writes `prefs.fontSize` | Fixed |
| 6 | Recent sessions | Recents were empty/stale/unordered | Recents read a dead `history` local state | `lastOpenedAt` stamped on `setActiveTab`; Recent section = pinned-first, `lastOpenedAt ?? updatedAt` desc, top 8, with search + full context menu; Dashboard recents/pinned re-sorted | Fixed |
| 7 | Chat persistence | App reload could not restore session state | Partial persistence + no scroll restore | Store upgraded to version 2 with migration (defaults for new prefs, `lastOpenedAt`, `scrollTop`); `setTabScrollTop` action; ResearchWorkspace restores scroll on mount and saves throttled on scroll. Messages/fullText/sections/entities/pipeline/phase already persisted via `updateTab` + debounced IndexedDB save | Fixed |

## Settings & persistence verification

| Path | Status |
|------|--------|
| Prefs (fontSize, spellcheck, wordWrap, autosave, defaultMode, temperature, maxTokens, sidebar/panel sizes, layout) | Persisted via `prefs` → app-state key (IndexedDB with localStorage fallback), merged with `defaultPrefs()` |
| Settings app page binds live store prefs (was dead local useState) | Fixed |
| temperature / maxTokens end-to-end | Fixed — prefs → `runPipeline` input → GraphState → LLMNode → `generateStream`/`streamOpenRouter` → `/api/chat` (Vercel fn + dev-server) → OpenRouter (`temperature`, `max_tokens`) |
| Autosave interval gated on `prefs.autosave` | Yes |
| `createSession` (named session in workspace/folder) | Yes |
| Scroll position restore across session switches | Yes |
| Tabs (title, model, phase, streaming, sections, fullText, entities, timeline, notes, followUps, messages) | persisted |
| Store versioning + migration (1 → 2) | Yes |

## Keyboard & accessibility sweep

- Ctrl+K/Ctrl+P global search, Ctrl+N (New Session), Ctrl+Shift+N (New Workspace), Ctrl+W (close tab), Ctrl+S (save now), Ctrl+B (toggle sidebar), Ctrl+1–9 (switch tabs), Alt+←/→ (nav back/forward) — all verified present in `use-workspace-shortcuts`.
- Ctrl+N always opens `NewSessionModal` via `onNewSession` (fallback `createTab` retained only where no modal is wired).
- Modals: Escape + backdrop close; inputs are labeled; role/aria set.
- Tooltips updated on TabBar/Dashboard new-session actions.

## Remaining items (accepted trade-offs)

- `.bl-prose` content styling applied to report + notebook + research inputs; remaining custom renderers keep explicit styles but inherit CSS-var-driven sizing.
- NewSessionModal reads store once per render (non-reactive if the store changes while open) — re-render refresh acceptable.
- LeftSidebar New Folder / New Workspace entry points intentionally unchanged.
- Canvas `createTab` (AI session blocks) intentionally bypasses the modal.
- `npm run lint` not runnable (missing eslint/plugin config) — verification is build + tests.
- Vite chunk-size warning (index chunk > 500 kB) — non-blocking; code-splitting deferred to v1.1.

## Files modified in this audit

- `src/stores/workspace-store.ts` — v2, `createSession`, `setTabScrollTo`, prefs, gated autosave
- `src/types/workspace.ts` — `TabFontSize`, prefs fields, `lastOpenedAt`, `scrollTop`
- `src/config/models.ts` — `MODEL_CATEGORIES`, `categoryForModel`, `modelForCategory`
- `src/styles.css` — font-size vars, `[data-fontsize]`, `.bl-prose/.bl-code`
- `src/components/app/NewSessionModal.tsx` — new
- `src/components/app/LeftSidebar.tsx` — `TabItem`, rename, context menu, recents
- `src/components/app/OperatingSystem.tsx` — sidebar on all views, modal wiring, `data-fontsize`
- `src/components/app/TabBar.tsx`, `Dashboard.tsx` — `onNewSession`, recents sort
- `src/components/app/SettingsView.tsx` — live prefs (rewritten)
- `src/components/app/NotebookView.tsx`, `StatusBar.tsx` (v1.0 badge)
- `src/components/research/ResearchWorkspace.tsx` — category picker, `onNewSession`, bl-prose, prefs → pipeline, scroll restore
- `src/components/research/ResearchReport.tsx`, `ModeSelector.tsx`
- `src/hooks/use-workspace-shortcuts.ts` — `onNewSession`
- `src/langgraph/types.ts`, `state.ts`, `index.ts`, `nodes/LLMNode.ts` — temperature/maxTokens
- `src/providers/types.ts`, `provider.ts`, `openrouter.ts` — pass-through
- `api/chat.ts`, `scripts/dev-server.mjs` — `temperature`/`max_tokens` forwarded
- `src/components/canvas/use-chat-turn.ts` — prefs passed into pipeline