# Evaluation harness

This document describes the offline evaluation harness in `src/eval/`. It is
dev/test tooling: nothing here is wired into the app at runtime, and nothing
here contacts a network or a model provider.

**Read this first — status of the numbers.** No hosted or local model has ever
been run through this harness in this repository. Every run record produced by
the shipped code is generated from hand-written fixture transcripts
(`src/eval/datasets/*-replay.ts`). A green run proves the *harness* accepts
answers that satisfy the expectations, and a red run proves failures are
reported — neither is evidence about the quality of the application or of any
model. The confidence figures the app shows are **not calibrated
probabilities**; see [Confidence caveat](#confidence-caveat).

## Layout

| Path | Purpose |
| --- | --- |
| `src/eval/dataset.ts` | Dataset/case/expectation schema, categories, version constants |
| `src/eval/validate.ts` | Structural validation (errors vs warnings) |
| `src/eval/answer.ts` | `AnswerFn` / `RunnerAnswer` — the system-under-test boundary |
| `src/eval/scorers.ts` | Pure per-category scoring; `not_evaluated` semantics |
| `src/eval/run-record.ts` | Run record types, `scoreRun()`, failures, serialization |
| `src/eval/calibration.ts` | Evidence-coverage labels, caveat, FP/FN tracking |
| `src/eval/runner.ts` | `runEvaluation()`, replay answer function |
| `src/eval/hash.ts` | Stable digests (FNV-1a) for fingerprints |
| `src/eval/index.ts` | Public barrel for the whole harness |
| `src/eval/datasets/` | Two shipped datasets + their recorded baseline answers |
| `src/test/eval/` | Unit tests for all of the above |

## How to run it

There is no standalone CLI; the harness runs from tests or from any caller that
can import ESM/TypeScript (Vitest, Node with a TS loader, future tooling).

```powershell
# Everything, including the harness tests
npm.cmd run test

# Only the harness tests
npx.cmd vitest run src/test/eval
```

Programmatically (for example inside a Vitest test or a future script):

```ts
import { DEFAULT_DATASET_SET, DEFAULT_REPLAY, createReplayAnswerFn, runEvaluation } from "./src/eval";

const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
  provider: "fixture",
  model: "deterministic-replay",
});
console.log(record.aggregate.passRate, record.failures);
```

Current shipped baseline (from `src/test/eval/datasets.test.ts`, not a claim
about the app): the regression set is 9/9 green; the fresh set contains one
intentionally failing case, so the default set reports 15 passed, 1 failed,
16 evaluated, 0 `not_evaluated`.

## What is mocked vs real

| Piece | Status |
| --- | --- |
| Answers (`RunnerAnswer`) | **Mocked** — recorded fixture transcripts, no model calls |
| Retrieval ids, citations, heuristic signals | **Mocked** — recorded alongside the transcript |
| Provider / `src/providers` imports | **Absent** — the harness does not import them |
| Dataset validation | **Real** — unit-tested |
| Category scoring | **Real** — unit-tested |
| Aggregation, failure collection, serialization | **Real** — unit-tested |
| FP/FN counting | **Real arithmetic** over fixture ground truth; the confidence threshold is imported from `src/pipeline/scoring.ts` (`confidenceLabel`) so it tracks the shipped heuristic — that pure scoring module is the harness's only pipeline dependency |
| Evidence-coverage labels | **Real function**, heuristic thresholds, unit-tested |
| Empirical calibration | **Does not exist** — no held-out dataset (see below) |

The runner performs no network I/O. A test stubs `globalThis.fetch` to throw
and asserts it is never called during a full default-set run. That guarantee
covers the runner and scorers; an *injected* answer function could still do
I/O, which is why `reproducibility.answerSource` exists and why the shipped
default is a replay fixture.

## Wiring the real pipeline (not implemented)

`AnswerFn` is the seam:

```ts
type AnswerFn = (testCase: EvalTestCase, context: AnswerContext) => Promise<RunnerAnswer>;
```

An adapter could map `runPipeline()` results (`src/langgraph/index.ts`) onto
`RunnerAnswer` — text from `response`, `signals.confidenceScore` from
`intelligence.confidence.score`, `signals.hallucinationFlagged` from
`intelligence.hallucination.present`, retrieval ids from
`intelligence.retrievedChunks`. Two honest obstacles: the pipeline currently
reports grounded sources by *name*, not by the dataset's stable source ids, and
it does not emit structured `citedSourceIds` at all — so `source_fidelity`
cases would be `not_evaluated` until that mapping exists. Such an adapter would
also make a run perform real network calls, which is why it is deliberately not
shipped here.

## Dataset schema

Datasets are plain JSON-representable data. The TypeScript types are the schema;
this section documents the shape. Version constants: `DATASET_SCHEMA_VERSION`
(format) and per-dataset `version` (contents, semver).

```jsonc
{
  "datasetId": "blackletter-regression-core",   // stable kebab-case id
  "version": "1.0.0",                            // semver of the contents
  "createdAt": "2026-10-16T00:00:00.000Z",
  "description": "…",
  "kind": "regression",                          // "regression" | "fresh"
  "provenance": "synthetic",                     // literal type guard
  "cases": [
    {
      "id": "reg-answer-idempotent-retry",       // unique across the whole set
      "category": "answer_correctness",          // one of the nine categories
      "input": {
        "prompt": "…",
        "sources": [
          { "id": "doc-idem-note", "title": "…", "text": "…", "provenance": "synthetic" }
        ]
      },
      "expectation": {
        // exactly the block matching `category` (see table below)
        "answer": { "requiredPhrases": ["does not duplicate"], "forbiddenPhrases": ["…"] },
        // optional ground truth for heuristic FP/FN tracking only
        "heuristics": { "answerReliable": true, "groundedInSources": true }
      },
      "metadata": {
        "createdAt": "2026-10-16T00:00:00.000Z",
        "author": "quality-programme",
        "revision": 1,
        "rationale": "why this case exists",
        "tags": ["correctness"],
        "knownGap": "optional note when the recorded baseline is expected to fail"
      }
    }
  ]
}
```

`EvalDatasetSet` groups datasets: `{ setId, version, createdAt, description,
datasets[] }`. The runner takes a *set* so the frozen regression dataset and the
replaceable fresh dataset can be run separately or together, and so optimising
against a single static file is not sufficient.

### Categories and expectation blocks

| Category | Expectation block | What is checked (lexically) |
| --- | --- | --- |
| `answer_correctness` | `answer` | required phrases present, forbidden absent |
| `source_fidelity` | `sources` | required/forbidden cited source ids (requires `citedSourceIds`) |
| `retrieval_relevance` | `retrieval` | required/forbidden retrieved source ids (requires `retrievedSourceIds`) |
| `contradiction_detection` | `contradiction` | conflict marker present/absent vs ground truth `present` |
| `uncertainty_abstention` | `uncertainty` | abstention markers present when abstaining is required, absent when answering is required |
| `structured_output` | `output` | JSON parses + required keys, or required markdown headings |
| `tool_honesty` | `tools` | no claims of unavailable tools, required disclosures present |
| `prompt_injection_resilience` | `injection` | canary/forbidden phrases absent, legitimate-request phrases present |
| `permission_boundary` | `permission` | refusal marker present, compliance markers absent |

Phrase matching is **lexical**: lowercased, punctuation/whitespace collapsed,
matched on word boundaries. It is strict and brittle by design — it is a
fixture harness, not a natural-language judge. Paraphrases can fail; see
[What is not measured](#what-is-not-measured).

### Versioning

- Patch bump: wording, rationale or tag edits that cannot change pass/fail.
- Minor bump: new cases added.
- Major bump: an expectation changed, a case removed, or the category of a case
  changed.
- `metadata.revision` increments per case whenever its expectation changes.
- Run records capture `datasetId`, `version` and an FNV-1a digest of the dataset
  contents. The digest changes when a fixture changes even without a version
  bump, so a `configurationFingerprint` mismatch is visible.

Validation (`validateDatasetSet`) returns errors (structure, ids, provenance,
unknown categories) and warnings (missing expectation block, unusable
injection block, empty dataset). `runEvaluation` throws on errors and folds
warnings into `reproducibility.notes`.

## `not_evaluated` is not zero

A case is scored only when its expectation block exists and the answer function
reported the structured facts the block needs. Otherwise the result is
`not_evaluated` with a precise reason, `score: null`, and the category's
`passRate`/`meanCheckScore` are `null` — never `0`. `collectFailures` excludes
`not_evaluated` cases entirely; they are missing evidence, not failures.
`aggregate.byCategory` always lists all nine categories so an uncovered
category is visible as `not_evaluated` rather than silently absent.

## Run records

`runEvaluation` returns an `EvalRunRecord` (JSON-safe, schema-versioned,
serializable via `serializeRunRecord` / `parseRunRecord`). It contains:

- model/provider identifiers (`provider`, `model`) and `answerSource`;
- `configurationFingerprint` — a digest over provider, model, answer source,
  and dataset ids/versions/digests. Timestamps and run ids are excluded, so the
  same configuration fingerprints identically across runs. It is a change
  detector, not a security hash;
- dataset set id/version and per-dataset refs (kind, case count, digest);
- timestamps, Node/platform environment, `reproducibility` metadata
  (clock/run-id injection flags, honest notes);
- per-case results (status, score, checks, skip reason or error, captured
  signals), the aggregate, and the explicit failure list;
- `heuristicDiagnostics` (see below) and the confidence caveat verbatim.

Determinism: with an injected clock (`now`) and `runId`, two runs produce
byte-identical records (tested with `toStrictEqual`). Without injection, case
results and aggregates are still identical; only ids, timestamps and per-case
durations differ.

## Evidence coverage and false positives / false negatives

`describeEvidenceCoverage()` maps retrieval/faithfulness signals to a
transparent label with the exact criteria attached. Bands:

- **strong** — `>= 4` retrieved chunks, top chunk score `>= 0.50`, and a
  *measured* faithfulness `>= 0.75`;
- **moderate** — `>= 2` retrieved chunks, top chunk score `>= 0.25`, and
  faithfulness either unmeasured or `>= 0.50`;
- **limited** — anything below the moderate criteria, including zero evidence.

FP/FN tracking is computed only where a case declares `expectation.heuristics`
ground truth. Two matrices are produced:

- **confidence heuristic** — positive prediction: the pipeline's own
  `confidenceLabel` says `High` (`>= 75`); positive ground truth: the fixture
  judges the answer reliable. A false positive is therefore "presented as
  High confidence but judged unreliable".
- **grounding heuristic** — positive prediction: the pipeline flagged
  unsupported content; positive ground truth: the answer is unsupported by its
  sources.

Samples missing either the heuristic signal or the ground truth are counted in
`notEvaluated`, never as correct. On the shipped fixtures this yields, for the
confidence matrix: 5 TP, 1 FP, 0 TN, 4 FN, 6 `notEvaluated`; and for grounding:
0 TP, 0 FP, 9 TN, 1 FN, 6 `notEvaluated`. Those counts describe 16 hand-written
fixtures, not model behaviour.

## Confidence caveat

`src/eval/calibration.ts` exports the caveat verbatim, and every run record
embeds it:

> Not a calibrated probability. The pipeline's 0..100 confidence value is a
> deterministic lexical heuristic (retrieval overlap, faithfulness ratio,
> answer length, retry stability). It has not been measured against outcomes on
> a held-out dataset, so it must not be read as P(correct), as a percentage, or
> as a margin of safety. Treat it as a relative, within-suite signal only, and
> always show the evidence-coverage label alongside it.

`CALIBRATION_STATUS` states explicitly that **no held-out calibration dataset
exists in this repository**, so no empirical calibration numbers (accuracy-vs-
confidence curves, Brier score, ECE, reliability diagrams) are produced or
claimed. The fixtures are hand-written synthetic cases, not a survey of model
outputs. Do not add calibration claims without a real held-out dataset and the
measurement code to go with it.

## What is NOT measured

- **Model quality.** No model, hosted or local, has been run. The suite has
  never been benchmarked against any real provider.
- **Confidence calibration.** No probability, no reliability diagram, no
  Brier/ECE. The bands are heuristic labels about evidence coverage.
- **Retrieval quality on a real index.** Retrieval cases use hand-declared
  source ids; no corpus, chunker, or embedding behaviour is exercised.
- **Latency, throughput, cost, token usage.** Not measured anywhere.
- **Semantic correctness.** Phrase matching cannot judge meaning; a correct
  paraphrase can fail and a verbatim echo can pass.
- **Real safety behaviour.** Injection and permission cases judge answer
  *text* only. The harness cannot verify that a system actually refused, was
  actually unable to act, or did not perform an action in another channel.
- **Tool execution.** No tools are executed or observed.
- **Topic scope, multi-turn behaviour, memory, document parsing, UI.**
  Untouched.
- **Languages other than English.** Fixtures are English-only.
- **Statistical power.** 16 cases, exact counts only; no confidence intervals
  and no sampling. Results do not generalise beyond the fixtures.

## Adding cases

1. Add the case to the appropriate dataset file with a stable id, a
   category-matched expectation block, and an honest `rationale`.
2. Add a recorded answer to the matching `*-replay.ts` (or expect a
   `not_evaluated`/failure result — that is also a valid, visible outcome).
3. Bump the dataset version per the rules above.
4. Run `npx.cmd vitest run src/test/eval`. `datasets.test.ts` asserts replay
   coverage is exactly one answer per case and pins the expected baseline
   totals, so drift cannot pass unnoticed.
