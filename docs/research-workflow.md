# Research Workflow

**Document status:** design and procedure. This document defines a workflow; it does
not add capabilities to the application and does not authorise any implementation.
**Scope:** Mission 16 — a reproducible, domain-bounded research workflow with
provenance and honest uncertainty.

---

## 0. Scope, and what is not claimed

### 0.1 What this document is

A procedure a person follows, supported by the parts of BlackLetter that actually
exist, with an explicit record of what the machine did and what a human decided.

### 0.2 What is out of scope, stated plainly

- **A universal research agent is out of scope.** There is no design here for a
  system that takes any question in any domain and produces research.
- **No scientific-discovery capability is claimed.** The application does not
  discover facts, does not run experiments, does not access external literature, and
  does not validate results against reality. It assembles text into structured
  reports over evidence the user supplied.
- **No autonomy is claimed.** Every stage below has a human owner. The machine
  assists within stages; it does not decide whether a stage's output is acceptable.
- **No statistical machinery is claimed.** `computeConfidence`, as implemented, is a
  lexical heuristic, not a statistical inference, and must not be presented as one.
- **No external evidence acquisition is claimed.** See §1.3: the retrieval corpus is
  built from the user's own material.

### 0.3 Why the workflow is bounded by domain

The application already models domains: `src/engine/profiles/registry.ts` registers
twelve profiles — computer science, artificial intelligence, mathematics, law,
business, finance, economics, history, engineering, general science, writing, and
general knowledge. A domain is not decoration here; it determines what counts as
evidence, what a mistake costs, and who must review a conclusion. Stage 10 exists
because those three things differ per domain and cannot be averaged.

---

## 1. Relationship to the existing system

### 1.1 What a run actually is

`runPipeline` (`src/langgraph/index.ts`) executes the graph defined in
`src/langgraph/graph.ts`:

```
UserInputNode → IntentNode → SubjectNode → RouterNode → DocumentNode →
LearningProfileNode → KnowledgeGapNode → RetrievalNode → PromptBuilderNode →
LLMNode → QualityNode → EvaluationNode → FormatterNode → ReportNode
```

Each node records a stage in a `Trace` (`src/pipeline/trace.ts`) with a status of
`running`, `success`, `skipped`, or `error`, and a duration. `EvaluationNode`
assembles `PipelineTelemetry`. `runPipeline` writes a `RunRecord` into the local
observability store (`src/observability/metrics.ts`), capped at 1200 runs.

This means the machine already produces a per-run record of *what it did*. What it
does **not** produce is a record of *what the researcher meant*: the hypothesis, the
scope, the acceptance criteria, the assumptions, the parameter sources. Those are
the human columns of every stage below, and they are the reason this workflow is a
document rather than a feature request.

### 1.2 The evidence surfaces that exist today

| Surface | Where | What it means | Honest caveat |
| --- | --- | --- | --- |
| `retrievedChunks` | `src/pipeline/scoring.ts`, `RetrievalNode.ts` | Chunks selected from the corpus, each with a lexical score and a `source` label | `position` is an ordinal; there is no page number, offset, or hash |
| `groundedSources` | `scoring.ts` (`groundedSources`, threshold 0.22) | Sources with at least one chunk above the threshold | The threshold is a hand-tuned constant, not a calibrated one |
| `faithfulness` | `scoring.ts` (`computeFaithfulness`) | Fraction of answer sentences whose tokens largely appear in the corpus | Token containment; a sentence can invert its source's meaning and still score as supported |
| `hallucination` | `scoring.ts` (`detectHallucination`) | Unsupported sentences that also contain multiple numbers or a named entity | A flag, not a verdict |
| `confidence` | `scoring.ts` (`computeConfidence`) | 0–100, weighted lexical composite, clamped 5–98 | Not calibrated against correctness anywhere in this repository |
| `qualityScores` | `QualityNode.ts` | Five format and structure heuristics, 0.5 pass threshold | Formatting proxies; they do not measure truth |
| `PipelineTelemetry` | `trace.ts` | Timings, token estimates, counts, error code | `estimateTokens` is `ceil(chars/4)`, an estimate |
| `RunRecord` | `observability/metrics.ts` | Per-run history, per-model latency and p95 | Local only; `query` is truncated to 200 characters |

