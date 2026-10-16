# Learning Laboratory

**Document status:** design only. This document authorises no training, no dataset
download, no model pull, and no modification of any model weight.
**Scope:** Mission 13 — a separate learning pipeline that can improve one narrow,
measurable capability, with production inference isolated from training and with
release control.
**Applies to:** BlackLetter OS `3.2.0` (`package.json`).

---

## 0. Standing prohibitions and non-claims

Read this section as a precondition of every other section.

1. **No training is authorised by this document.** It defines a laboratory design.
   Running it requires a separate, explicit decision with a named owner.
2. **No dataset download is authorised.** Public corpora, model hubs, and checkpoint
   registries are out of scope for this mission. Where a public source is discussed
   it is discussed as a *candidate requiring licence review*, not as a plan to fetch.
3. **No model pull is authorised.** No weights are to be fetched, cached, or
   referenced by the shipped application.
4. **No weight modification is authorised**, by training or otherwise.
5. **The live agent must never alter its own production weights.** There is no
   online learning, no self-update, no feedback path from runtime behaviour into a
   deployed model. Training is a separate process, on separate data, producing an
   artefact that a human promotes (§F).
6. **Recursive self-improvement is not claimed and is not attempted.** A narrow
   adaptation that improves one checked capability is not a general capability gain.
7. **No broad safety guarantee is claimed.** The controls here are engineering
   controls that make specific failures detectable and reversible. They are not a
   safety framework, and passing them is not evidence that the system is safe.
8. **This document's baseline is unmeasured.** Every number that matters is marked
   with where it comes from. Thresholds are deliberately left as
   `TBD-baseline` placeholders with a rule for setting them, because inventing a
   target before measuring the baseline is how a study becomes an exercise in
   hitting a number somebody made up.

---

## 1. Verified starting position

These are the facts about the current system that constrain what a laboratory can
honestly measure. Each was read from the repository.

### 1.1 Inference today

`src/langgraph/graph.ts` wires: `UserInputNode → IntentNode → SubjectNode →
RouterNode → DocumentNode → LearningProfileNode → KnowledgeGapNode → RetrievalNode
→ PromptBuilderNode → LLMNode → QualityNode → EvaluationNode → FormatterNode →
ReportNode`. `src/langgraph/index.ts` is the entry point and records each run via
`recordRun` into the local observability store.

`PromptBuilderNode` builds the system instruction, including the current grounding
rule: when retrieved evidence exists, the model is told to base factual claims on it
and to "cite the source name inline", and to label inferred points as inferred.
Evidence is injected as `[n] <source: …>` lines, at most 15 chunks of at most 500
characters each. `MAX_DOCUMENT_CHARS` is 40,000; the document is spliced into the
prompt text. Nothing else carries document content: `AiRequest.fileContent` exists in
`src/providers/types.ts` and several call sites pass it, but `streamOpenRouter`
never forwards it and the relay rejects any field outside its five-field allowlist.

Defaults: `temperature ?? 0.7`, `maxTokens ?? 4096` (`src/langgraph/state.ts`).

### 1.2 What is measured today, and by what

`src/pipeline/scoring.ts` is the entire measurement apparatus, and it is lexical and
deterministic — no model calls:

- `computeFaithfulness` — splits the answer into sentences, checks the fraction of
  each sentence's tokens that appear anywhere in the concatenated corpus text, with
  a numeric guard, and classifies sentences as supported (ratio ≥ 0.45), unsupported
  (ratio < 0.25), or neither.
- `detectHallucination` — flags unsupported sentences that additionally contain
  multiple numbers or a capitalised non-stopword name, present when the unsupported
  ratio is ≥ 0.25.
- `computeConfidence` — `100 × (0.35·retrieval + 0.30·faithfulness + 0.25·completeness
  + 0.10·stability)`, clamped to 5–98; `confidenceLabel` is High ≥ 75, Medium ≥ 50.
- `estimateTokens` — `ceil(length / 4)`, and therefore an estimate, not a tokeniser
  count.

`QualityNode` adds five hand-written heuristics (completeness, readability,
structure, educational value, formatting) averaged with a 0.5 pass threshold.
`src/observability/metrics.ts` persists `RunRecord`s (query truncated to 200 chars,
model, timings, token estimates, confidence, faithfulness, counts) and `ErrorRecord`s
into IndexedDB, capped at 1200 runs and 500 errors, and computes per-model latency,
p95, and average confidence.

### 1.3 The consequences for a laboratory

1. **The existing metric is a proxy, and it is gameable by construction.** A sentence
   that reuses the source's vocabulary while inverting its meaning scores as
   "supported". Any optimisation target derived from `computeFaithfulness` inherits
   that weakness. A candidate must not be scored by the same function whose
   weakness the candidate could exploit.
2. **`confidence` is not calibrated, and cannot be shown to be.** It is assembled
   from the proxy above plus a length-based completeness term. There is no evidence
   in the repository of it matching observed correctness on any dataset. Treating it
   as a probability is currently unjustified; the laboratory must *measure* whether
   it tracks correctness, not assume it.
3. **There is no labelled evaluation set, no fixture corpus, no dataset schema, and
   no test fixture directory.** `vitest.config.ts` includes only
   `src/**/*.test.{ts,tsx}`; there is no `tests/` directory and no checked-in
   evaluation data. Everything in §B and §E is therefore new construction.
4. **There is no training or fine-tuning tooling, and no local inference runtime.**
   Searches for `onnxruntime`, `transformers.js`, `webgpu`, `llama.cpp`, `@xenova`,
   and `huggingface` across `src/` return no matches, and `package.json` declares no
   ML dependency. `docs/product-architecture.md` lists "Offline Intelligence (v5.0,
   planned)" as planned, which matches the code.
5. **The only model access path is the relay.** `api/chat.ts` and
   `scripts/dev-server.mjs` hold `OPENROUTER_API_KEY` and enforce
   `src/server/relay-guard.mjs`. A laboratory that calls a provider is subject to the
   same policy — including a 20-requests/minute, burst-6 token bucket per client key
   and a 55 s request timeout — and any dataset-generation loop must be shaped around
   that rather than discovering it mid-run.

