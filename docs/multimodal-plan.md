# Multimodal Processing Plan

**Document status:** design only. This document authorises no implementation.
**Scope:** Mission 12 — add multimodal processing one modality at a time.
**Applies to:** BlackLetter OS `3.2.0` (`package.json`).

## 0. What this document is and is not

This is a plan. No modality described here is implemented, and nothing in this
document may be read as a claim that one is. Specifically:

- No image, audio, video, or structured-data input is accepted by the pipeline today.
- No OCR, speech-to-text, speech synthesis, or video tooling exists in this repository.
- No dependency, provider field, relay field, or model capability described below
  has been added, tested, or verified.
- Every capability statement about a specific model is either marked `UNKNOWN` or
  is backed by an explicit probe recorded in the capability matrix (§2).

The plan's central rule is that a modality is added **only** where a selected
model genuinely supports it and only where a testable use case exists. Everything
else fails closed with a typed refusal, and is never simulated.

Terminology used throughout:

| Term | Meaning |
| --- | --- |
| **Modality** | A class of non-text input or output (A–E below). |
| **Capability** | A specific model's ability to accept or produce a specific modality. |
| **Declared capability** | What a vendor or model card says. Advisory only; never sufficient. |
| **Observed capability** | What a probe recorded in §2 measured. This is the only basis for enabling a modality. |
| **Egress** | Any byte of user data that leaves the device. Sending a file to a provider is egress even though the provider is not "storing" it for us. |
| **Fail closed** | Unsupported input produces a refusal the user can read. It is never approximated, guessed, or faked. |

---

## 1. Verified baseline

Every statement in this section was read from the source in this repository. Line
references are to the state of the files as read; they are provided so a later
reader can confirm drift rather than trust this document.

### 1.1 The request shape is text-only and has exactly five fields

`src/providers/openrouter.ts` builds the relay request body with a literal object
containing `prompt`, `systemInstruction`, `model`, `temperature`, `maxTokens`.
There is no content-part array, no attachment field, and no URL field.

`src/server/relay-guard.mjs` defines the server-side contract:

```js
const ALLOWED_FIELDS = new Set(["prompt", "systemInstruction", "model", "temperature", "maxTokens"]);
```

`validateChatRequest` iterates `Object.keys(body)` and rejects anything outside
that set with code `UNKNOWN_FIELD`. **Consequence:** a request carrying, say,
`imageBase64` or `audioUrl` is refused today by policy before any upstream call.
Multimodal transport is therefore not a client-only change; it is a relay policy
change followed by a client change, in that order.

### 1.2 The relay is also a hard size boundary

`RELAY_LIMITS` in `src/server/relay-guard.mjs` sets `maxBodyBytes: 256 * 1024`,
`maxPromptChars: 120_000`, `maxSystemChars: 20_000`, `maxMaxTokens: 32_000`,
`maxModelIdChars: 96`, `defaultTimeoutMs: 55_000`.

A 256 KB body cap with base64 inflation (4/3) leaves roughly 190 KB of binary
payload per request before JSON overhead. That is not enough for a typical
scanned page, and nowhere near enough for any audio or video payload. **Any
modality that carries binary data through the relay requires a deliberate,
reviewed increase to `maxBodyBytes` (and a per-modality size check), not an
incidental one.** The safe alternative — sending less data — is discussed per
modality in §4–§8.

### 1.3 Two credential-holding relays, one policy

- `api/chat.ts` — hosted serverless function, `resolveConfig(process.env, "hosted")`.
- `scripts/dev-server.mjs` — local development / desktop relay,
  `resolveConfig(process.env, "local")`, bound to `127.0.0.1:3000` by default.

Both import every check from `src/server/relay-guard.mjs`; the file's own header
states they "must not drift apart". Both hold `OPENROUTER_API_KEY`; neither the
browser bundle nor the Electron renderer ever sees it. The local relay's header
records that it previously bound all interfaces with a wildcard CORS header and
that this let other machines spend the operator's credits — the loopback binding
and the token are the fix.

The desktop build is not an exception to this: `electron/main.cjs` sets
`API_BASE = "http://127.0.0.1:3000"`, `electron/preload.cjs` exposes it as
`apiBase`, and `src/providers/openrouter.ts` uses
`isElectron() ? (window.electronAPI?.apiBase ?? "") : ""` as the base for
`POST /api/chat`. So all model traffic — web and desktop — passes through a
credential-holding relay.

> **Documentation discrepancy (recorded, not resolved here).**
> `docs/product-architecture.md` §"Network boundaries" states that "the desktop
> build talks directly to the model provider". The code above says otherwise: the
> desktop build talks to its own loopback relay. This plan treats the code as
> authoritative. Correcting that sentence is out of scope for this document, which
> owns no other file; it is listed in the open register (§12) so it is not lost.

### 1.4 Document extraction today supports four formats, unequally

`src/pipeline/documentEngine.ts` accepts `.txt`, `.md`, `.pdf`, `.docx` by MIME
type or extension. `src/langgraph/nodes/DocumentNode.ts` accepts the same four.

- **Text/Markdown** — `file.text()`. Reliable.
- **PDF** — byte and regex based. `extractPDF` decodes the whole file as UTF-8,
  then tries `/Text\((...)\)` regex matches, then a raw `stream\n…\nendstream`
  capture, then a printable-character scrub. There is no stream decompression, so
  a PDF whose content streams are Flate-compressed (the normal case) is not
  decoded at all; the fallback returns printable noise or an empty string. No page
  boundaries are produced and no page numbers are retained.
- **DOCX** — a minimal ZIP reader plus a handwritten `inflateRaw`. `word/document.xml`
  is stripped of tags. Formatting, tables, images, and structure are lost.

**Duplication (verified).** `extractTextFromFile`, `extractPDF`, `extractDOCX`,
`parseZipEntries`, `detectLanguage`, `extractHeadings`, `extractKeywords`,
`extractConcepts`, and `extractObjectives` are implemented twice — once in
`src/pipeline/documentEngine.ts` and once in `src/langgraph/nodes/DocumentNode.ts`.
The copies have already diverged:

