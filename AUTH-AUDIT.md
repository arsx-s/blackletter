# BlackLetter OpenRouter Authentication & Request-Path Audit

**Date:** 7 August 2026
**Scope:** Full trace of one request ("Explain CSS") from frontend to OpenRouter and back.
**Method:** Static code audit + in-process contract tests of `api/chat.ts` (13 assertions) + frontend contract tests (`src/test/auth/api-contract.test.ts`, 4 tests) + live reads of the public OpenRouter model catalog + live requests against the deployed Vercel domain.

---

## Verdict

The **code** is architecturally sound: the browser never sees or sends an API key, every AI request funnels through a single `provider.ts → /api/chat` choke point, and both serverless implementations (`api/chat.ts` and `scripts/dev-server.mjs`) attach `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}` only on the server side.

**One production blocker** was found: the live deployment at `blackletter.vercel.app` is **stale** — it predates the OpenRouter migration, its served bundle has no `/api/chat` client code, and `/api/chat` is not deployed as a serverless function (GET returns the SPA HTML catch-all; POST returns an empty 405). Until the current `main` is deployed, AI chat is broken in production web.

---

## 1. Request trace — "Explain CSS"

### Browser → Vercel web (production)
| Step | File | Function/Lines | Result |
|---|---|---|---|
| User types "Explain CSS" | `src/components/research/ResearchWorkspace.tsx` | `commitRun` → `runPipeline` | Prompt assembled |
| Pipeline builds prompt | `src/pipeline/**` | calls `generateStream` | Single AI choke point |
| Provider entry | `src/providers/provider.ts:7` | `generateStream` | delegates to `streamOpenRouter` |
| HTTP client | `src/providers/openrouter.ts:50` | `fetch("${base}/api/chat")` | `base=""` on web → same-origin `/api/chat` |
| request body | `openrouter.ts:53-59` | `{prompt, systemInstruction, model, temperature, maxTokens}` | **no Authorization header, no key** |

### Serverless function (Vercel)
| Step | File | Function | Lines | Result |
|---|---|---|---|---|
| Route | `api/chat.ts` | `handler` | 10 | Method guard (405), prompt guard (400) |
| Key read | `api/chat.ts` | `const apiKey = process.env.OPENROUTER_API_KEY` | 25 | **only** place the key is read on the prod path |
| Upstream call | `api/chat.ts` | `fetch("https://openrouter.ai/api/v1/chat/completions")` | 56-66 | verified: URL, body, headers |
| Authorization | `api/chat.ts` | `"Authorization": "Bearer ${apiKey}"` | 60 | verified = `Bearer ${process.env.OPENROUTER_API_KEY}` |
| Body contract | `api/chat.ts` | `{model, messages, stream:true, temperature?, max_tokens?}` | 41-47 | matches OpenRouter Chat Completions |
| Response | `api/chat.ts` | SSE passthrough `reader.read()` → `res.write("data: …")` | 103-146 | forwards OpenRouter SSE verbatim |
| Error mapping | `api/chat.ts` | 78-96, 147-153 | 401/402/403/404/408/429/5xx → typed codes |

### Response → renderer
| Step | File | Function | Lines | Result |
|---|---|---|---|---|
| Client SSE parse | `src/providers/openrouter.ts:101-134` | reads `choices[0].delta.content` per frame, stops at `[DONE]` | — | verified by tests |
| Render | `ResearchWorkspace.tsx` `researching` phase; `ResearchReport` on complete | | — | appends streamed chunks |

### Streaming
- Serverless and dev servers both stream with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (`api/chat.ts:98-101`).
- Client increments and renders per-chunk content (`openrouter.ts:129-130`).

---

## 2. Authentication flow