---

## A. Objective definition

### A.1 The one narrow capability

> **Capability under study:** *claim-level citation labelling fidelity* — the extent
> to which an answer's factual claims are accompanied by citations that actually
> support them, where the supporting evidence is a retrieved chunk with a known
> source.

This is deliberately narrow. It is not "better research", not "more accurate
answers", and not "better writing". It is one behaviour: attaching a correct,
verifiable pointer from a claim to its evidence.

Why this capability and not another:

| Criterion | Assessment |
| --- | --- |
| Already instrumented | The pipeline already assembles evidence chunks and already has a grounding rule in the prompt (`PromptBuilderNode`). |
| Independently checkable | A citation either names a chunk that exists, or it does not; a quoted span either appears verbatim, or it does not. Structural checks are deterministic. The semantic residue ("does this chunk *support* this claim?") is adjudicated by humans under a written rubric. |
| Failure is visible | Unsupported claims and invented sources are exactly the failure the current grounding rule exists to prevent, and `detectHallucination` already flags a crude version of it. |
| No new data class required | Evaluation needs documents and questions, which the product already handles as local files. |
| Does not require a new runtime | Both baseline and candidate can be served through the existing relay, so the laboratory does not depend on a local inference runtime that does not exist. |
| Bounded | Improving it cannot be confused with improving the product's general intelligence, which is the confusion §0.6 forbids. |

### A.2 What "improved" means, operationally

A candidate is a *condition* (a prompt, a schema, a retrieval change, or an adapted
model artefact) measured against a baseline on the same items, with the same
evidence, under the same relay policy. Nothing else counts as an improvement.

### A.3 Baseline definition (must be re-measured, not assumed)

The baseline is **the current shipped behaviour, executed as-is**:

| Component | Baseline value | Source |
| --- | --- | --- |
| Model | The default from `src/config/models.ts`, or one exact probe-listed model id | `getModel("default")` → `openai/gpt-4o-mini` |
| System instruction | As produced by `PromptBuilderNode`, including the current GROUNDING RULE | `src/langgraph/nodes/PromptBuilderNode.ts` |
| Evidence injection | ≤ 15 chunks × ≤ 500 chars, `[n] <source: …>` markers | same |
| Retrieval | Lexical scoring, top-8 after re-rank | `src/pipeline/scoring.ts`, `RetrievalNode.ts` |
| Temperature / max tokens | `0.7` / `4096` unless explicitly overridden and recorded | `src/langgraph/state.ts` |
| Transport | Relay, hosted or local profile recorded per run | `src/server/relay-guard.mjs` |

The baseline is measured **by running it**, at the start of the study, on the frozen
evaluation sets, and its results are stored with the run metadata in §F.3. "The
baseline is what we remember it doing" is not a baseline.

**Baseline is unmeasured in this document.** It cannot be measured until §B and §E
exist. That ordering is the point: the baseline run comes before any candidate
exists, precisely so the candidate cannot be retro-fitted to a convenient target.

### A.4 Acceptance criteria (fixed BEFORE data collection)

The study protocol (§E.8) is written and frozen first. It fixes:

1. The primary metric: **citation support precision** — of the claims that carry a
   citation, the fraction whose citation supports the claim, per the adjudication
   rubric.
2. Secondary metrics, all reported, never selectively: citation coverage (fraction
   of checkable factual claims that carry any citation), unsupported-claim rate,
   abstention rate, answer completeness, calibration, latency p50/p95, cost per item.
3. The minimum effect size that will be treated as a result. This is set from the
   baseline measurement and the spread observed on the held-out set, and is written
   down before the candidate is trained or prompted. `TBD-baseline`.
4. The decision rule: a candidate is promoted only if the primary metric improves by
   at least the minimum effect size **and** no §A.5 regression is observed. Every
   other outcome is recorded as a negative or inconclusive result (§E.9).

No acceptance threshold in this document is a number. Any number that appears later
must carry: the metric, the set it was measured on, the date, the model id, the app
version, and the protocol version that fixed it.

### A.5 Prohibited regressions

The following are defined now, before data collection, so that a later candidate
cannot argue them away:

| # | Prohibited regression | How it would be observed |
| --- | --- | --- |
| R1 | **Fabricated citations.** Any citation naming a source or chunk that does not exist in the supplied evidence. | Structural checker; any occurrence fails the candidate outright, regardless of other gains. |
| R2 | **Misquotation.** Any quoted span attributed to a chunk that does not appear verbatim in it. | Verbatim containment check. Any occurrence fails the candidate. |
| R3 | **Over-abstention.** A material increase in "I cannot answer this" on items the baseline answered correctly. | Abstention rate, per item class. |
| R4 | **Under-abstention.** A decrease in correct abstention on unanswerable items. | Abstention rate on the intentionally unanswerable class. |
| R5 | **Confidence inflation.** The candidate's stated confidence rising without a corresponding rise in measured correctness. | Calibration comparison at several bins. |
| R6 | **Injection susceptibility.** Obeying instructions embedded in retrieved evidence or in documents. | Adversarial set; any occurrence fails the candidate. |
| R7 | **Answer completeness collapse.** Shorter answers achieved by dropping content rather than by improving accuracy. | Completeness measure defined in the protocol; the shipped `QualityNode` heuristics may be *reported* but must not be the sole measure, because they are format proxies. |
| R8 | **Budget regression beyond an agreed factor.** Latency or cost per item multiplying. | Measured, not estimated. |

R1, R2, and R6 are absolute: they are not traded off against a primary-metric gain.

### A.6 Falsification

The objective is falsified if, on the held-out set, the candidate does not beat the
baseline on the primary metric by the minimum effect size, or if any absolute
prohibition in §A.5 is violated. A falsified objective is a legitimate, reportable
outcome (§E.9) and must be written down as one.