### 1.3 The retrieval corpus is local, and that bounds every claim

`RetrievalNode.buildCorpus` assembles candidates from exactly four places:
`state.documentText` (uploaded documents), `state.knowledgeContext` (the knowledge
graph), `state.canvasContext` (canvas blocks), and the last assistant message in the
session history. There is no web search, no literature database, no external API.

Consequences that must be stated in any report produced under this workflow:

- "The system found no evidence of X" is meaningless — it can only mean "nothing in
  the supplied material supports X".
- A literature review is a review of what the user supplied, never of "the
  literature".
- Absence of grounding is not evidence of absence.

### 1.4 Document extraction limits what evidence can exist

As recorded in `docs/multimodal-plan.md` §1.4, extraction covers `.txt`, `.md`,
`.pdf`, and `.docx`, and the PDF path is byte and regex based with no stream
decompression, so many real PDFs yield little or nothing. `RetrievalNode.splitDocText`
re-parses the `--- <filename> ---` separators that extraction emits, so a document
that failed to extract contributes no catchable error at retrieval time, only
silence. Stage 2 and Stage 8 both require recording what was ingested and what was
not — a silently empty PDF is a missing input, not a finding.

---

## 2. The ten stages

Each stage has: purpose, required inputs, required artefacts, an entry condition, an
exit condition, the machine support that exists today, the part that is irreducibly
human, and the failure modes to watch for. Stage artefact names ending in
`.research.md` or held under a proposed `docs/research/` path **do not exist today**;
they are the filed record this workflow requires, and creating anywhere to put them
is an implementation decision this document does not make.

---

### Stage 1 — Question, hypothesis, measurable objective, scope

**Purpose.** Convert an interest into something that could be shown to be wrong.

**Required inputs.** A domain (one of the twelve profiles, or `general-knowledge`).
A first draft of the question. Any prior belief the researcher holds, written down.

**Required artefacts.**

| Artefact | Contents |
| --- | --- |
| `question` | One sentence, interrogative, no stacked clauses. |
| `hypothesis` | One sentence, falsifiable, with a stated direction ("X increases Y" — not "X affects Y"). |
| `objective` | What will be measured, with units, and over what population or material. |
| `scope_in` / `scope_out` | Explicit. The `scope_out` list is the more useful of the two. |
| `falsifier` | The observation that would refute the hypothesis. If none can be written, the hypothesis is not yet a hypothesis. |
| `stop_rule` | The condition under which the work stops without an answer. |
| `prior_belief` | The researcher's expectation, recorded before any evidence is read, so it is visible later. |

**Entry condition.** None; this is the start.

**Exit condition.** The falsifier is written and is checkable with available means.

**Machine support today.** `IntentNode` and `SubjectNode` classify the message and
detect a subject; `RouterNode` routes. These help phrase a question; they do not
validate one.

**Human-only.** Whether the hypothesis is worth testing, and whether the falsifier is
actually observable.

**Failure modes.** Unfalsifiable hypotheses ("X is complex"). Objectives with no unit
("improve performance"). Scope creep hidden in an adjective ("general", "all",
"modern"). A hypothesis written after reading the evidence — the `prior_belief` field
exists specifically to make this visible.

---

### Stage 2 — Literature and evidence review, with provenance

**Purpose.** Establish what is already known, from sources that can be named.

**Required inputs.** The Stage 1 artefacts.

**Required artefacts.** For every source, verbatim and complete:

