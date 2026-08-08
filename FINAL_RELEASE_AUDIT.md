# Final Release Audit — BlackLetter 3.2.0

Audit performed against the full application before the portfolio release. Every row below is a **verified** observation (read code, ran the app, or reproduced the behavior). Nothing is speculative.

## Verified healthy (no change made)

| Area | Verification |
| --- | --- |
| Chat history persistence | `tab.messages`, `sections`, `fullText` live on the tab object in the workspace store (`src/stores/workspace-store.ts`) and persist via localStorage. Switching tabs, sessions, workspaces, or views never destroys them (store-level state, keyed `Session` components). Verified by reading `closeTab`/`hydrate`/`updateTab` and the `Session` render path. |
| Session title from first prompt | `deriveTitle(topic)` is applied on `beginWizard` (ResearchWorkspace.tsx:259) and again on completion (:230). Deterministic, no extra AI call. |
| New Session naming interface | `NewSessionModal` (name + workspace + optional folder) opens from TabBar `+`, `Ctrl+N`, Dashboard, and the in-session `New` button. |
| Rename everywhere | Sessions (TabBar double-click + context menu, LeftSidebar context menu), workspaces, folders, documents — all via inline rename + context menus. |
| Workspace delete confirmation | Already confirmed via `window.confirm` (LeftSidebar.tsx:61). |
| Human-readable errors | `getReadableError()` (`src/lib/error-utils.ts`) + `AiErrorBanner` renders code + message with Retry/Dismiss/Open Settings. No `[object Object]` paths found in render code. |
| AI key hygiene | Frontend never reads `OPENROUTER_API_KEY`; only `api/chat.ts` and `scripts/dev-server.mjs` touch it. See `AUTH-AUDIT.md`. |
| Production deployment | `https://blackletter-three.vercel.app/` serves the app (`<title>BlackLetter — AI Research Operating System</title>`). |
| Empty/welcome state | Idle phase shows a focused prompt, placeholder, upload access, and gap hints. |
| Small-window behavior | Sidebar collapse toggle, tools dropdown collapses to icon, responsive layout verified in `OperatingSystem.tsx`. |

## Verified problems to fix

| ID | Area | Problem | Severity | Fix |
| --- | --- | --- | --- | --- |
| A1 | Session management | Closing a session (TabBar ×, context-menu "Close tab", LeftSidebar "Close") **permanently deletes its chat history with no confirmation** (`closeTab` removes the tab + all messages). Inconsistent with the confirmed workspace delete. | High | Confirmation dialog ("Delete session — its conversation history will be permanently removed") before any close. |
| A2 | ID card | `HangingIdCard` floats fixed top-right (OperatingSystem.tsx:334-338) — a decorative physical ID badge, rope included, blocking UI space and not a real product control. | High | Remove the card. Add a subtle "System" header control that opens the System Status / Developer view. |
| A3 | Crash screen | Root `ErrorBoundary` (src/components/app/ErrorBoundary.tsx) dumps raw `error.stack` + component stack in **all** environments, including production. | High | Dev: keep stack. Production: "BlackLetter encountered an unexpected error", short description, Error ID (timestamp hash), Reload button, no stack. |
| A4 | Console noise | Every research run logs 30+ lines: `[PIPELINE]` stage logs (pipeline.ts), `[LANGGRAPH]` logs (logger.ts, index.ts), `[STAGE3-PROMPT]`/`[TEACHER-AGENT]` logs (teacher-agent.ts, writing-agent.ts), orchestrator summary, `[OpenRouter] retry` log. Unwanted in a portfolio demo console. | High | Gate all informational logs behind `prefs.developerMode` via a shared `devLog()` helper. Keep `console.error` for genuine failures. |
| A5 | Workspace naming | "New Workspace" from the Dashboard card and the header workspace menu creates `Untitled Workspace` with no naming step (only the sidebar `+` opens inline rename). | Medium | After creating from Dashboard/header menu, begin inline rename automatically. |
| A6 | Composer keys | `Enter` inserts a newline; running requires `Ctrl+Enter` in both composers (idle + follow-up). Not the expected chat convention. | Medium | `Enter` sends, `Shift+Enter` inserts newline, `Ctrl+Enter` still sends. Update hint text. |
| A7 | Model picker | Session model control shows only the 6 `MODEL_CATEGORIES` (label + description); no search, no individual model list, no "Recommended/All models" affordance. | Medium | Searchable picker over `MODEL_CATALOG` grouped by category with a recommended default. |
| A8 | Interface modes | Intelligence/Developer mode is only toggleable inside System Status and Settings — not discoverable from the main chrome. | Medium | Small segmented selector in the StatusBar ("Intelligence" / "Developer"). |
| A9 | Version | `package.json` 3.1.0; StatusBar shows `v3.1`; SettingsView shows `3.1.0`. | Low | Bump all to 3.2.0. |
| A10 | README | Written for the RC-2 era; lacks portfolio framing (capabilities, modes, production URL). | Low | Rewrite. |

## Constraints honored

- No new major features; no dependency additions; visual identity preserved.
- No console-error suppression; real failures still log.
- Key stays server-side only.
- Every fix passes `tsc --noEmit`, `npm run build`, and the vitest suite (172 tests).