| Aspect | `documentEngine.ts` | `DocumentNode.ts` |
| --- | --- | --- |
| Unsupported file error code | `UNSUPPORTED_FILE` | `UNSUPPORTED_FILE_TYPE` |
| Extraction failure code | `EXTRACTION_EMPTY` | `EXTRACTION_FAILED` |
| DOCX ZIP: deflate support | `inflateRaw` for `compMethod === 8` | no inflation; raw bytes decoded directly |

Any multimodal work touches both paths unless the duplication is resolved first.
Resolving it is a prerequisite for §10 and is listed as such.

### 1.5 Provenance today is an ordinal, not a location

Extracted text from multiple files is joined with `--- <filename> ---` separators
(`DocumentNode`, `documentEngine.executeDocument`). `RetrievalNode.splitDocText`
re-parses those separators with a regex, strips the extension for `source`, and
chunks at ~700 characters with 120 characters of overlap.

A `RetrievedChunk` (`src/pipeline/scoring.ts`) carries exactly:

```ts
{ id, source, sourceType, text, position }
```

`position` is a counter, not a citation locator. There is no page number, no
character offset into the original file, no bounding box, no timestamp, and no
content hash. The `[n] <source: …>` markers that `PromptBuilderNode` adds are
prompt-time indices recomputed per run.

**Consequence for every modality below:** a new modality that produces citable
content must bring its own locator, because the existing chunk model cannot
express one.

### 1.6 Grounding and confidence scoring are lexical, model-free, and text-only

`src/pipeline/scoring.ts` is entirely deterministic. It has no model calls. Its
components are token-frequency relevance against corpus IDF, term coverage,
a hard-coded source-quality prior (`.gov`/`.mil`/`.edu` boost, Wikipedia penalty),
a position bias, and a recency proxy derived from the source-quality number.

`computeFaithfulness` splits the answer into sentences and checks what fraction of
each sentence's tokens appear anywhere in the joined corpus text, with a numeric
guard. `computeConfidence` combines retrieval (0.35), faithfulness (0.30),
completeness (0.25), and stability (0.10) and clamps to 5–98.

Two properties matter for this plan:

1. **There is no notion of a non-text evidence item.** A confidence score is
   computed from strings. An image region or an audio segment cannot be "grounded"
   by this scorer without a representation change, and representing it as base64
   text would make the lexical checks meaningless while still producing a number.
2. **The score is a lexical proxy, not a semantic judgement.** It cannot detect a
   fluent, well-vocabulary'd sentence that inverts the meaning of its source. Any
   modality whose value proposition is "the model read the right thing" is not
   validated by this scorer.

### 1.7 There is no local inference runtime, so "local processing" is not free

Searches across `src/` for `onnxruntime`, `transformers.js`, `webgpu`, `whisper`,
`tesseract`, `llama.cpp`, `@xenova`, and `huggingface` return no matches.
`package.json` declares no machine-learning dependency. `docs/product-architecture.md`
lists "Offline Intelligence (v5.0, planned)" as planned, which matches the code:
there is no local model in this build.

Therefore, at the time of writing, **"process it locally" is not an available
implementation choice for any learned modality** — it is a prerequisite that
requires either a new runtime dependency (out of scope for this mission; forbidden
without an explicit decision) or an external tool the developer installs (see the
probe procedure in §2.3). Any plan step that says "run OCR locally" without first
pricing that dependency is not a plan.

### 1.8 What the user is told today when a file is unsupported

`extractTextFromFile` throws `{ code: "UNSUPPORTED_FILE", message: 'Cannot extract
text from "<name>". Supported: .txt, .md, .pdf, .docx' }` (or the
`UNSUPPORTED_FILE_TYPE` variant in the duplicated copy). `GraphNode` catches the
throw, pushes the message to `state.errors`, and returns
`{ error, errorCode }`, which stops the graph. The message is honest. The
multimodal contract in §3.3 preserves that honesty and adds typed codes.

---

## 2. Capability matrix

### 2.1 The rule

> **A model's capability must never be inferred from its name, its vendor, its
> size, its parameter count, or another model's behaviour. Capability is either
> `UNKNOWN`, or it is `SUPPORTED`/`UNSUPPORTED` because a probe recorded in this
> matrix observed it.**

The matrix is keyed by exact model id, because that is the unit the relay
validates (`MODEL_ID_PATTERN` requires `<provider>/<model>`) and the unit the
client selects. `UNKNOWN` is a first-class state, not a placeholder to be filled in
with a guess. A modality is disabled for a model whose row is `UNKNOWN`.

### 2.2 Template

| Field | Type | Notes |
| --- | --- | --- |
| `model_id` | string | Exact `provider/model` as accepted by `validateModel`. |
| `modality` | `A`…`E` | See §4–§8. |
| `capability` | enum | `SUPPORTED` \| `UNSUPPORTED` \| `UNKNOWN` \| `STALE` |
| `inputs_accepted` | string[] | MIME types or extensions actually accepted (not advertised). |
| `size_limit` | number + unit | The largest input the probe observed to succeed. |
| `declared_support` | string + URL | Vendor claim, with a date. Never sufficient on its own. |
| `observed_support` | string | What the probe returned, verbatim and sanitised. |
| `probe_id` | string | Identifier of the probe run that produced `observed_support`. |
| `probe_date` | ISO date | When. |
| `probe_environment` | string | Relay profile (`hosted`/`local`), app version, probe version. |
| `cost_note` | string | Observed token/billing effect, if measurable. |
| `expiry` | ISO date | After this date the row becomes `STALE` and the modality is disabled again. |
| `notes` | string | Caveats, e.g. "succeeds only below 1024 px on the long edge". |

State transitions:

- `UNKNOWN` → `SUPPORTED` or `UNSUPPORTED`: only a recorded probe.
- `SUPPORTED` → `STALE`: at `expiry`, or when the model id, relay policy, or
  `provider` revision changes. `STALE` behaves exactly like `UNKNOWN` at runtime.
- `UNSUPPORTED` → anything: only a new probe against a new model id.

### 2.3 Probe procedure (operator-run, credential-holding)

A probe is a deliberate, recorded, minimal request. It is never run in CI, never
run on user data, and its cost is accepted in advance.

1. Record what is being probed: model id, modality, one representative input.
2. Confirm relay policy permits the request shape (`ALLOWED_FIELDS`, `maxBodyBytes`).
   If it does not, the probe has already answered part of the question: the answer
   is a policy `UNSUPPORTED` and the decision moves to §9's gates.