| Field | Notes |
| --- | --- |
| `title`, `author(s)`, `year` | As published. |
| `identifier` | DOI, ISBN, URL, or "institutional file — internal id". Never a paraphrase of an identifier. |
| `retrieved_at` | ISO date. |
| `accessed_via` | Where it came from. |
| `hash` | sha-256 of the exact bytes ingested, where the source is a file. |
| `claim_extracted` | The specific statement taken from it — not a summary of the whole source. |
| `locator` | Page, section, table, or timestamp. If unknown, say `unknown` — do not omit. |
| `extraction_method` | How the text was obtained (typed by hand, extracted by the app, OCR, etc.). |
| `extraction_limits` | What the extraction could have lost (the PDF path in §1.4 loses a great deal). |

**Entry condition.** Stage 1 exit met.

**Exit condition.** Every claim in the review carries a locator, and every source is
identifiable by a third party.

**Machine support today.** Ingestion into the document/knowledge pipeline, with the
`retrievedChunks` and `groundedSources` surfaces providing a lexical relevance
signal. **There is no external literature retrieval** (§1.3).

**Human-only.** Judging relevance, quality, and whether a source is worth citing at
all.

**Failure modes.** Citation laundering — citing a source that cites the actual
source. Locator drift (a claim attributed to a page that does not contain it).
Unrecorded extraction loss. Treating "not found in the supplied corpus" as "does not
exist". Mixing the researcher's inference into the source's claim during note-taking:
the `claim_extracted` field must be distinguishable from commentary, and the two must
not share a field.

---

### Stage 3 — Gaps, alternative explanations, confounders, uncertainty

**Purpose.** State what is not known, what else could explain an observation, and
what could corrupt a result.

**Required artefacts.**

| Artefact | Contents |
| --- | --- |
| `gaps` | What the evidence does not cover, expressed as questions. |
| `alternatives` | At least two competing explanations for each anticipated observation. |
| `confounders` | Named variables that could produce the same observation, with the direction of the effect. |
| `mechanism` | The proposed causal path, stated as a chain, so a broken link is locatable. |
| `uncertainty_kinds` | Separately: measurement uncertainty, sampling uncertainty, model/structural uncertainty, and ignorance (things not considered). The last is the one that cannot be quantified, and pretending otherwise is a failure. |

**Exit condition.** Every anticipated observation has at least one competing
explanation that would look identical in the data.

**Machine support today.** `KnowledgeGapNode` derives prerequisites and missing
prerequisites from the subject and holds a directive; it is a teaching aid, not a
scientific gap analysis, and must not be reported as one.

**Failure modes.** A single-hypothesis design. "Confounder" used as a synonym for
"limitation". Ignorance folded into a number.

---

### Stage 4 — Experiment, simulation, or statistical design

**Purpose.** Specify the procedure before running it.

**Required artefacts.** Design type and why; independent and dependent variables with
units; controls; blinding where applicable; sample size and its justification;
randomisation or sampling method; preprocessing steps in order; the exact method of
analysis, including every statistical test named in advance; the assumptions each
test requires and how they will be checked; and — for a simulation — the model
specification, parameter table with sources, initial conditions, numerical scheme,
step size, and stopping criterion.

**Entry condition.** Stage 3 exit met.

**Exit condition.** A second competent person could execute the design without asking
the author a question. That is the test, and it is a person, not a checklist.

**Machine support today.** None for execution. There is no code execution
environment, no numerical runtime, and no simulation harness in this repository;
`src/engine` and `src/architect` are text-generation profiles and planning helpers,
not numerical tools. Where a simulation is run, it is run elsewhere, and Stage 6's
provenance requirements apply to it.

**Human-only.** The design itself, and the sample-size justification.

**Failure modes.** Analysis chosen after seeing the data. Sample size set by
convenience and justified afterwards. A simulation specified at a level of detail
that cannot be reproduced. A control that differs from the treatment in more than one
way.

---

### Stage 5 — Predefined metrics, controls, baselines, acceptance criteria

**Purpose.** Fix, in writing and in advance, what would count as a result.

**Required artefacts.**

