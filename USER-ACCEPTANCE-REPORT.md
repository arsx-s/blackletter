# BlackLetter RC-2 — User Acceptance Report

**Release candidate:** v3.1 (post-RC-1 hardening)
**Test date:** 7 August 2026
**Method:** Full user-workflow trace through the built app (source-verified for every claim), plus `tsc`, `vite build`, `vitest` (168 tests) and `pytest` (22 tests) gates.
**Automated screenshots:** attempted via Electron `capturePage` against the production build; captures returned blank frames in the automated environment, so the report relies on code-verified behaviour rather than images.

Ratings are 1–10, where 10 = "ready to ship", 1 = "not usable".

---

## 1. First launch — landing page → workspace  — 9/10

- Landing (pixel-art boot animation, model marquee, Get Started) renders before the OperatingSystem shell mounts; boot log plays "Starting Local Storage" etc.
- Entering the shell creates the default workspace and lands on the Home/dashboard view.
- **Fixed in this pass:** creating a new workspace from the sidebar now immediately opens an inline rename field, so a fresh workspace is never permanently stuck as "Untitled Workspace".

**Left for a later release:** none blocking. Landing CTA text remains marketing copy.

## 2. Workspace lifecycle — create / rename / archive / duplicate / delete  — 8/10

- Creating a workspace switches context correctly. Rename is inline; archive/restore works and the archive section hides/shows.
- **Fixed in this pass:** new workspaces now reset `activeTabId` (a stale tab from the previous workspace could render under the new workspace header — the "wrong session in new workspace" bug).
- **Fixed in this pass:** deleting a workspace now asks for confirmation; it previously deleted permanently on a single right-click action.
- Renaming with an empty value keeps the previous name (was: allowed blank names).

**Left for a later release:** none.

## 3. Research sessions — new tab, wizard, run, follow-ups  — 8/10

- Ctrl+N creates a tab; the wizard (subject → mode) flows into a live research run with stage ticker, document analysis, and graph ingestion. Follow-up chips reuse memory (subject hint + memory context).
- **Fixed in this pass:** reloading mid-research no longer leaves the app stuck on a spinner — hydrated tabs are returned to the idle state with a clear "interrupted by reload" notice and a Run again action.
- **Fixed in this pass:** follow-up runs no longer inject 4,000 characters of the previous report as the "previous topic" context — they now carry the session's topic.
- **Fixed in this pass:** Alt+← / Alt+→ navigation shortcuts were blocked by a guard that required Ctrl/Cmd; now they work as documented.

**Left for a later release:** a research error banner on the fresh-session screen (added in this pass: banners now show on retryable state, not only on the completed-report screen — see fix list).

## 4. Split view — 8/10

- With two sessions open, Split opens both side by side with a draggable divider and a pane selector.
- **Fixed in this pass:** clicking Split with only one session used to toggle a useless split showing the same tab twice; it now shows a toast ("Open a second session to use Split View") and does nothing.
- **Fixed in this pass:** the pane selector can no longer pick the main session (duplicate view), and closing the side session closes split view instead of leaving a stale half.

**Left for a later release:** persistent split ratios across sessions.

## 5. Documents — upload, view, search  — 8/10

- Upload (txt/md/pdf/docx), pagination, in-document search, download, and attaching documents to sessions all work. Word/page estimates are shown in the list.
- **Fixed in this pass:** uploads now show an "Extracting…" state with a spinner instead of appearing to hang; failures show an explicit supported-format error.
- **Fixed in this pass:** global search now matches document *contents*, not just file names.

**Left for a later release:** annotations (currently a "coming soon" toast), drag-and-drop from Explorer.

## 6. Research canvas — blocks, edges, connect, present  — 8/10

- Blocks (note/sticky/report/document/image), linking edges, drag, resize, pin, duplicate, bring-to-front, snapshots and slides all function. Report blocks stream live results.
- **Fixed in this pass:** the right-click menu's first item ("Open" / "Edit text") was a dead click — removed; rename still works (prompt) and inline header double-click renaming remains.

**Left for a later release:** inline (non-prompt) rename from the menu, undo/redo, canvas-scale persistence.

## 7. Knowledge graph — 8/10

- Graph view renders concepts/strengths/prerequisites from research ingestion; node inspector shows context and generates tailored notes; gap suggestions surface at idle.
- No broken controls found in this trace.

**Left for a later release:** graph search, multi-workspace graphs.

## 8. Notebook / editor — 8/10

- Editor, spellcheck, word wrap, font size, autosave toggle, snapshots (restore/duplicate) and templates all present and functional.

## 9. Workshop (settings) — 8/10

- General/Research/Editor/Research memory/System sections work; memory stats and clear-memory are live.
- **Fixed in this pass:** the "Autosave notebooks" toggle now actually controls automatic saves (off = manual Ctrl+S / on-exit saves; data safety preserved). The description explains it honestly.
- **Fixed in this pass:** new "AI & Models" section — default model picker (Fast/Balanced/Reasoning/Creative/Coding/Research) plus API-key guidance with direct links to OpenRouter keys/docs, so the "Open Settings" button on key errors now lands somewhere useful.
- **Fixed in this pass:** "LOCAL — all data in memory" is now "LOCAL — saved on this device" (autosave/persistence was already real; the label lied), and the version number is now v3.1.

## 10. AI errors & API key handling — 7/10

- Errors propagate with typed codes (no key, invalid key, rate limited, timeout, network, empty, model unavailable, doc too large); banner actions (Try again / Open Settings) and dismiss work.
- **Fixed in this pass:** rate-limit and server errors now show a countdown and auto-enable retry even when the provider didn't send `Retry-After` (previously retry stayed disabled forever).
- **Fixed in this pass:** the banner CTA is now "Open Settings" and lands on the AI & Models section (was: a Workshop page with no API section).

**Left for a later release:** a settings UI for entering the key at runtime (key is env-based by design).

## 11. Status bar & chrome — 8/10

- Save state, local indicator, AI chat toggle, model, workspace name, shortcuts help all render.
- **Fixed in this pass:** the model readout shows a friendly category label ("Reasoning", "Balanced", …) instead of the raw provider id; version shows v3.1.
- **Fixed in this pass:** the tab context menu label now toggles Pin/Unpin to match the actual state.

**Left for a later release:** Ctrl+N/Ctrl+W are reserved by the Electron shell in some builds — documented, not changed.

---

## Regressions & risk watch

- **None found** in this pass; all gates green:
  - `npx tsc --noEmit` — clean
  - `npm run build` — success
  - `npx vitest run` — 168/168 pass
  - `pytest` — 22/22 pass (eval suite; deps were reinstalled from the declared `requirements.txt`, no versions changed)

## Overall

| Workflow | Rating |
|---|---|
| Landing → workspace | 9 |
| Workspace lifecycle | 8 |
| Research sessions | 8 |
| Split view | 8 |
| Documents | 8 |
| Research canvas | 8 |
| Knowledge graph | 8 |
| Notebook / editor | 8 |
| Workshop (settings) | 8 |
| AI errors / API key | 7 |
| Status bar & chrome | 8 |

**RC-2 recommendation: SHIP.** All blocking issues found in RC-1 UAT are resolved; remaining items are feature work for the next release, not blockers.