3. Run against the local relay with `OPENROUTER_API_KEY` in the environment.
   Never against the hosted relay for a new field — policy changes are reviewed
   before deployment, not discovered in production.
4. Record the **sanitised** outcome. Upstream error bodies are already redacted by
   `toClientError`/`redact`; do not paste raw provider text into this matrix.
5. If the probe succeeded, record the smallest and largest input that worked, and
   the failure mode at the boundary.
6. Add the row. Set `expiry` (proposed default: 30 days, and always when the model
   id changes).

### 2.4 Current matrix (all rows truthful as of the state of the code)

| model_id | modality | capability | Notes |
| --- | --- | --- | --- |
| `openai/gpt-4o-mini` (default, `src/config/models.ts`) | A | `UNKNOWN` | No probe has been run. Even if the model accepts images, the relay rejects any image field today (§1.1) and the 256 KB body cap applies (§1.2). |
| `openai/gpt-4o-mini` | B, C, D | `UNKNOWN` | No probe. No transport. |
| `openai/gpt-4o-mini` | E | `UNKNOWN` | Structured data as *text* is already possible; structured data as a typed channel is not. See §8. |
| `google/gemini-2.5-flash` | A–E | `UNKNOWN` | Not probed. |
| `anthropic/claude-sonnet-4` | A–E | `UNKNOWN` | Not probed. |
| `deepseek/deepseek-r1` | A–E | `UNKNOWN` | Not probed. |
| `openai/gpt-4o-2024-11-20` | A–E | `UNKNOWN` | Not probed. |

Every row is `UNKNOWN`, and that is the honest state of this repository. A reader
who wants a different table must run §2.3 and record the result.

---

## 3. Cross-cutting rules

These apply to all five modalities. A modality plan that violates one of them is
not approvable, regardless of how well it scores on its own evaluation.

### 3.1 One prerequisite step, before any modality: the fail-closed contract

Before modality A is attempted, the system must be able to answer "can I read
this?" and "what do I do when I can't?" deterministically. That requires:

- a capability record per (model id, modality) available at the point of request;
- a typed refusal for every unsupported case (§3.3);
- a single extraction entry point instead of the two divergent copies in §1.4;
- provenance carried on every produced item, not just on document text.

This is item **A0** in §10 and is the only piece of work this plan proposes to do
first, because everything else depends on it and because it is testable offline.

### 3.2 Egress ledger (mandatory per modality)

`docs/product-architecture.md` states "no server ever stores the user's files" and
"nothing about the user's research — notes, sessions, documents — leaves the
machine". Routing a file's bytes to a model provider does not violate the first
sentence (nothing is *stored*), but it is plainly in tension with the plain reading
of the second. **Every modality must therefore declare its egress explicitly,
in-product, before the user approves it.** The declaration is not a paragraph in
this document; it is a field of the consent record (§3.5) with these values:

| Field | Meaning |
| --- | --- |
| `path` | `none` \| `loopback-relay-then-provider` \| `provider-direct` (the last is currently impossible in this codebase). |
| `payload` | What is transmitted: file bytes, derived text, a downscaled derivative, sampled frames, a transcript. |
| `derivation` | What transformation happened first, so the user knows whether the original or a reduced form left the device. |
| `retained_by_us` | `no` for every current path — the relay forwards and does not persist. |
| `provider_terms` | Reference to the provider's data policy as it applies to this request type. `UNKNOWN` until reviewed. |

### 3.3 Refusal contract

New codes are additive; existing codes and messages stay as they are.

| Code | HTTP | When | User-visible meaning |
| --- | --- | --- | --- |
| `MODALITY_UNSUPPORTED` | 400 | The requested modality is `UNSUPPORTED`/`STALE` for the selected model. | "The selected model cannot read this kind of file." |
| `MODALITY_UNKNOWN` | 400 | Capability is `UNKNOWN` for the selected model. | "Support for this file type has not been verified for this model." |
| `MODALITY_NOT_ENABLED` | 403 | Capability is `SUPPORTED` but the operator has not enabled it. | "This feature is switched off." |
| `INPUT_TOO_LARGE` | 413 | Above the per-modality limit derived from relay policy. | "This file is too large for this feature." |
| `EXTRACTION_FAILED` | 422 | Extraction ran and produced nothing usable. | "The text could not be read from this file." |
| `EXTRACTION_PARTIAL` | 200 + flag | Extraction ran and produced usable output with known gaps. | "[Some regions could not be read](#)" |

Two rules:

1. **`UNKNOWN` is not `UNSUPPORTED`.** The messages must differ, because the
   remedy differs (choose another model vs. the feature does not exist yet).
2. **A refusal is final.** No fallback that guesses content, no silent substitution
   of a different model, no "this probably says…". A refusal may offer, as a
   separate and clearly labelled action, a text-only path that does not claim to
   have read the file.

### 3.4 No simulation, ever

It must never be possible for the product to present a modality as working when it
is not. Concretely:

- No hard-coded captions, samples, transcripts, or frame descriptions.
- No placeholder text that reads as extracted content.
- No confidence score computed over simulated content.
- An unavailable modality is **absent from the UI** or present in a disabled state
  with the §3.3 explanation. It is not present-but-broken, and it is not present
  in a "preview" form that produces plausible content.
- Test fixtures must be unambiguously marked as fixtures (§10.2), and must never be
  shipped into the user-facing build as sample content.

### 3.5 Consent record

Before the first byte of a new modality leaves the device, the user sees, in plain
language: the file name, the modality, the capability state, the egress path, the
payload and derivation, and the option to cancel. The consent is per-file and
per-run; there is no blanket modality consent that survives a model change, because
a model change can change where data goes. The record emitted on completion is
listed in §3.6.

### 3.6 Provenance record (shared across modalities)

Every produced item carries one of these. Fields not meaningful for a modality are
`null`, not omitted — an absent locator must be visibly absent.

