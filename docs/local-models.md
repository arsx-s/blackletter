# Local models: the second provider, and its limits

Mission 6 added a second way to answer a request: a **local runtime on this
machine** (Ollama), behind the same provider abstraction the hosted path already
used. This document is the contract — what is wired, what is enforced by tests,
and what is *not* verified here.

## Why a second provider at all

The hosted path sends the operator's question, their documents, and their memory
context to a relay that holds a provider key. That is fine for some work and
wrong for other work. The local path exists so a researcher can keep a session on
their own machine, and so the app has an honest answer to "where did this text
go?" — an answer taken from the run, not from a setting.

## Selection lives in one place

`src/providers/selection.ts` is the only module that decides which provider runs.
It owns five values:

| Value | Default | Meaning |
| --- | --- | --- |
| `provider` | `openrouter` | Which adapter answers a request. |
| `ollamaBaseUrl` | `http://127.0.0.1:11434` | Where the local runtime listens. Loopback. |
| `ollamaModel` | *(empty)* | The operator's model id. **No model is assumed.** |
| `allowNonLoopbackLocalProvider` | `false` | Opt-in required before a non-loopback address is used. |
| `remoteFallback` | `never` | Opt-in required before a failed local run is retried remotely. |

The Workshop panel writes through `workspaceStore.setPrefs`, which writes through
`setProviderSelection`, so the UI cannot show one thing while the provider layer
does another. `src/test/providers/panel.test.tsx` drives the panel against the
real store and the real provider layer to keep that true.

### Two safety properties, both tested

1. **Loopback by default.** `validateOllamaBaseUrl` refuses any non-loopback host
   (and refuses credentials in the URL) unless `allowNonLoopbackLocalProvider` is
   on. A typo cannot point the runtime at a LAN address. With the opt-in on, the
   panel keeps showing the switch — the state stays visible, not just the refusal.
2. **No automatic remote fallback.** When local inference fails, the request
   *fails*. It is not retried on a hosted model, because that would send the
   content to a third party at exactly the moment the operator asked for it to
   stay local. `remoteFallback: "allow"` is the single exception, and it reports
   itself: `onProvider` fires with `fallback: true` and the run is labelled as a
   remote fallback rather than a local run.

Fallback never fires for failures a retry cannot fix: a missing model
(`MODEL_NOT_FOUND`), an oversized prompt (`CONTEXT_OVERFLOW`), a bad request, or a
cancellation. `src/test/providers/dispatch.test.ts` asserts each of those.

## There is no model to assume

`OLLAMA_DEFAULT_MODEL` is the empty string. "Ornith 9B" is not a documented Ollama
identifier, and guessing one would either fail confusingly or — worse — pull a
different model than the operator meant. The operator types an id, or lists what
is already installed and picks from that list.

## The adapter never installs anything

`src/providers/ollama.ts` speaks `/api/chat` with `stream: true`, and nothing
else. There is **no `/api/pull` call anywhere in this repository**, and no process
is spawned: an architecture guard fails the build if either appears. When a model
is missing, the error message tells the operator what to run themselves — and says
that nothing was downloaded automatically.

Diagnostics are operator-triggered and carry no work:

| Action | Request | Body |
| --- | --- | --- |
| Check connection | `GET /api/version` | none |
| List installed models | `GET /api/tags` | none |
| Inspect one model | `POST /api/show` | `{ model }` |

No prompt, no document text, and no memory record is ever part of a diagnostic
request.

## Capabilities stay `unknown` until evidence exists

`src/providers/capabilities.ts` encodes the rule that **unknown stays unknown**.
A capability becomes known in exactly two ways: the app exercises it (chat and
streaming, on both providers), or the runtime itself reports it through
`/api/show`. A parameter count, a family name or a model size is never treated as
evidence. Until a model has been inspected, the panel shows `unknown` for
structured output, tool calls, vision, and context window, along with the basis
for each statement.

## Every run records the provider that actually ran

- `createInitialState` resolves the provider once at the start of a run.
- `LLMNode` replaces it with what the provider layer reported via `onProvider`.
- `PipelineTelemetry` and `RunRecord` carry `provider`, `local`, and
  `providerFallback`, so retrospective views show where the tokens came from.
- The generation trace stage is named **"Generation"**, not after a provider, so a
  local run cannot be displayed as a hosted one. (Its internal id remains
  `openrouter` for persisted traces; the name is what is shown.)

## Error codes

| Code | Meaning | Retried? |
| --- | --- | --- |
| `OLLAMA_UNREACHABLE` | Nothing answered at the base URL. | yes, once |
| `SERVER` | The runtime answered 5xx. | yes, once |
| `MODEL_NOT_FOUND` | The runtime does not have that model. | no |
| `CONTEXT_OVERFLOW` | The prompt exceeds the model's window. | no |
| `LOCAL_ACCESS_DENIED` | HTTP 401/403 from the runtime. | no |
| `BAD_REQUEST` | Any other 4xx. | no |
| `MALFORMED_RESPONSE` | Unparseable NDJSON with no usable text. | no |
| `EMPTY` | No content chunks; says so explicitly. | no |
| `TIMEOUT` | No completion within `OLLAMA_REQUEST_TIMEOUT_MS`. | no |
| `MODEL_NOT_CONFIGURED` | Local provider selected with no model id. | no |
| `LOCAL_PROVIDER_MISCONFIGURED` | Unusable base URL, or model id missing. | no |

A timeout and a cancellation both abort a fetch and both surface as an
`AbortError`. The abort *reason* is checked before the error shape, so a cancelled
run is reported as `CANCELLED` and a timeout as `TIMEOUT`. Two ordering bugs were
found and fixed by the tests for exactly this (`src/test/providers/ollama.test.ts`).

## What is not verified

Stated plainly, because the alternative is a false claim:

- **No live local inference was run.** This machine has no Ollama installation and
  no model, so every local path here is verified against a mocked transport
  (`src/test/providers/*.test.ts`), not against a real runtime. Chunk timing,
  real NDJSON shapes under load, and model-specific behaviour are unverified.
- **No model was pulled, and none will be.** There is no download path in the app.
- **Vision, tool calls and structured output are not exercised by the app.** The
  panel can *report* what the runtime claims; the app requests none of them yet.
- **A hosted run was not exercised either.** No `OPENROUTER_API_KEY` is present,
  so the remote branch is covered by the same mocked-transport tests.
- **Latency and token accounting for local runs** are whatever the adapter
  measures (`performance.now()` around the stream, chunk counts); no local token
  counts are available from the runtime's streaming API and none are invented.