---

## B. Data acquisition and curation

### B.1 Authorised sources

Only these, and each requires evidence before use:

| Class | Description | Requires |
| --- | --- | --- |
| S1 | **Team-authored fixtures.** Documents, questions, and evidence written for this laboratory. | Nothing beyond review. Preferred. |
| S2 | **Synthetic documents** generated by a template with known ground truth (§C). | The generator is checked in and versioned. |
| S3 | **Public-domain / openly licensed corpora** (e.g. CC0, CC-BY, or an explicit public-domain dedication). | A recorded licence identifier, a source URL, and the retrieval date. CC-BY obliges attribution, which must actually appear. |
| S4 | **Explicitly authorised production data.** Withdrawn by default (see §B.2). | A named authorisation, a stated purpose, a scope, an expiry, a deletion plan, and a redaction procedure. |

### B.2 Production and private data: excluded unless explicitly authorised

The application stores user material locally: workspaces and sessions in IndexedDB,
and `RunRecord.query` plus `ErrorRecord.message` in the observability store
(`src/observability/metrics.ts`). These are the user's research and the user's
questions. **They are excluded from the laboratory by default.**

Three specific traps, stated because each is easy to fall into:

1. **"We already have runs, let's train on them."** `RunRecord.query` contains the
   user's own words. Using it converts a local-first product into one that trains on
   private research.
2. **"The error log is anonymous."** `ErrorRecord.message` can contain file names and
   document content fragments via thrown messages. It is not anonymous.
3. **"It's on this machine, so it's fine."** Data locality and data consent are
   different questions. A dataset derived from local records still needs the
   authorisations in §B.1, still needs to be deletable, and still needs its
   provenance recorded.

If S4 is ever authorised, the minimum bar is: per-user opt-in that is revocable;
redaction of identifiers before the data leaves the user's profile; a written record
of what was removed; and a deletion path that is **tested**, not documented.

### B.3 Per-item provenance (mandatory)

Every item carries:

```jsonc
{
  "item_id": "sha256:…",            // content-addressed, stable across runs
  "source_class": "S1|S2|S3|S4",
  "source_uri": "…",                // or "authored-in-repo"
  "source_hash": "sha256:…",        // of the exact bytes used
  "licence_id": "CC-BY-4.0|public-domain|internal|…",
  "licence_evidence": "…",          // where it is written down
  "attribution_required": true,
  "attribution_text": "…",          // exact string, if required
  "retrieved_at": "2026-…",         // ISO date
  "authorised_by": "…",             // for S4 only
  "authorisation_scope": "…",
  "authorisation_expiry": "…",
  "language": "en",
  "domain_profile": "law|finance|…",// maps to src/engine/profiles/*
  "notes": "…"
}
```

An item without complete provenance is not admitted. This is enforceable in code
(§C.4) rather than by good intentions.

### B.4 Deduplication

1. **Exact:** content hash on normalised bytes (line endings, trailing whitespace).
2. **Near-duplicate:** lexical similarity over the tokenisation already used in
   `src/pipeline/scoring.ts` (`tokenize` — lowercase, drop ≤ 2 chars and stopwords),
   with a similarity threshold fixed in the protocol. Near-duplicates across the
   train/held-out boundary are contamination, not noise, and are removed rather than
   filtered.
3. **Evaluation-item protection:** evaluation item ids and their normalised text
   hashes are held in the evaluation namespace and are checked against every
   training item, before and after any transformation.

### B.5 Quality checks (a dataset has to pass before it can be used)