```
Browser/Electron frontend
   │  fetch POST /api/chat            (no key anywhere in client)
   ▼
 Vercel /api/chat (api/chat.ts)  ── or ──  local dev-server.mjs (:3000) / Electron-spawned server
   │  process.env.OPENROUTER_API_KEY ──Vercel env── read server-side only (api/chat.ts:25)
   │  headers: Authorization: Bearer ${process.env.OPENROUTER_API_KEY}
   │          HTTP-Referer: https://blackletter.ai, X-Title: BlackLetter
   ▼
 OpenRouter POST /api/v1/chat/completions  →  SSE stream  →  back to client
```

### Environment variables used
| Variable | Where read | Client-exposed? |
|---|---|---|
| `OPENROUTER_API_KEY` | `api/chat.ts:25` (prod), `scripts/dev-server.mjs:49` (local/Electron) | **No** — server-side only |
| (none on the client) | `import.meta.env` / `process.env` | greps: zero matches in `src/` |

## 3. Security issues found

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High (operational)** | Production web deployment is stale — deployed bundle has no `/api/chat` client code and no serverless function (GET `/api/chat` returns SPA HTML; POST returns empty 405). AI chat is down in prod until `main` is redeployed by Vercel. | Open — needs `vercel --prod` |
| 2 | **Medium (functional)** | Model slug `anthropic/claude-sonnet-4-20250514` removed from OpenRouter catalog → HTTP 404 (would surface as `MODEL_NOT_FOUND`). **Fixed** → `anthropic/claude-sonnet-4` (verified present). | FIXED in `023d5f5` |
| 3 | Low | `api/chat.ts:165` global catch returns `stack` in a 500 JSON response to the browser. Server-side only (never a key), but trim before ship. | Recommended |
| 4 | Low | Dev server uses `Access-Control-Allow-Origin: *` (`dev-server.mjs:26`). Bindings are localhost-only; not a key vector. | Acceptable |
| 5 | Low | `.env.example` documents legacy Gemini/OpenAI/Anthropic server keys (RAG service). Not part of the browser path; misleading but harmless. | Note only |

### Verified clean (greps)
- `import.meta.env.OPENROUTER_API_KEY` — **0 matches** in `src/`.
- `process.env.OPENROUTER_API_KEY` — **0 matches** in `src/` (only `api/chat.ts` + `scripts/dev-server.mjs`).
- Hardcoded secrets (`sk-…`, `AIza…`, `Bearer …`) — **0 matches** in `src/` and `api/`.
- `localStorage` — stores app data only: provider *name* (`src/lib/storage.ts:2`), username, notebooks, profiles. **No API keys stored.**
- Direct provider calls (Gemini/Anthropic/OpenAI HTTP) — **0 in the active path**; only `streamOpenRouter` is reachable from `provider.ts`.
- No Gemini SDK / `generativelanguage` code in the active request path.

## 5. Model availability (live check against `openrouter.ai/api/v1/models`)
| Model in `src/config/models.ts` | Live catalog |
|---|---|
| `deepseek/deepseek-r1` | EXISTS |
| `anthropic/claude-sonnet-4` (after fix) | EXISTS |
| `openai/gpt-4o-2024-11-20` | EXISTS |
| `google/gemini-2.5-flash` | EXISTS |
| `openai/gpt-4o-mini` | EXISTS |

## 6. Gates
- `npx tsc --noEmit` — clean
- `npm run build` — success
- `npx vitest run` — 172/172 (incl. 4 new auth-contract tests)
- Serverless function contract harness — 13/13 pass (URL, `Authorization: Bearer ${key}`, body, `max_tokens` snake_case, SSE passthrough, key never in client stream, NO_KEY path with zero upstream calls)

## 7. Outstanding — live round-trip (deferred at owner's request)
The final "Explain CSS returns a real AI-generated answer" check requires either a local `OPENROUTER_API_KEY` or a refreshed Vercel deployment. Neither is available in this environment (vercel CLI absent; the deployed domain is stale). All contract-level behavior that does not depend on the key is verified above and via the committed regression tests.