```ts
interface MultimodalProvenance {
  sourceId: string;            // stable id for the originating file/stream
  sourceKind: "file" | "microphone" | "stream" | "clipboard";
  fileName: string | null;     // as the user provided it
  contentHash: string;         // sha-256 of the original bytes
  byteLength: number;          // of the original
  modality: "image" | "audio" | "video" | "table";
  locator: LocationSpec | null;// see below
  extraction: {
    method: string;            // "provider-vision" | "local-ocr" | "deterministic-parse" | …
    methodVersion: string;
    ranAt: string;             // ISO
    environment: "local" | "relay-provider";
    inputToMethod: "original" | "derivative";
    derivativeNote: string | null; // e.g. "resized to 1600px, JPEG q80"
  };
  confidence: number | null;   // extraction-level, not answer-level
  confidenceBasis: string | null; // what the number is derived from, in words
  warnings: string[];
}

type LocationSpec =
  | { kind: "page"; page: number; bbox?: [number, number, number, number] }
  | { kind: "time"; startMs: number; endMs: number; toleranceMs: number }
  | { kind: "table"; tableIndex: number; rowStart: number; rowEnd: number; colStart?: number; colEnd?: number }
  | { kind: "char"; offset: number; length: number };
```

`confidence` here means "how sure is the extractor about *this locator's* content"
and is conceptually different from `computeConfidence` in `src/pipeline/scoring.ts`,
which scores an answer against a text corpus. The two must not be averaged
together, and the UI should not show only one number for both.

### 3.7 Budgets

No latency or resource number in this document is measured, and therefore none is
stated as a requirement. Budgets are **entries to be filled in from a measured
baseline**, and a modality cannot pass its gate (§9) with an empty budget row. The
recorded fields per modality are:

| Field | Unit | How determined |
| --- | --- | --- |
| `input_size_p50/p95` | KB or seconds | Instrumented over an authored fixture set (§10.2), not over user files. |
| `preprocess_ms_p50/p95` | ms | Measured locally on the target machine class. |
| `provider_ms_p50/p95` | ms | Measured against the relay, which itself caps a request at 55 s (`defaultTimeoutMs`). |
| `tokens_or_units` | tokens/sec of audio/frames | Measured per probe. |
| `memory_peak_mb` | MB | Measured with the platform profiler during preprocessing. |
| `cost_per_call` | currency | Read from the probe's billing record. |

The machine class used for local measurements is `UNKNOWN`; determine it before
starting (`nvidia-smi` if present, otherwise `Get-CimInstance Win32_VideoController`
and `Get-CimInstance Win32_Processor`).

---

## 4. Modality A — image and document vision, plus OCR

**Job to be done:** a user has a scan, a screenshot, a chart, a photograph of a
page, or a PDF that the byte-level extractor in §1.4 cannot read, and wants its
content available as citable evidence.

### 4.1 Input types and size limits

Proposed accepted inputs: `.png`, `.jpg`/`.jpeg`, `.webp`; PDFs only as a
page-rasterising path (see 4.3) and only once a renderer exists. `UNKNOWN`:
whether SVG, TIFF, and HEIC are worth supporting — decide from the authored
fixture corpus, not from a list of formats the team has heard of.

Size limit is a derived number, not a chosen one:

```
max_encoded_body  = RELAY_LIMITS.maxBodyBytes            // 256 KB today
max_binary_bytes  = floor((max_encoded_body - envelope) / 1.333…)
```

With today's cap that is well under 200 KB of image bytes. Two honest options:

- **Option A1 — client-side reduction.** Downscale and re-encode before sending so
  the payload fits the existing cap. Cheapest policy change (none), but it degrades
  small text and must be measured: the acceptance question is "at what scale does
  OCR/vision accuracy on the fixture corpus fall below the agreed threshold?"
- **Option A2 — raise `maxBodyBytes`.** A deliberate policy change requiring review
  of memory behaviour in the relay (`readBody` buffers up to the cap), the hosted
  function's platform limits, and the local relay's exposure. Not to be done
  casually: the cap is currently a cost and memory control, not an accident.

Either way, `size_limit` in the capability matrix records what was *observed*; the
UI enforces the same number.

### 4.2 Local or remote

| Path | Prerequisites | Egress | Verdict |
| --- | --- | --- | --- |
| Remote vision via the relay | Relay field + size policy change; a probed vision-capable model (§2.4 — none yet) | Original or downscaled image bytes | Possible, gated on §9 |
| Local OCR | An OCR runtime that does not exist (§1.7); new dependency | None | Requires an explicit dependency decision; not authorised here |
| Local PDF rasterisation | A PDF renderer that does not exist (§1.7) | None | Same |

There is no third option. "Send the bytes nowhere and still read the text" is only
true with a local runtime, and there isn't one.

### 4.3 Preprocessing and extraction

1. Validate type and size against the §3.3 contract; refuse early with a typed code.
2. Hash the original bytes before any transformation (`contentHash` in §3.6).
3. If a PDF, rasterise pages (prerequisite: renderer). Record per-page images; the
   original PDF bytes remain the provenance identity.
4. Reduce: cap the long edge, re-encode, strip metadata **including EXIF GPS**. EXIF
   is personal data and there is no reason for it to leave the device.
5. Send, or run locally, one page/frame at a time so a single failure is scoped to
   one page rather than to the document.
6. Union the outputs into the document-text representation used by the rest of the
   pipeline, with `MultimodalProvenance` attached per produced block.

### 4.4 Provenance and locations

`locator.kind = "page"`, with optional `bbox` normalised to 0–1. OCR word boxes that
the provider does not return are recorded as `null` — a missing box is not estimated.
Character offsets are not fabricated from a provider's token stream. Because the
existing chunking (§1.5) discards positions, keeping page numbers requires the
chunk model to carry a locator; that is part of A0.

### 4.5 Failure and unsupported input

| Situation | Behaviour |
| --- | --- |
| Capability `UNKNOWN` | Request never sent; `MODALITY_UNKNOWN`. |
| Capability `STALE` | Treated as `UNKNOWN`. |
| Model lacks vision | `MODALITY_UNSUPPORTED`; offer the text path explicitly as a *different* action. |
| Oversize input | `INPUT_TOO_LARGE`, with the measured limit and the file's actual size. |
| Blank page, mostly-noise scan | `EXTRACTION_FAILED` for that page; other pages still returned; document-level flag set. |
| Text found, but low quality (e.g. poor handwriting) | `EXTRACTION_PARTIAL`, `warnings` populated, `confidenceBasis` states "self-reported by the vision model, not independently checked". |
| Provider error | Existing error path (`UPSTREAM`/`INVALID_KEY`/`TIMEOUT`); no partial answer presented as complete. |