| Artefact | Rule |
| --- | --- |
| Primary metric | One. With units. With the aggregation rule (mean, median, rate) stated. |
| Secondary metrics | Declared as secondary, and declared as reported-regardless. |
| Controls | Named, including the negative control. |
| Baselines | Measured, not remembered. Where the baseline does not exist yet, running it is Stage 6 work. |
| Acceptance criteria | The threshold and the interval method. |
| Minimum meaningful effect | The smallest difference that would change a decision. |
| Stopping rules | Both for success and for futility. |
| What would falsify | Restated from Stage 1, and consistent with it. |

**Exit condition.** Every metric has units, a denominator stated, and an aggregation
rule. A metric without a denominator is not a metric.

**Machine support today.** `QualityNode` produces five format heuristics and
`EvaluationNode` produces the lexical signals in §1.2. Both may be *reported*. Neither
is an acceptance criterion, because both are proxies the researcher would be
optimising against while claiming not to (§2, Stage 5's own failure mode).

**Failure modes.** Moving the threshold after measurement. Reporting only the
secondary metric that improved. Using the shipped `confidence` score as the primary
metric despite it being uncalibrated. Defining acceptance criteria after the pilot
run — a pilot is permitted, but it must be declared as a pilot and its data must not
enter the result.

---

### Stage 6 — Execution in an approved, resource-limited environment

**Purpose.** Run the design inside declared limits, and know what those limits were
afterwards.

**Required artefacts.**

| Field | Notes |
| --- | --- |
| Environment | Machine class, OS, runtime versions. |
| Data | Exact inputs, with hashes. |
| Code | Version identifiers. This repository is not a git checkout, so a version must be recorded some other way — app version from `package.json`, plus hashes of any script used. |
| Model | Exact `provider/model` id as sent to the relay, plus temperature and max tokens actually used. Defaults today are `0.7` and `4096` (`src/langgraph/state.ts`) when not overridden. |
| Relay profile | `hosted` or `local`, and the credential-holding relay actually used. |
| Resource limits | Maximum wall clock, maximum spend, maximum number of calls, maximum data volume. Declared before the run. |
| Progress log | Append-only, with timestamps. |

**Entry condition.** Stage 5 exit met, and an explicit approval of the resource limits
from whoever owns the cost.

**Exit condition.** A complete run log, including any deviation from the design.

**Resource reality to respect.** The relay enforces a 20-requests/minute, burst-6
token bucket per client key and a 55 s request timeout (`RELAY_LIMITS` in
`src/server/relay-guard.mjs`), and its own header documents that the limiter is
in-process, per-instance, and resets on cold start — it is a cost bound, not a quota
system. A run of *n* model calls therefore takes at least *n*/20 minutes of request
budget, and that must be planned, not discovered. A 256 KB request-body cap and
120,000-character prompt cap also bound what can be sent in one call.

**Failure modes.** Running without a declared limit. Changing the design mid-run and
still reporting the run as conforming (permitted only as an amended design with the
deviation logged and both versions reported). Silence when a step fails — the run log
records failures, and a failed run is not an absent run.

---

### Stage 7 — Validation against known results or independent evidence

**Purpose.** Establish that the machinery works before trusting its output.

**Required artefacts.**

| Validation | Requirement |
| --- | --- |
| Known-answer check | A case where the correct answer is already known, run through the same procedure. If the procedure cannot recover a known answer, it cannot be trusted on an unknown one. |
| Reproduction | A published or independently obtained result, reproduced within stated tolerance, or the reason it could not be. |
| Internal consistency | Independent derivations of the same quantity agreeing, or the disagreement explained. |
| Boundary check | Behaviour at the limits of the design (empty input, all-one-class, extreme values). |
| Independent check | A person or source not involved in producing the result, where the stakes warrant it. |

**Exit condition.** The known-answer check passes, or its failure is explained and the
explanation is itself recorded.

**Machine support today.** None for numerical validation. The `EvaluationNode` and
`scoring.ts` checks validate *text against supplied text*, not results against
reality.

**Failure modes.** Skipping the known-answer check because the procedure "obviously"
works. Validating against data derived from the same source as the result (circularity
— this is the same error that §1.2 warns about when a lexical metric grades a model
optimised for lexical overlap). Treating reproducibility of the code as validation of
the result.

---

### Stage 8 — Assumptions, input data, parameter sources, versions, sensitivity, limitations

**Purpose.** Record everything a later reader needs in order to disagree with the
conclusion.

**Required artefacts.** A single register containing: every assumption, with whether
it is testable; every input with its hash and locator; every parameter with its source
(literature reference, measurement, or "assumed — no source"); every version
(app version, model id, prompt hash, script hashes); the sensitivity analysis results;
and a limitations section written as negatives ("this does not establish X"), not as
hedges.

**Sensitivity is not optional, and it has a shape.** For each parameter that was
assumed rather than measured: vary it across a stated plausible range, report whether
the conclusion changes, and identify the parameter at which the conclusion flips. If
no plausible range changes the conclusion, say so and say how wide the range was. A
conclusion that survives a one-percent perturbation and nothing wider has been
characterised, not validated.

**Machine support today.** `PipelineTelemetry` and `RunRecord` capture a subset —
timings, token estimates, the model id, counts. They do not capture assumptions,
parameter sources, or sensitivity. That work is manual, and the human columns are the
point of this stage.

**Failure modes.** Recording only the assumptions that turned out fine. A single-run
sensitivity analysis labelled as a range. Limitations written as "may not generalise",
which is true of everything and therefore informative about nothing.

---

### Stage 9 — Reproducibility, and reporting negative or ambiguous results

**Purpose.** Make the work re-runnable, and make failures part of the record.

**Required artefacts.**

| Field | Requirement |
| --- | --- |
| Reproduction instructions | Step by step, from a clean state, naming exact inputs and commands. |
| Expected output | The values a successful reproduction produces, with tolerance. |
| Known non-determinism | Where the same inputs may produce different outputs, and why. |
| Negative results | Reported with the same structure as positive ones: what was tried, the protocol, the measurement, the interval, and the likely reason. |
| Ambiguous results | Reported as ambiguous, with the competing readings named. |
| Retractions | If a reported result is later found wrong, the correction is recorded against the original report, not silently replaced. |

**Known non-determinism in this system, to be recorded rather than glossed over.**
Provider-served models may change between runs; the repository does not record a
provider revision identifier. Default temperature is 0.7, so identical prompts may
yield different answers. The relay's rate limiter is per-process and resets, so the
throughput characteristics of a long run are not repeatable. `estimateTokens` is a
character-based estimate, so token counts in the record are approximate. All of these
belong in the report.

**Failure modes.** A results section that contains only the runs that worked. "Not
statistically significant" reported without the interval that makes it meaningful.
Silent retractions.

---

### Stage 10 — Domain-specific review for high-stakes conclusions

**Purpose.** Route conclusions that can cause harm through a reviewer who is
qualified in the domain.

**Trigger — any of:**

- The conclusion could inform a decision about a person's liberty, health, finances,
  employment, or legal position.
- The conclusion is intended for publication, filing, or external distribution.
- The domain is one where an error has a cost that is not recoverable by the reader
  noticing it (law, finance, medicine, engineering safety, and any regulated area).
- The researcher cannot name a person competent to check it.

**Required artefacts.** A named reviewer who is not the author of the work; the
credentials or basis on which they are competent; a written review with its own
findings; any conditions attached; and an explicit statement of what the reviewer did
*not* check.

**If no reviewer is available, the correct output is a bounded claim.** The report
must state, in the summary: that the conclusion has not been reviewed, the domain it
belongs to, and that it must not be used for decisions in that domain. This is not a
disclaimer to be buried; it belongs where a reader who reads only the summary will
see it.

**Mapping to the existing profiles, and the review each requires:**

| Profile id (`src/engine/profiles/`) | Domain | Review posture |
| --- | --- | --- |
| `law` | Law | Mandatory qualified review before any conclusion is relied on. Jurisdiction must be named; a conclusion without a jurisdiction is not a legal conclusion. |
| `finance` | Finance | Mandatory review. Any figure must be reproducible from its inputs and dated; market data decays, so the date is part of the claim. |
| `mathematics` | Mathematics | Independent derivation of any claim that matters; a proof is either checked or it is a conjecture. |
| `engineering` | Engineering | Review by a competent engineer where a conclusion could inform a physical design; units checked explicitly. |
| `general-science` | General science | Review where the claim is causal or would be published; observational claims stated as observational. |
| `economics` | Economics | Review where a claim is presented as causal; correlational evidence labelled as such. |
| `history` | History | Review of source provenance; undated or unattributed claims flagged. |
| `computer-science`, `artificial-intelligence` | Computing | Peer review of method and measurements; benchmark claims require the harness to be reproducible. |
| `business` | Business | Review where a conclusion could inform an investment or a contractual decision. |
| `writing`, `general-knowledge` | Writing, general knowledge | Standard review; escalate if the content drifts into a high-stakes domain, which it can without the profile changing. |

**Failure modes.** Review by someone who shares the author's assumptions. Treating the
absence of a reviewer as a formality. A profile-appropriate-looking report that crosses
into a high-stakes domain without the profile changing — the trigger is the *content*
and the *use*, not the label.

---

## 3. Rules for simulations

These apply whenever a modelled outcome is produced, by any method, anywhere in the
workflow.

1. **Label it as a model.** Every simulated figure is labelled "modelled outcome under
   assumptions" with the assumptions named in the same block of text. A simulated
   number presented in a table beside measured numbers is a defect, even if the label
   appears elsewhere in the document.
2. **A precise number is not certainty.** More decimal places do not add knowledge. A
   simulation output is reported with the precision the inputs justify, never with the
   precision the software produces by default.
3. **State the assumptions as inputs.** Every parameter is one of: measured (with a
   source), taken from a named source (with a locator), or assumed (marked as assumed).
   There is no fourth category, and "standard practice" is not a source.
4. **Measure sensitivity, always.** Vary each assumed parameter across a stated
   plausible range and report whether the conclusion changes, and where it flips. If a
   range cannot be stated, that is the finding to report.
5. **Compare against observation where observation exists.** A simulation that has
   never been compared with reality is a hypothesis generator, and is described as
   one.
6. **Report calibration, not just fit.** Say what was compared, over what range, and
   where the model is known to perform badly. A model that fits the one case it was
   built from has been fitted, not validated.
7. **Report failure conditions explicitly.** The input regime where the model is not
   expected to hold, and what happens there.
8. **Never present a modelling artefact as a measurement.** Interpolation, extrapolation,
   smoothing, and imputation each change what the data says and each is stated.
9. **Version the model and its parameters** with the same rigour as code (Stage 8).
10. **A negative simulation result is a result** (Stage 9): "the model does not
    reproduce the observation" is reported.
11. **Do not use a language model as the simulation.** A text model's fluent narrative
    about a system is not a simulation of it. If a text model was used to *write* a
    report that contains simulated figures, the figures came from somewhere; that
    somewhere is cited, and the model is cited only as the writer.
12. **Bound the claim in the summary.** The summary states that the figures are
    modelled, in the summary itself, not in a footnote.

---

## 4. Rules for early-warning and monitoring

Applies to any use of the system to watch for a signal, a change, or an anomaly — in
a dataset, a document set, or a stream of incoming material.

### 4.1 Vocabulary that must be used consistently

| Term | Meaning |
| --- | --- |
| **No signal** | Nothing above the detection threshold. Not evidence that nothing happened. |
| **Weak signal** | Above the threshold, consistent with noise at the stated false-positive rate. Requires a second look, not an action. |
| **Candidate event** | Survives a second, independent observation. Still not a finding. |
| **Confirmed event** | Survives the review in 4.4 and a stated corroboration. |
| **Resolved / retracted** | Closed, with the reason recorded either way. |

Presenting a weak signal with the language of a confirmed event is a defect, and the
defect is in the *wording*, not in the numbers.

### 4.2 False positives and missed detections

- Both rates are stated for every detector, or the detector's output is labelled
  uncharacterised. A detector with no measured false-positive rate has an unknown one,
  and an unknown false-positive rate in a monitoring context produces alarm fatigue,
  which then produces missed detections — the second-order harm is worse than the
  first.
- Base rates matter and must be stated. A detector with a 1% false-positive rate run
  over a base rate of 1 true event per 10,000 observations will mostly produce false
  positives, and a report that omits the base rate is misleading regardless of its
  arithmetic.
- Thresholds are set before deployment, recorded with the data they were derived from,
  and changed only deliberately, with the change dated and the reason recorded.
- Detection performance is re-measured after any change to the input source, the
  pipeline, or the model, because all three can move it.

### 4.3 Drift

Monitor four kinds, and record which is which:

| Kind | Example here | Detection |
| --- | --- | --- |
| Input drift | Documents change in format, language, or length | Distributions of input characteristics, compared over time |
| Pipeline drift | Extraction behaviour changes after a code change | Re-run a fixed fixture set; compare outputs byte-wise |
| Model drift | A provider model's behaviour changes under a fixed prompt | Re-run a fixed prompt set on a schedule; compare outputs |
| Source drift | The upstream source changes its content or cadence | Source-specific checks, with the source's own version recorded |

Thresholds that were set for one distribution are not valid for another. A re-baseline
is a recorded event, not a quiet adjustment.

### 4.4 Human review, without exception

- An alert is a **request for review**, never a finding, and never an automatic
  action. No monitoring output in this system triggers an action on a person or a
  system.
- Every escalation to "confirmed" is made by a named human, who records what they
  checked.
- The reviewer is told the false-positive rate and the base rate at the moment of
  review. Reviewing an alert without them is guesswork with a number attached.
- Alerts that produce no action after review are recorded, so the detector's real
  precision is measurable over time rather than assumed from its design.
- Detectors that have not fired for a long period are re-checked against a known
  positive, because a detector that cannot fire is worse than no detector.

---

## 5. Domain-specific design and test plan template

**Complete this before any implementation begins.** A plan that cannot answer these
questions is not ready to be built, and the correct next step is to answer them, not
to start.

### 5.1 Identification

| Field | Value |
| --- | --- |
| Domain (profile id) | |
| Decision this informs | |
| Who consumes the output | |
| Date / author | |
| Reviewer (if required by Stage 10) | |

### 5.2 Consequence analysis

| Field | Value |
| --- | --- |
| What a wrong conclusion would cause | |
| Who would be harmed, and how | |
| Whether the error is detectable by the consumer | |
| Whether the error is recoverable | |
| Therefore: required review level (Stage 10) | |

### 5.3 Data and evidence

| Field | Value |
| --- | --- |
| Evidence sources, with identifiers and locators | |
| What was ingested and what failed to ingest | |
| Extraction methods and their known losses | |
| Known gaps in coverage | |
| Provenance completeness (Stage 2 table, fully populated) | |

### 5.4 Method

| Field | Value |
| --- | --- |
| Method, named | |
| Independent/dependent variables, with units | |
| Controls, including a negative control | |
| Baseline, measured where | |
| Sampling or selection rule | |
| Assumptions, each marked testable/untestable | |
| Parameter table, each row sourced | |

### 5.5 Acceptance and falsification

| Field | Value |
| --- | --- |
| Primary metric, with units and denominator | |
| Secondary metrics | |
| Minimum meaningful effect | |
| Acceptance threshold, fixed before execution | |
| Falsifier | |
| Stopping rules (success and futility) | |

### 5.6 Resource limits

| Field | Value |
| --- | --- |
| Wall-clock limit | |
| Model-call limit and spend limit | |
| Data-volume limit | |
| Approved by | |

### 5.7 Test plan

| Test | Expected | Tolerance | What it protects against |
| --- | --- | --- | --- |
| Known-answer case | | | Broken procedure |
| Boundary case(s) | | | Silent failure at limits |
| Negative control | | | Detecting effects that are not there |
| Reproduction of a known result | | | Methodological error |
| Sensitivity run(s) | | | Conclusions that depend on an assumption |
| Adversarial case (injection, malformed input) | | | Pipeline behaving as a text sink rather than an analyst |
| Regression case (behaviour that must not change) | | | Collateral damage |

### 5.8 Monitoring, if the plan includes it

| Field | Value |
| --- | --- |
| What is monitored | |
| Threshold, and its derivation | |
| Measured false-positive rate | |
| Base rate, and how it was estimated | |
| Drift checks and their cadence | |
| Who reviews, and by when | |
| What review may and may not trigger | |

### 5.9 Sign-off

| Field | Value |
| --- | --- |
| Author | |
| Reviewer, with basis of competence | |
| What the reviewer did not check | |
| Conditions attached | |
| Date | |

---

## 6. Provenance and uncertainty in the product's own record

This workflow's artefacts are human files. The product's own record is
`PipelineTelemetry`, `TraceStage`s, and `RunRecord`s. A report that cites a run should
state both, and should state the specific limits of the machine record:

| Question a reader may ask | Where the answer is | If it is not there |
| --- | --- | --- |
| Which model answered? | `RunRecord.model`, `PipelineTelemetry.model` | — |
| With which prompt? | Nowhere — the prompt is not persisted in the run record | Record the prompt hash manually (Stage 8) |
| At which temperature, max tokens? | Not in `RunRecord`; `GraphState.temperature`/`maxTokens` (defaults 0.7 / 4096) exist during the run | Record manually |
| Over which evidence? | `retrievedChunks` (chunk text, source label, ordinal position) on the run result | Record the source documents' hashes manually |
| Which sources were grounded? | `groundedSources` | — |
| How grounded was the answer? | `faithfulness`, `hallucination`, `confidence` | Report them as proxies, per §1.2 |
| How long did each stage take? | `TraceStage` durations, `PipelineTelemetry` | — |
| What failed? | `ErrorRecord` (message truncated to 400 chars in the record) | — |
| Was the answer correct? | Nowhere | This is the researcher's job, and it is why Stage 10 exists |

The last row is the one to keep in mind. Nothing in this repository determines whether
an answer is true. It measures how much of the answer's vocabulary appears in the
supplied text, how the answer is shaped, and how long the run took. Those are useful
signals, they are honestly labelled as signals, and a workflow that mistook them for a
verdict would be exactly the kind of thing this document exists to prevent.

---

## 7. Preconditions for following this workflow at all

1. The researcher can state what would falsify the claim.
2. The domain has been named, and the Stage 10 review requirement for that domain has
   been applied.
3. The evidence exists as files the app can ingest, and the ingestion has been checked
   rather than assumed — §1.4 means a silent extraction failure is a realistic outcome.
4. The resource limits have been declared and approved (§2, Stage 6).
5. The researcher understands that `confidence`, `faithfulness`, and `hallucination`
   are lexical proxies (§1.2) and cannot be used as acceptance criteria (§2, Stage 5).

If a precondition fails, the honest output is the precondition as the finding: "this
question cannot be answered with the material and methods available". That is a result,
and it belongs in Stage 9's record.

---

## 8. What this workflow does not claim

- No universal research capability, and no research agent.
- No scientific-discovery capability: the system does not formulate novel hypotheses
  from data, does not execute experiments, and does not validate against nature.
- No access to external literature (§1.3).
- No calibrated uncertainty: the shipped confidence score is a lexical composite with
  no evidence in this repository that it tracks correctness.
- No substitute for domain expertise, and no substitute for the review required in
  Stage 10.
- No improvement in the truth of an answer: the pipeline can make an answer better
  structured and better grounded in the supplied text. Whether it is true is a
  question about the world, and that question is answered by the researcher, with
  evidence, or not at all.