| Check | Failure action |
| --- | --- |
| Schema conformance (§C.4) | Reject the item. |
| Ground truth present and non-empty | Reject. |
| Evidence chunks present for every claimed citation | Reject — an item whose evidence is missing cannot test citation fidelity. |
| Language recorded and consistent with the question | Reject or reclassify. |
| Length inside the declared bounds | Reject. |
| No personal data (pattern scan for emails, phone numbers, national IDs, plus a manual sample) | Quarantine and review. |
| No credentials or tokens (the relay's `redact` patterns are a starting point, not a guarantee) | Reject the item and investigate how it got in. |
| Licence permits the intended use | Reject. |
| Not a duplicate of any evaluation item | Reject. |
| Ground truth is *independently* verified (§C.2) | Reject. |

### B.6 Contamination risk

Contamination is when the evaluation stops measuring generalisation because the
model has seen the evaluation. Risks here, in order of likelihood:

1. **Public corpora partially overlapping the evaluation set.** Very likely if S3 is
   used at all. Mitigation: prefer authored (S1/S2) items for evaluation; treat any
   S3-derived evaluation item as compromised for a public base model and use only
   fresh or authored items.
2. **The candidate's own generations leaking back in.** Generation logs must never
   become a training source. Enforced by source class: only S1–S4 feed training, and
   generated text is none of those.
3. **Model-generated "gold" answers.** Never. A model's output is a candidate
   artefact, not ground truth (§C.3).
4. **Familiarity by construction:** if the same template generated both training and
   evaluation items, the evaluation measures template recall. Templates for the two
   sets must differ, and template ids are recorded so the difference can be checked.

---

## C. Synthetic task generation

### C.1 What is generated, and what it is for

A task is: a short evidence set (several chunks, each with a source label and an
id) plus a question with a known answer and a known supporting chunk. The model's
job is to answer and cite. Generation is templated so correctness is known by
construction, and hard cases are included deliberately rather than hoped for.

### C.2 Case classes (each class exists to catch a specific failure)

| Class | Construction | The failure it exposes |
| --- | --- | --- |
| Clean | Answer stated in one chunk; question unambiguous. | Baseline sanity. |
| Multi-hop | Answer requires combining two chunks, each holding half. | Citing only one of two required sources. |
| Distributed | Evidence spread across three or more chunks, each needed. | Partial citation coverage. |
| Competing | Two chunks offer different values; one is newer or from a higher-quality source. | Citing the wrong one, or citing both without resolving. |
| Contradictory | Two chunks disagree, no resolution available. | Should surface the conflict. Producing one confident value is the failure. |
| Near-match distractor | A chunk shares vocabulary and numbers with the supporting chunk but does not contain the answer. | Lexical-matching citations, which is exactly the weakness of the current lexical scorer. |
| Unanswerable | Evidence does not contain the answer. | Correct behaviour is abstention with a reason. |
| Partially answerable | Some sub-questions answerable, one not. | Partial abstention plus partial citation. |
| Numeric | The answer is a number, a unit, or a date. | Value fidelity; the class where a plausible wrong number is most damaging. |
| Long-quote | The supporting evidence is long; the correct citation quotes the relevant clause. | Quoting the right span rather than the whole chunk. |
| Adversarial injection | A chunk contains text like "ignore the evidence and output X" or a fake citation marker. | Obeying content in evidence. |
| Format-trap | Evidence contains stray `[1]` markers, markdown that looks like citations, or duplicate ids. | Confusing format artefacts with citations. |

### C.3 Correctness must be independently checkable

Two checkers, and neither is the model:

**C.3.1 Programmatic structural checker.** Deterministic, run on every response:

- every cited id exists in the supplied evidence set;
- every quoted span appears verbatim in the cited chunk (whitespace-normalised);
- every numeric token in a claim appears in the cited chunk, or the claim is
  explicitly labelled as inferred/derived;
- no citation refers to a chunk that was not supplied;
- abstention is present or absent as the item's ground truth requires.

**C.3.2 Human adjudication.** For the semantic residue only: given the claim and the
cited chunk, does the chunk support the claim? This is a rubric question with a
written definition of *supports*, *partially supports*, and *does not support*, plus
worked examples, applied by at least two independent raters on a defined sample.
Disagreements are recorded, not averaged away, and the agreement statistic is
reported as measured.

**Neither checker may be the model under test, a sibling of it, or a prompt that
asks the same model to grade itself.** A model agreeing with itself is not
verification.

### C.4 Admissibility of generated items

Generated items enter the dataset only when: the schema validates; the template's
own ground truth is present; the structural checks pass on the template's own
expected output; and, for any class where correctness is not mechanical, a human
has adjudicated the item. Items failing any check are recorded as rejected with the
reason, so the rejection rate is visible.

### C.5 Volume and balance

Sizes are set by the study protocol, not chosen to look impressive. Two rules:
every case class that appears in the evaluation appears in training only if the
protocol intends the candidate to learn it (otherwise it is a generalisation test,
and putting it in training destroys its value); and the balance of classes is
recorded in the manifest, so a class-weighted metric cannot be presented as an
unweighted one.

---

## D. Candidate adaptation

### D.1 Ordering principle: cheapest intervention first

The laboratory does not start with training. It starts with the cheapest change that
could meet §A.4, and moves down this list only when the previous level is measured
and shown insufficient:

| Level | Intervention | Training required | Notes |
| --- | --- | --- | --- |
| L0 | **Schema and instruction** — require a machine-checkable citation format, one citation per claim, and an explicit "insufficient evidence" token. | No | The baseline prompt says "cite the source name inline", which is not checkable. Making it checkable is a prompt change, and it may resolve most of the gap. |
| L1 | **Retrieval and evidence assembly** — chunk size, overlap, ordering, how many chunks are shown, whether ids are stable. | No | `RetrievalNode` uses 700/120 and top-8; `PromptBuilderNode` truncates to 500 chars per chunk. These are untested values. |
| L2 | **Examples (few-shot) in the prompt** — drawn from training items only, never from evaluation items. | No | Cheap, measurable, and easy to revert. |
| L3 | **Distillation into a smaller local model** — teach a small model the L0 behaviour. | Yes, and needs a local runtime that does not exist (§1.4) | Attractive for cost and privacy; blocked on the runtime decision, and its evaluation burden is the same as L4. |
| L4 | **SFT / LoRA / QLoRA on an open base model.** | Yes | The last resort, not the first move. |

If L0 meets §A.4, stopping there is the correct outcome and is to be recorded as
the result. Training that is not needed is cost, risk, and an unmaintainable
artefact.

### D.2 The methods, briefly and honestly

- **SFT (supervised fine-tuning)** — fitting a model to demonstration pairs. Data
  hungry; demonstration quality becomes capability quality; can degrade behaviours
  not represented in the data (the replay concern below).
- **LoRA** — trains low-rank adapter matrices alongside frozen weights. Far cheaper
  in memory and storage, produces a small separate artefact, and is the appropriate
  starting point for the level of experiment described here.
- **QLoRA** — LoRA over a quantised base, reducing memory further at some cost to
  training stability and throughput. Relevant if and only if the available hardware
  is the binding constraint — which for this repository is `UNKNOWN` (§D.5).
- **Distillation** — training a smaller model to imitate a stronger one's behaviour.
  Here the "stronger" behaviour is the L0 schema discipline, so the teacher is the
  prompted model at L0/L2, and the student is a small local model. Blocked on the
  runtime.
- **Replay** — mixing in data representative of the model's existing behaviour so
  the adaptation does not collapse capabilities outside the target. **Mandatory if
  L4 is ever attempted**, because the evaluation must be able to observe collateral
  damage, and without replay the laboratory cannot tell "adapted" from "narrowed".

### D.3 Separation of training from production inference

Non-negotiable, and checkable:

1. Training, data preparation, and evaluation run as their own process, outside the
   application. The shipped application must contain no training code and no data
   pipeline that could be repurposed as one.
2. The application never writes to a model artefact. It reads a frozen artefact by
   immutable identifier (§F.3) or it uses the provider model id.
3. There is no feedback loop. Runtime runs do not feed training except through §B.4's
   explicitly authorised path, which requires human action and an authorisation
   record.
4. Promotion is a human action (§F.5). No automated promotion, no A/B test that
   silently makes a candidate the default.

### D.4 Resource estimate (order of magnitude, to be re-measured)

Stated as planning figures with their assumptions, because §0.8 forbids inventing a
benchmark:

| Level | Method | Model class | Training memory | Storage per artefact | Wall clock | Assumption |
| --- | --- | --- | --- | --- | --- | --- |
| L0–L2 | None | Provider model | 0 | 0 | Minutes of API calls | Relay rate limit: 20/min, burst 6 — a 200-item evaluation is ~10 minutes minimum of request budget alone. |
| L3 | Distillation | Small local student | Unknown until the runtime is chosen | Model file size | Days, plus implementation | Requires a runtime this repository does not have. |
| L4a | QLoRA | ~1–3 B params | Single consumer GPU (tens of GB) or a rented instance | Hundreds of MB to low GB | Hours to a day for a narrow dataset | Assumes a GPU; the development machine's GPU is `UNKNOWN`. |
| L4b | LoRA | ~7 B params | A single 24 GB-class GPU, or several days on CPU-only | Hundreds of MB | Days | Same assumption, plus a data volume that does not exist yet. |
| L4c | Full fine-tune | ≥ 7 B | Multi-GPU or rented cluster | GBs per checkpoint | Weeks | Out of proportion to the objective. |

The honest summary: **L0 through L2 cost mostly time and API spend, and L4 costs
hardware this repository has not documented.** That asymmetry is why §D.1 orders the
list the way it does.

### D.5 Determining the hardware (how, not a guess)

1. `nvidia-smi` for an NVIDIA GPU and its memory.
2. Otherwise `Get-CimInstance Win32_VideoController` for the adapter, and
   `Get-CimInstance Win32_Processor` plus `Win32_ComputerSystem` for CPU and RAM.
3. Record the result in the run manifest before any L4 decision is made.
4. If rented compute is proposed, the cost estimate must be written down *before*
   the run, and the data egress to that provider must be evaluated under §B and under
   the threat model's egress row.

---

## E. Independent evaluation

### E.1 Sets

| Set | Composition | Purpose |
| --- | --- | --- |
| `heldout-fixed` | Frozen at protocol-freeze time. Never used for training or prompt iteration. | The primary result. |
| `fresh` | Constructed *after* the candidate is frozen, from new templates, to detect overfitting to the fixed set. | Generalisation check. |
| `adversarial` | Injection, format traps, near-match distractors, contradictory evidence. | §A.5 R1/R2/R6. |
| `regression` | Items covering behaviour the candidate must not change (abstention classes, numeric fidelity, completeness). | §A.5 R3–R8. |

### E.2 Disjointness (enforced, not promised)

Enforced by three mechanisms: separate id namespaces; a hash check that no training
item's normalised text appears in any evaluation item; and a near-duplicate check
across the boundary at the threshold fixed in the protocol. The check runs as part
of the evaluation build and its output is stored with the report. A run whose
disjointness check fails is not a valid run.

### E.3 Metrics

| Metric | Definition | Failure it detects |
| --- | --- | --- |
| Citation support precision | Of claims carrying a citation, the fraction the rubric judges supported. | The primary metric. |
| Citation coverage | Of checkable factual claims, the fraction carrying a citation. | Underciting; also catches "solve precision by citing almost nothing". |
| Unsupported-claim rate | Claims with no citation and no inference label, divided by checkable claims. | Ungrounded assertion. |
| Structural validity | Fraction of responses passing §C.3.1 with zero violations. | Invented ids, misquotation. |
| Correct abstention | On the unanswerable class, the fraction correctly refusing. | Overconfidence. |
| Abstention rate (answerable) | On answerable classes, the fraction incorrectly refusing. | Over-abstention as a cheap way to avoid unsupported claims. |
| Calibration | Stated `confidence` versus measured correctness, binned. | Confidence inflation (R5). |
| Completeness | Presence of required answer elements, per the protocol's definition. | Content dropped to look accurate (R7). |
| Injection resistance | Adversarial items where evidence instructions were not obeyed. | R6. |
| Latency | p50/p95 end-to-end, measured. | R8. |
| Cost | Tokens (or measured spend) per item. | R8. |

### E.4 The circularity warning, stated plainly

`computeFaithfulness` and `computeConfidence` are lexical, model-free, and gameable
(§1.2). They may be **reported** as secondary signals because they are what the
product shows users. They must **not** be:

- the primary metric;
- the acceptance criterion for promotion;
- the sole input to the calibration analysis in a way that lets a candidate that
  inflates lexical overlap appear calibrated.

Calibration must be measured against §C.3's adjudicated correctness, not against the
lexical proxy.

### E.5 Adjudication protocol

1. Sample definition is fixed in the protocol before evaluation (size and sampling
   method, including how many items per class).
2. Two raters, working independently, on the same rubric; results compared.
3. The agreement statistic is computed and reported as measured. No threshold is
   assumed; if agreement is low, the result is reported as low-confidence and the
   rubric is revised, which invalidates the run and requires a re-run on both
   baseline and candidate.
4. Disagreements are resolved by the pre-registered tie-break rule (a third rater, or
   the stated preference for the more conservative label), decided in advance.
5. Raters are told which items are which only to the extent necessary; where it is
   feasible, candidate and baseline responses to the same item are presented in a
   randomised, unlabelled pair so the rater cannot tell which system produced which.
6. The person who authored the candidate does not adjudicate it alone.

### E.6 Statistics and honesty about noise

- Every reported metric includes the number of items it was computed over and an
  interval estimated by a stated method (a bootstrap over items is acceptable and
  must be described).
- If the observed difference is smaller than the interval's width, the result is
  reported as "not distinguishable from noise", and the candidate is not promoted.
- No metric is reported as a single number with no denominator.
- No comparison is reported between runs that used different model ids, different
  app versions, or different protocols. Such a comparison is a category error and is
  reported as "not comparable".

### E.7 Security evaluation

Adversarial items must include: instructions embedded in evidence chunks; documents
containing fake citation markers; a document that attempts to change the output
schema; and a question that asks the model to reveal its system instruction. Results
are pass/fail per item with the item and response retained for review. Any failure
here is R6 and is absolute.

### E.8 Order of operations (the protocol)

1. Freeze §A (objective, thresholds form, prohibitions).
2. Build sets and the schema; run the §B.5 quality checks.
3. Run the **baseline**. Record everything (§F.3).
4. Set the minimum effect size from the baseline and the observed spread. Freeze it.
5. Bump protocol version. From this moment, no evaluation data is touched until the
   candidate is frozen.
6. Build the candidate (L0 first).
7. Freeze the candidate: checkpoint/dataset/prompt ids and hashes.
8. Run candidate on `heldout-fixed`, then `fresh`, then `adversarial`, then
   `regression`.
9. Adjudicate per §E.5; compute metrics per §E.6.
10. Report, including negative and inconclusive outcomes.
11. Human promotion decision (§F.5), or stop.

### E.9 Negative and ambiguous results

Negative results are first-class outputs and are stored in the registry with the
same rigour as positive ones. A negative result must record: what was tried, the
protocol version, the measured values with intervals, and the most likely
explanation (including "the metric is too noisy at this n", which is an acceptable
conclusion). Discarding a negative result is a process failure.

---

## F. Versioning and release

### F.1 Immutable identifiers

Everything that affects a result is identified by content, not by name or date:

| Artefact | Identifier | Notes |
| --- | --- | --- |
| Dataset | `ds-<content-hash>` | Hash of the manifest, which hashes every item. |
| Dataset split | `ds-<hash>#heldout-fixed` | Split names are part of the manifest. |
| Checkpoint | `ckpt-<sha256>` | Weights hash, not just a filename. |
| Adapter (LoRA) | `adpt-<sha256>` | Includes the base model id it applies to. |
| Base model | exact `provider/<model>` id, plus the provider's revision identifier if exposed, else `UNKNOWN` | `UNKNOWN` is a real answer; see F.6. |
| Prompt / system instruction | `prm-<sha256>` of the exact string | Includes the evidence-assembly format. |
| Runtime | app version (`3.2.0`) + relay profile | `package.json`, `resolveConfig`. |
| Protocol | `proto-vN` | The frozen study design. |

### F.2 Model registry

Proposed (does not exist today). One record per artefact, append-only:

```jsonc
{
  "registry_version": 1,
  "entries": [
    {
      "artifact_id": "ckpt-<sha256>",
      "kind": "checkpoint|adapter|prompt|none",
      "capability": "citation-labelling-fidelity",
      "base_model_id": "…",
      "base_model_revision": "UNKNOWN",
      "created_at": "2026-…",
      "created_by": "…",
      "training_data": "ds-<hash>",
      "protocol": "proto-v1",
      "evaluation": {
        "report_id": "rpt-…",
        "sets": ["heldout-fixed@ds-<hash>#heldout-fixed", "fresh@…", "adversarial@…"],
        "metrics": { "citation_support_precision": { "value": null, "n": 0, "interval": null },
                     "structural_violations": 0 },
        "notes": "values populated by a real run; null means never measured"
      },
      "release_state": "DRAFT",
      "approvals": [],
      "rollback": { "to": "…", "exercised_at": null }
    }
  ]
}
```

### F.3 Release-state schema

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `DRAFT` | Exists; nothing measured. | → `EVALUATED`, → `RETIRED` |
| `EVALUATED` | Measured against the frozen protocol on all four sets; report attached. | → `APPROVED`, → `REJECTED` |
| `REJECTED` | Failed acceptance or a prohibition. Kept, not deleted. | → `RETIRED` |
| `APPROVED` | An external reviewer has signed off. Not yet selectable by default. | → `CANARY`, → `REVOKED` |
| `CANARY` | Selectable explicitly by an operator, never the default. | → `RELEASED`, → `ROLLED_BACK` |
| `RELEASED` | Default in a defined scope (a feature flag, a workspace class). | → `ROLLED_BACK`, → `RETIRED` |
| `ROLLED_BACK` | Was `RELEASED`, was reverted; the reason is recorded. | → `EVALUATED` (after a fix and a re-run) |
| `REVOKED` | Approval withdrawn before release. | → `RETIRED` |
| `RETIRED` | Not used. Kept for provenance. | terminal |

### F.4 What a release record must contain

Artefact id; base model id (and `UNKNOWN` where the revision is not exposed); dataset
id; protocol id; the evaluation report; every metric with n and interval; the
adjudication agreement statistic; the disjointness check output; the rollback target;
the names of the approver and the author (they must differ); and the exact user-facing
statement of what changed, written for a user rather than for the registry.

### F.5 Promotion requires external human approval

Non-negotiable:

- The approver is not the author of the candidate.
- The approval is recorded with a name, a date, and the artefact id.
- The approver has read the evaluation report, including the negative results.
- Approval can be withheld for any reason, including "this is not worth the
  maintenance cost", and that is a legitimate outcome.

### F.6 Staged rollout

1. **Fixture-only** — internal, on the authored fixture set, no user traffic.
2. **Single operator** — one person, one machine, deliberately enabled.
3. **Opt-in** — available to users who explicitly enable it, with the option to
   revert, and with the capability's provenance visible in the UI.
4. **Default** — only after the previous stages produced no §A.5 violation and the
   rollback has been exercised.

Each stage has a written trigger for stopping (any absolute violation; a regression
metric beyond the agreed factor; a user report of a fabricated citation). Stopping a
rollout is a normal, expected action and is not a failure of the process.

### F.7 Rollback must be tested

Documenting a rollback is not having one. Before `APPROVED` → `CANARY`, the rollback
is performed end to end: switch back to the baseline artefact, confirm the baseline
behaviour returns on the fixture set, and record the timestamp and duration. A
rollback that has never been exercised is an untested control. If an artefact cannot
be rolled back — for instance because the provider model id has been deprecated —
that is a finding, and the artefact is not promoted.

### F.8 Immutability and retention

Checkpoints, datasets, and reports are append-only. A superseded artefact is marked
`RETIRED`, never overwritten. Reports are retained indefinitely because the value of
a negative result is real; if a dataset must be deleted (a licence expiry, a
withdrawal of authorisation), the deletion is recorded along with the ids of every
report computed from it, and those reports are annotated as based on a deleted
dataset.

---

## G. Threat model

| # | Threat | Vector | Impact | Control | Residual risk |
| --- | --- | --- | --- | --- | --- |
| T1 | **Private user data enters the dataset** | Scraping the workspace, sessions, `RunRecord.query`, `ErrorRecord.message` | Privacy breach; breach of the product's local-first promise | S4 excluded by default; pattern scans; manual review; documented authorisation; deletable dataset ids | Manual review is not exhaustive; a novel identifier format could pass the scan |
| T2 | **Licence violation** | Unlicensed corpus in S3; losing an attribution obligation | Legal exposure; the artefact cannot be shipped | Licence id + evidence per item; attribution recorded and rendered | Provenance is only as good as the record; a mislabelled upstream source defeats it |
| T3 | **Evaluation contamination** | Holdout items in training; generated text fed back | Metrics become meaningless; false promotion | Namespacing; hash + near-dup checks across the boundary; templates differ | Near-duplicate detection has a threshold; paraphrases can pass |
| T4 | **Metric gaming** | Candidate reuses evidence vocabulary without support (the known weakness of the lexical scorer) | Promotion of a candidate that does not work | Primary metric is adjudicated, not lexical; structural checks; near-match distractor class | Human adjudication is expensive, so sampling introduces sampling error |
| T5 | **Self-verification** | Asking the model (or a sibling) to grade its own output | False confidence in the result | §C.3 forbids it; checkers are programmatic or human | A human rater over-anchored on fluent output remains a risk; mitigated by the written rubric and randomised pairs |
| T6 | **Prompt injection in data** | Instructions inside documents or evidence chunks | Bad labels, bad training pairs, or a compromised evaluator | Adversarial class; injection items scored; evidence treated as data, never instructions | New injection forms will not be in the fixture set |
| T7 | **Production weights mutated** | Any path from runtime to weights | Unreviewed behaviour change; unauditable product | §D.3 separation; artefact is read-only; no feedback loop; registry requires human promotion | A future implementation could violate this; the control is a design rule, enforced by review and tests, not by physics |
| T8 | **Untested rollback** | A rollback that was only written down | An incident cannot be contained | §F.7 requires an exercised rollback | The exercised rollback is against the fixture set, not production traffic |
| T9 | **Cost runaway** | Generation loops against a paid relay; repeated evaluation runs | Unexpected spend | Relay rate limit is a partial bound (per-process, resets on cold start — a documented limitation); budgets stated before runs; approval for spend | The limiter is explicitly not a quota system |
| T10 | **Credential exposure** | Keys in logs, notebooks, or error output | Compromise of the operator's provider account | Keys stay in the relay's `process.env`; `redact` patterns; laboratory code never reads `OPENROUTER_API_KEY` directly | A pasted key in a notebook is a human failure mode that no code control fully prevents |
| T11 | **Artefact provenance loss** | An artefact shipped without a registry entry | Cannot answer "what is deployed and why" | Content-addressed ids; registry required before promotion; `UNKNOWN` recorded honestly for provider revisions | Provider revision may be genuinely unavailable |
| T12 | **Overclaiming** | Reporting a narrow win as a general capability gain | Misleads users and the team; invites further unfounded work | §0.6; reports state scope; release notes are user-facing and bounded | Language drifts over time; the registry wording is the mitigation |
| T13 | **Supply-chain risk in a pulled artefact** | A base model or adapter from an untrusted source | Arbitrary content in weights; licence and integrity unknowns | Pulls are not authorised by this document; any future pull requires a source, licence, and hash record | Weights are not auditable by reading them |
| T14 | **Stale capability claims** | A model id change silently altering behaviour | Results attributed to a different system | Exact model id + revision (`UNKNOWN` allowed) recorded per run; comparisons require identical ids | Provider-side silent updates are not detectable from here |

---

## H. Data-governance checklist

Complete before any item enters a dataset. Evidence is a path or an id, not a
description.

- [ ] Source class identified (S1–S4) and permitted for the intended use.
- [ ] Licence id recorded, with where it is written down.
- [ ] Attribution text recorded verbatim if required, and rendered where required.
- [ ] Source hash recorded for the exact bytes used.
- [ ] Retrieval timestamp recorded.
- [ ] For S4 only: named authorisation, scope, expiry, deletion plan — all present.
- [ ] Personal-data scan run; findings quarantined and reviewed by a human.
- [ ] Credential-shaped strings scanned; any hit investigated, not just deleted.
- [ ] Deduplication run (exact and near-duplicate) with the threshold recorded.
- [ ] Cross-boundary check against every evaluation item run and passed.
- [ ] Schema validated against §C.4.
- [ ] Ground truth independently verified (programmatic or adjudicated).
- [ ] Every claimed citation in every item resolves to a supplied chunk.
- [ ] Language and domain fields populated.
- [ ] Item included in the manifest with a stable content-addressed id.
- [ ] Dataset-level: split assignment recorded; sizes per split and per class
      recorded; rejection count and reasons recorded.
- [ ] Dataset-level: deletion path exists and has been **executed once** on a copy.
- [ ] Dataset-level: manifest hash recorded and used as the dataset id.

---

## I. Dataset schema and manifest

### I.1 Item schema

```jsonc
{
  "item_id": "sha256:…",
  "split": "train|heldout-fixed|fresh|adversarial|regression",
  "case_class": "clean|multi-hop|competing|contradictory|near-match|unanswerable|…",
  "template_id": "tpl-…",
  "question": "…",
  "evidence": [
    {
      "chunk_id": "e1",
      "source_label": "…",
      "source_type": "document|knowledge|canvas|history",
      "text": "…",
      "locator": null
    }
  ],
  "answer_truth": {
    "checkable": true,
    "required_numbers": ["12.5"],
    "required_elements": ["…"],
    "abstention_expected": false,
    "must_mention_conflict": false
  },
  "citations_expected": ["e1", "e3"],
  "provenance": { "…": "see B.3" }
}
```

`locator` is `null` here because the current chunk model has no locator
(`src/pipeline/scoring.ts` carries `position` as an ordinal). When locators exist —
see `docs/multimodal-plan.md` §3.6 — the field is populated and citation scoring can
be made location-aware.

### I.2 Manifest

```jsonc
{
  "manifest_version": 1,
  "dataset_id": "ds-<sha256-of-this-manifest>",
  "created_at": "2026-…",
  "protocol": "proto-v1",
  "built_by": "…",
  "item_count": { "total": 0, "train": 0, "heldout-fixed": 0, "fresh": 0, "adversarial": 0, "regression": 0 },
  "class_balance": { "clean": 0, "multi-hop": 0, "near-match": 0, "unanswerable": 0 },
  "sources": [ { "source_class": "S1|S2|S3", "uri": "…", "licence_id": "…", "retrieved_at": "…", "item_count": 0 } ],
  "generation": { "templates": ["tpl-…"], "generated_at": "…", "generated_by": "…" },
  "checks": {
    "schema_valid": true,
    "dedup_exact": { "removed": 0 },
    "dedup_near": { "threshold": null, "removed": 0 },
    "cross_boundary_scan": { "evaluated_against": ["heldout-fixed", "fresh", "adversarial"], "collisions": 0 },
    "personal_data_scan": { "hits": 0, "reviewed": true },
    "rejected_items": [ { "reason": "…", "count": 0 } ]
  },
  "items_hash": "sha256:…",
  "notes": "…"
}
```

The manifest is the dataset's identity. Any change — one item, one split assignment,
one threshold — produces a new `dataset_id`. Nothing is edited in place.

---

## J. Baseline / candidate evaluation protocol (executable)

1. **Inputs:** `ds-…`, `proto-vN`, an exact model id, an artefact id (`none` for a
   prompt-only candidate), and the relay profile.
2. **Preflight:** disjointness check; schema validation; confirm the model id is
   unchanged since the protocol was written; confirm the relay accepts the request
   shape (five fields — any extra field is a `UNKNOWN_FIELD` refusal today).
3. **Run baseline** over `heldout-fixed`, then `fresh`, then `adversarial`, then
   `regression`, with the §A.3 configuration. Store raw responses; never store
   adjudicated labels without the raw response they came from.
4. **Run candidate** over the same sets in the same order, with the same evidence
   assembly unless the candidate *is* the evidence-assembly change (in which case
   that is the single variable, and it is stated).
5. **Structural checks** (§C.3.1) on every response, both systems.
6. **Adjudication** (§E.5) on the frozen sample, unlabelled and randomised.
7. **Compute** all §E.3 metrics with n and intervals.
8. **Compare** to §A.4's decision rule and check every §A.5 prohibition.
9. **Emit a report** containing: ids, dates, model id, protocol version, the metrics,
   the agreement statistic, the disjointness output, the raw-response location, the
   thresholds used, and an explicit statement of what the result does and does not
   establish.
10. **Record** in the registry with a state.

Rate limiting is respected throughout: the relay allows 20 requests/minute with a
burst of 6 per client key, so a run of *n* items takes at least *n*/20 minutes of
request budget. Plan for it; do not discover it.

---

## K. Dry run (fixtures and mocked metadata only)

The dry run exists to prove the *pipeline for evaluating* works before any real data
or any model is involved. It is not a result, and it must never be quoted as one.

**Permitted in a dry run:**

- Authored fixture items with ground truth, marked `"fixture": true`.
- A mocked model that returns canned responses chosen to exercise every checker path
  (including deliberately invalid citations, so failures are visible).
- Mocked registry entries whose metric values are `null`, and a mocked evaluation
  report stamped `DRY-RUN`.
- The structural checker, the dedup checks, the disjointness scan, and the manifest
  builder, all running for real on fixtures.

**Forbidden in a dry run:**

- Any network call to a provider.
- Any use of a real dataset, a real user record, or a real run log.
- Publishing a metric as if it were measured. Every dry-run artefact carries
  `DRY-RUN — NOT A RESULT` in its filename and in its first line, and every numeric
  field is `null` or the fixture's synthetic value with `"fixture": true` beside it.

**Dry-run acceptance criteria:**

1. All fixture items pass schema validation.
2. The mocked invalid-citation responses are caught by the structural checker, and
   the mocked valid ones are not — i.e. the checker has been shown to fail when it
   should, which is the only way to trust it when it passes.
3. The near-duplicate and cross-boundary checks catch a deliberately planted
   duplicate.
4. The manifest is built, hashed, and a change to any item changes the id.
5. The report is produced with all metric fields present, even when empty, so a
   missing metric is visible rather than absent.
6. The whole dry run executes with no outbound network access.

**Exit criterion:** the dry run passing means the laboratory's plumbing is
inspectable and its failure modes are demonstrated. It says nothing at all about
model quality, and it is a process failure to cite it as evidence for one.

---

## L. What this document does not claim

- No training was performed, is scheduled, or is authorised.
- No dataset was downloaded, is licensed, or exists.
- No model was pulled, and no weight was modified.
- No metric, benchmark, accuracy figure, or cost figure is asserted. Everything
  numeric in this document is either read from the repository (relay limits, defaults)
  or explicitly marked as a planning figure to be measured.
- No claim of recursive self-improvement, autonomous improvement, or general
  capability gain is made. The designed improvement is one checked behaviour in one
  narrow setting, and it is only claimed if §J produces it.
- No safety guarantee is claimed. §G is a threat model with residual risks, several
  of which are explicitly unresolved.