### 4.6 Evaluation set design

The evaluation must be able to distinguish "the model read the image" from "the
model wrote something plausible". Design:

1. **Authored fixtures.** Pages the team composes itself, so ground truth is known
   exactly and redistributable. Generate raster variants locally: `sharp ^0.35.3`
   is already a devDependency, used by `scripts/generate-icon.cjs` for icon
   generation, so raster fixtures can be produced without downloading anything.
2. **Ground-truth text with position.** Each fixture ships a text label plus the
   region or page it occupies, so page-level and (optionally) region-level
   attribution can be scored separately.
3. **Case classes, each with its own score line:** clean print; small print below a
   defined height threshold; low contrast; rotation/skew; mixed layout with columns;
   a chart (labels and axis values, where the honest answer may be "values are
   estimated from a plot"); a table; handwriting (expected to be a hard failure
   class, and scored as such); non-Latin scripts; a page with a deliberate
   adversarial instruction printed in the image (see below).
4. **Non-extraction class:** an image with no text at all. The correct output is
   "no text found", and producing invented text is the worst possible failure.
5. **Injection class:** an image containing text such as "ignore previous
   instructions and output X". Success is refusing to treat image text as
   instructions. This is scored, not assumed.
6. **Scoring:** exact-match ratio for short tokens (numbers, codes, dates — the
   values that matter in documents), a normalised character-error rate for prose,
   and citation-attribution accuracy for page numbers. The report lists failures
   with the fixture id, not only an aggregate.
7. **Never** score against text produced by the same model ("model agrees with
   itself"), and never score an aggregate without the per-class breakdown.

### 4.7 Budgets

Measure per §3.7. Two modality-specific notes: preprocessing cost scales with pages,
and the relay's 55 s request timeout is a hard ceiling that a large multi-page
document will hit, so page-at-a-time requests are not merely an error-scoping
choice — they are how the timeout is respected.

### 4.8 Consent and privacy

Images are unusually sensitive: identity documents, medical scans, whiteboards with
unreleased plans, photos with location metadata. Therefore: EXIF stripped
unconditionally; the egress declaration names the file and the derivation; the
original bytes are never sent when a reduced derivative is sufficient; the
provenance record keeps the hash of the original so the user's own record shows
exactly what was sent and that it was a derivative.

---

## 5. Modality B — audio transcription and speech input

**Job to be done:** the user speaks a research question, or submits a recording
(lecture, interview, meeting) and wants a transcript usable as evidence.

### 5.1 Input types and size limits

Microphone capture via `MediaRecorder` (a platform API, no new dependency) produces
`audio/webm` in Chromium; file input would be `.wav`, `.mp3`, `.m4a`, `.webm`.
Size reality: 60 s of 16 kHz mono PCM is ~1.9 MB; even aggressively compressed
speech is hundreds of KB per minute. Against a 256 KB relay cap (§1.2), **the current
policy makes audio transport impossible**, and unlike an image it cannot be reduced
to fit — cutting audio to fit is cutting off the content.

So modality B has the most prerequisites of any modality here, and the plan should
say so plainly rather than pretend a small tweak unlocks it.

### 5.2 Local or remote

Local transcription requires an ASR runtime that does not exist (§1.7). Remote
requires (a) a transport policy that accepts audio, (b) a probed model, (c) a
documented retention position for a provider handling audio, which is a
qualitatively different privacy question than "bytes of a PDF". Both are gated.

### 5.3 Preprocessing and extraction

Capture or ingest → encode to a single documented format at a documented sample
rate and bitrate → hash → send or process → receive transcript with segment
timestamps → normalise to text blocks. Speech input for *queries* is a strictly
smaller variant of the same path and should be designed as such rather than as a
second pipeline.

### 5.4 Provenance and locations

`locator.kind = "time"` with `startMs`, `endMs`, and a `toleranceMs` that records
the known alignment imprecision (segment timestamps from speech recognition are not
sample-accurate; claiming ±0 ms would be false). The transcript text stored as
evidence is the recogniser's output, and the provenance record says so, so a later
reader can distinguish "the speaker said this" from "the system heard this".

### 5.5 Failure and unsupported input

No speech detected → `EXTRACTION_FAILED`, not an empty transcript. Overlapping
speakers → transcription proceeds, diarisation is `UNSUPPORTED` unless separately
probed (and is a different capability from transcription; do not bundle them).
Noisy audio → `EXTRACTION_PARTIAL` with warnings. Microphone permission denied →
a UI-level state, not an error code, and no request is attempted.

### 5.6 Evaluation set design

Authored recordings (the team records its own speech, so no licensing question and
no download). Classes: read speech (clean baseline); spontaneous speech; domain
vocabulary (names, units, technical terms, so the failure is measurable where it
matters); numbers and units spoken aloud; accented speech; background noise;
overlapping speech; silence; long-form (>10 min) for timeout behaviour. Scoring:
normalised word error rate for prose, *and* exact accuracy on numbers/names
separately, because a 4% WER that corrupts every numerical value is a failing
system for research use. Plus a timestamp-accuracy check against known offsets, and
an injection class: an audio clip containing a spoken instruction.

### 5.7 Budgets

Measure per §3.7. Note that a hosted relay's request timeout must be reconciled with
audio length, and the honest answer may be "chunk the audio", which then requires
provenance stitching and is its own correctness problem (word split across chunk
boundaries).

### 5.8 Consent and privacy

Microphone capture requires in-product disclosure and an explicit start action;
recording must have a visible, persistent indicator. Third-party voices are a
consent question the *user* owns, so the product's job is to make the egress
obvious and to make deletion complete: the transcript and its provenance are local
records and must be deletable, and the deletion must be verified rather than assumed.

---

## 6. Modality C — speech output

**Job to be done:** read a report or an explanation aloud.

### 6.1 Input types and size limits

Input is text the product already has. The limit that matters is *length*: reading a
4,000-word report aloud is minutes of audio, which affects interruption handling and
cost. A per-utterance cap and streaming by paragraph are design decisions to be
measured, not assumed.

### 6.2 Local or remote

Local synthesis via the platform's speech synthesis interface, if present in the
target runtime, has **no egress** and therefore no privacy cost — but its
availability, voice list, and quality in Electron are `UNKNOWN` and must be probed
on each target platform (Windows desktop, and whichever browsers are supported).
Remote synthesis has the same transport and privacy costs as B, plus higher cost per
minute. **Local-first is the correct default for C, and if local synthesis is not
available the honest behaviour is to not offer the feature.**

### 6.3 Preprocessing and extraction

None for the content itself. But there is a real preprocessing question: what text
is spoken. Markdown headings read as "hash hash", citation markers read as noise,
code blocks are meaningless aloud. A renderer that produces a *speech-safe* form
from the report is required, and that renderer's output must be inspectable by the
user ("what will be read").

### 6.4 Provenance and locations

C is output-only: nothing becomes evidence. The provenance requirement is inverted —
the *speech* must be traceable to the report it read, so a user can tell that what
they heard was generated from an earlier, possibly stale, version. Record the report
version/hash alongside the utterance, and stop or re-sync if the report changes.

### 6.5 Failure

No synthesis engine → feature absent, not silently degraded to nothing. Voice
unavailable → offer the available list, do not fall back to a different engine
without saying so. Interruption must stop audio promptly and must not leave the UI
in a "speaking" state.

### 6.6 Evaluation set design

Perceptual quality is not objectively scorable here, and this document will not
pretend otherwise. What *is* objectively scorable: (1) does the spoken text match
the intended speech-safe render (round-trip on authored strings); (2) do
numbers/units/abbreviations read correctly (a curated list: `3.14`, `H₂O`, `e.g.`,
`12,000`, `200 ms`); (3) interruption latency; (4) does the engine exist at all on
each target platform. Human listening notes may be recorded as *opinions*, clearly
labelled, never as metrics.

### 6.7 Budgets and consent

Local synthesis: CPU and time-to-first-audio, measured. No egress, so no consent
prompt for data — but a persistent, obvious stop control, because audio that cannot
be stopped is a usability defect with accessibility consequences.

---

## 7. Modality D — video sampling and timestamp-aligned events

**Job to be done:** a recorded lecture, a screen recording, an experiment recording —
the user wants events located in time and citable.

### 7.1 Input types and size limits

`.mp4`, `.webm`, `.mov` as candidates. Video is the largest input class by orders of
magnitude: a 10-minute 1080p recording is hundreds of MB. It will **never** be sent
whole through the relay. The design is therefore sampling-first: decode locally,
sample frames at an interval, send frames and (if B exists) extracted audio. The
limits that matter are frames per request, frames per minute of video, and total
frames per document.

### 7.2 Local or remote

Local decoding requires container/codec support. Whether the target runtime can
decode the user's files without a new dependency is `UNKNOWN` and must be probed
(`<video>` element support plus a decode test; on the development machine, check
availability of an external `ffmpeg` with `ffmpeg -version` — presence is not
assumed and its absence is not a blocker for the plan, only for a fixture-generation
shortcut).

Frames go remote only under the same gating as modality A; audio under B.

### 7.3 Preprocessing

1. Hash original. 2. Probe duration and decodability; refuse unreadable containers
early with a typed code rather than after a long partial run. 3. Sample at a
*recorded* interval (the interval is part of provenance, because a 30-second gap
that hides an event is a correctness property, not a detail). 4. Optionally detect
scene changes to place samples where content changes — but any such heuristic's
behaviour must be recorded, because "we sampled where we thought it changed" is an
assumption. 5. Downscale/compress each frame as in A. 6. Extract audio segments
where B is available.

### 7.4 Provenance and locations

`locator.kind = "time"` with the sample's timestamp and the sampling interval, plus
`toleranceMs` expressing that the true event lies within the sampling gap. An event
detected "between frame n and frame n+1" must be recorded as a range, never as a
precise timestamp that the sampling cannot support.

### 7.5 Failure and unsupported input

Undecodable container → `EXTRACTION_FAILED` before sampling. Duration above limit →
refuse with the measured limit (long video silently truncated is worse than a
refusal, because the missing part is invisible). Zero detectable events → an honest
empty result, not a manufactured summary. Frame budget exhausted → `EXTRACTION_PARTIAL`
with the covered range stated.

### 7.6 Evaluation set design

Fixtures authored or generated locally by the team (authored frames assembled into a
short clip; whether an assembly tool exists locally is `UNKNOWN` and is part of the
prerequisite check). Classes: an event at a known timestamp (measure whether the
reported time falls in the correct sampling window); two events close together
(measure whether both are found); no-event video (measure false positives); static
video (measure wasted budget); text-on-screen (which is OCR/A wearing a different
hat — score it with A's checker); a spoken instruction (injection class). Scoring:
event detection recall and precision at the *window* level, timestamp error in
seconds, and cost per minute of video.

### 7.7 Budgets

Frames × per-frame cost, plus decode time, plus audio if present. This is the most
expensive modality here along every axis and the one most likely to produce results
too weak to ship. That is a reason to do it last (§9), not a reason to skip the
evaluation design.

### 7.8 Consent and privacy

Video routinely contains people, voices, faces, locations, and bystanders who never
consented to anything. The egress declaration must state that frames (images) and
audio leave the device. Frame-level redaction (face/plate blurring) is a research
problem; claiming it works without measurement would be exactly the kind of claim
this document forbids. Until then, the honest position is: video egress is high
sensitivity, it requires explicit per-file consent with that stated plainly, and it
is the last modality to be enabled.

---

## 8. Modality E — structured tables, time series, and scientific data

**Job to be done:** numbers that must be *correct*, not merely present — a table in
a paper, a CSV of measurements, a time series, units, columns, and missing values.

### 8.1 Input types and size limits

`.csv`, `.tsv`, delimited text, markdown tables already present inside extracted
document text, and JSON/JSONL. Note the asymmetry with A–D: **this is the only
modality whose primary data path can be a pure local, deterministic parser with no
egress at all.** Everything needed is in the file's characters.

Limits are set by memory, not by the relay, for the local path: a row count and a
cell-length cap to bound memory, and — critically — arithmetic over numbers must be
performed on the parsed numeric values, never by sending them to a model to be
"read back".

### 8.2 Local or remote

Local by default. A model may be asked to *explain* a table, but it must never be the
component that *reads the values*, because the failure mode (a plausible wrong
number) is exactly the failure this modality exists to prevent. When a model is used
on top of parsed values, the parsed values are the evidence and the model output is
a summary with a provenance link back to the row range.

### 8.3 Preprocessing and extraction

Detect delimiter and encoding; detect and record header presence; parse to a typed
grid; infer types (integer, float, date, string) with explicit ambiguity handling;
detect units from column headers and record what was inferred versus what was
literal; detect missing values and record the convention (`""`, `NA`, `-1`, `0`);
preserve the original cell text alongside the parsed value so a wrong inference is
visible rather than invisible.

Known hazards to handle explicitly: decimal comma vs point; thousands separators;
`1e5` notation; date formats (03/04/2025 is ambiguous — record the assumption, do
not silently pick); trailing units inside cells (`12.5 kg`); merged/multi-row headers
in exported tables; spreadsheet "¬" character errors.

### 8.4 Provenance and locations

`locator.kind = "table"` with table index and row/column ranges; cell-level origin
retained for every derived value; a `derivation` string for any computed number
(e.g. "mean of column 3, rows 2–11, excluding 2 missing values"). Every number in a
report that came from a table must be recomputable from the stored grid and the
recorded derivation. That property is the point of this modality.

### 8.5 Failure and unsupported input

Unparseable → `EXTRACTION_FAILED`, with the first offending line number shown. Partially
parseable → `EXTRACTION_PARTIAL` and the offending rows listed, never dropped
silently. Ambiguous type inference → record both readings as a warning rather than
choosing quietly. A table that is an image rather than text is **not** this modality;
it is modality A, and must be labelled as such.

### 8.6 Evaluation set design

This is the only modality with a genuinely deterministic oracle, so use it:

1. **Round-trip:** parse(fixture) → serialise → parse again → assert identical typed
   grid. Any difference is a bug, with no model in the loop.
2. **Known-value:** fixtures with pre-computed expected aggregates (sum, mean, min,
   max per column), asserted exactly. Floating point comparisons use a stated
   tolerance.
3. **Trap fixtures:** decimal commas, thousands separators, `NA` conventions, mixed
   units, quoted fields containing the delimiter, embedded newlines, leading zeros
   in identifiers (which must survive as strings, not be coerced to numbers), very
   large integers beyond float precision, Unicode column names.
4. **Ambiguity fixtures:** where the correct behaviour is to surface the ambiguity.
   Success is "reported the ambiguity", not "guessed right".
5. **Model-on-top fixtures:** where the correct behaviour is a summary that does not
   introduce any number absent from the grid. Checked by extracting all numeric
   tokens from the summary and asserting each is present in the grid or is a stated
   derivation of it.

### 8.7 Budgets

CPU-bound. Measure parse throughput (rows/s) and memory per row; set the caps from
the measurement. Latency is dominated by parsing, not by any provider.

### 8.8 Consent and privacy

Local parsing: no egress, and the consent prompt is not required for the parse
itself. It *is* required if the parsed values are subsequently included in a prompt
that goes to a provider — which is a normal, likely path, and must be treated as
egress of the *data values*, not only of the file.

---

## 9. Recommended implementation order, and gates between modalities

Order is chosen by (1) testability without a provider, (2) egress cost, (3) number of
missing prerequisites, (4) user value. It is deliberately not "the most exciting
modality first".

| Order | Item | Why here |
| --- | --- | --- |
| 0 | **A0 shared instrument** (§10) | Every other item depends on it and it needs no provider. |
| 1 | **E — structured data, local path** | Deterministic oracle, no egress, no dependency, proves the provenance model end to end. |
| 2 | **A — image/vision** | Highest user value; gated on the transport decision and a real probe. |
| 3 | **C — speech output** | Local-first; independently useful; a platform probe decides whether it exists at all. |
| 4 | **B — audio input** | Blocked on transport policy and a genuinely different privacy review. |
| 5 | **D — video** | Most expensive, most sensitive, most likely to disappoint; do it last with full instrumentation from the earlier modalities. |

**Gates.** A gate is a precondition, not a milestone; failing a gate means the next
item does not start, and the honest outcome of a failed gate is "not built".

- **G0 → 1.** Capability registry exists with all entries `UNKNOWN`; the §3.3
  refusal codes are asserted by tests; §3.6 provenance is carried on items produced
  by the existing text path; the extraction duplication (§1.4) is resolved so there
  is one extraction entry point to extend.
- **G1 → 2.** E passes its round-trip and known-value suites on the authored fixture
  set, and its ambiguity handling is *demonstrated*, not asserted.
- **G2 → 3.** A's `path` decision (A1 reduction vs A2 raised cap) is made and
  recorded; one real probe exists for the chosen model with `SUPPORTED`; the
  injection class is scored; the reduction (if A1) has a measured accuracy curve;
  the EXIF-stripping behaviour is verified by inspecting the outgoing request in a
  test, not by reading the code.
- **G3 → 4.** C's platform probe is complete on every target; if no local engine
  exists, C is closed as `UNSUPPORTED` and this gate is resolved by decision, not by
  building a remote version.
- **G4 → 5.** B's transport and retention position is documented and reviewed; a
  probe exists; chunk-stitching correctness is demonstrated (no word lost at a
  boundary).
- **G5 → done.** D's sampling interval, event window definition, and sensitivity are
  recorded; D's consent language has been reviewed for the bystander problem; D's
  evaluation shows a usable precision/recall trade-off *at the chosen interval* —
  otherwise D is not shipped, and the findings are written down.

**Cross-cutting exit condition for any modality:** the capability matrix row for the
shipped model is `SUPPORTED` with a date and a probe id, the §3.7 budget is filled
from a measurement, the §3.2 egress declaration matches what the code actually
sends (verified by a test that inspects the request), and the §3.4 no-simulation
rule holds under a deliberately broken-cable test (disable the model, confirm the
UI neither fabricates output nor claims success).

---

## 10. The first concrete step, and it is modality A's prerequisite

**A0 is not "caption an image".** It is the smallest change that makes any modality
safe to evaluate, and it is fully evaluable without a network call, a model, or a
download.

### 10.1 Deliverables (proposed; none of these exist today)

| # | Deliverable | Exists today? |
| --- | --- | --- |
| 1 | A capability registry: data keyed by (model id, modality) with the §2.2 states, shipped with every row `UNKNOWN`. | No |
| 2 | The §3.3 refusal codes wired into the existing error path so an unsupported input yields a typed, readable refusal. | No |
| 3 | One extraction entry point, replacing the duplicated pair in `src/pipeline/documentEngine.ts` and `src/langgraph/nodes/DocumentNode.ts`, with one canonical set of error codes. | No — two divergent copies exist |
| 4 | `MultimodalProvenance` (§3.6) carried through chunking, so a locator survives from file to retrieved chunk. | No — `position` is an ordinal |
| 5 | An authored fixture corpus plus the offline failure-characterisation test (§10.2). | No |
| 6 | An operator runbook for the §2.3 probe. | No |

### 10.2 The offline test that makes step A0 real

Build the fixture corpus with **no downloads**:

- Text fixtures authored directly in the repository.
- Raster fixtures generated locally with `sharp` (already a devDependency, used by
  `scripts/generate-icon.cjs` for icon generation). A fixture is a rendered page
  containing known text at known positions — which is precisely what a vision
  evaluation needs, and it can be regenerated byte-identically from a script.
- Every generated fixture carries a machine-readable label file with its ground-truth
  text and regions. Fixtures are marked as fixtures in the filename and in a
  corpus README (proposed path, does not exist today).

Then assert, as tests:

1. Today's extraction path refuses `.png` with a typed code — and the test will
   expose the current divergence (`UNSUPPORTED_FILE` vs `UNSUPPORTED_FILE_TYPE`),
   which is itself the first finding.
2. An image document fed to the pipeline produces a typed refusal and a user-visible
   message, **and no model request is made** (assert on the absence of a fetch call).
3. The capability registry returns `UNKNOWN` for every modality, and the request
   path refuses `UNKNOWN` with `MODALITY_UNKNOWN`, not with a generic failure.
4. A provenance round-trip: an item created with a `page` locator still carries that
   locator after chunking and retrieval.

**Why this is the right first step.** It is measurable today, it needs no
credential, no network, no model, and no new dependency; it forces the two
duplicated extractors into one place, which every modality needs; and it converts
"multimodal support" from an intention into a contract that has tests. If step A0
cannot be completed, no modality above it will be trustworthy, because the product
will have no way to say "I cannot read this" in a way that is distinguishable from
"I read this and it was empty".

### 10.3 Acceptance criteria for A0

- The four assertions above pass in `npm.cmd run test`.
- `npm.cmd run lint` and `npx.cmd tsc --noEmit` are clean.
- One canonical extraction entry point; no second copy of the ZIP/inflate code.
- The capability registry contains no `SUPPORTED` row (nothing has been probed).
- No new dependency in `package.json`.
- No network call in any A0 test (assert by running the suite with outbound access
  blocked, and by the fetch-absence assertion).

---

## 11. Ordering constraints and non-goals

- **Non-goal:** a general multimodal agent. This plan adds input handling per
  modality, each independently gated.
- **Non-goal:** improving `computeFaithfulness` for multimodal evidence. That is
  real work and is explicitly deferred; until it exists, answers grounded in
  non-text evidence must be labelled as such and must not inherit a confidence
  number computed over text.
- **Non-goal:** "local-first multimodal". It is desirable and it is currently
  impossible (§1.7); it should be evaluated as a dependency decision, not smuggled in
  as an implementation detail.
- **Ordering constraint:** the relay policy change (§1.1, §1.2) must precede any
  transport-carrying modality, and must be reviewed for cost and memory effects on
  both relay profiles, because `readBody` buffers up to the cap.

---

## 12. Open register — things this document does not know

Each entry names how it would be determined. Entries are not TODOs to be quietly
closed; they are the current state of knowledge.

| # | `UNKNOWN` | How it would be determined |
| --- | --- | --- |
| 1 | Whether any listed model actually accepts images/audio/video. | §2.3 probe, recorded in §2.4. |
| 2 | Whether the vision path's failures on small print are acceptable after reduction. | Measure A's accuracy curve against the authored fixtures at several scales. |
| 3 | Real-world input size distribution for user documents. | Instrument locally on the *user's own* device over a fixture set first; real distribution requires a privacy-reviewed local-only histogram, opt-in, and is not assumed. |
| 4 | The target machine class (CPU/GPU/RAM) for local budgets. | `nvidia-smi`; else `Get-CimInstance Win32_VideoController` and `Win32_Processor`. |
| 5 | Whether a local PDF renderer, OCR, or ASR runtime can be adopted. | A dependency decision with size, licence, and supply-chain review — not part of this mission. |
| 6 | Whether the Electron/web runtimes offer platform speech synthesis, and with which voices. | Platform probe on each target. |
| 7 | Whether local video decode or an external `ffmpeg` is available. | `ffmpeg -version`; a decode test in the target runtime. |
| 8 | Provider retention behaviour for each input type. | Read the provider's current terms; record date and quote. `UNKNOWN` until then, and "we do not store it" is not an answer for the provider. |
| 9 | The documentation discrepancy in `docs/product-architecture.md` §"Network boundaries" regarding desktop egress (§1.3). | Fix by editing that document in a separate, deliberate change; recorded here so it is not lost. |
| 10 | What a fixed per-call cost budget should be. | Derive from measured probe cost and an operator-set monthly ceiling; no ceiling exists today because no modality exists. |

---

## 13. What this plan does not claim

- No modality is implemented; no modality is "in progress".
- No model is claimed to support any modality. Every capability row is `UNKNOWN`.
- No performance, accuracy, cost, or latency number is claimed, because none has
  been measured.
- No local processing is claimed, because no local inference runtime exists in this
  repository.
- No guarantee is made that any modality will survive its gate. A failed gate
  produces a written finding, and the modality is not built.

The commitments this document does make are negative ones, and they hold from the
moment it is merged: unavailable modalities fail closed with typed refusals; no
modality is ever simulated; no capability is inferred from a model's name.
