# Integrity: validated output at one boundary

Mission 10 is about a single risk: a model answer being parsed straight into
structured state — sections, entities, timeline entries, notes, follow-ups,
knowledge-graph nodes, memory records — with no check that any of it is what it
claims to be. Before this mission there were five raw extractors and two call
sites, and whatever they returned was written to the store.

The mission's rule is that **model output becomes state in exactly one place**,
and that place treats the extractors' output as untrusted input.

```
answer text ──► src/integrity/derive.ts ──► validated records (provenance, support)
     │                    │
     │                    ├─► dropped / merged / capped records sound reported, counted
     │                    │
     │                    └─► provenance: the derivation's counts and issues
     │
     └──────────────► the tab keeps the raw answer as `fullText`, unchanged
```

## 1. One derivation path

`src/integrity/derive.ts` is the only caller of the five extractors in
`src/lib/research.ts` (`parseReportSections`, `extractEntities`,
`extractTimeline`, `extractNotes`, `extractFollowUpQuestions`). Both live run
call sites — `src/components/research/ResearchWorkspace.tsx` and
`src/components/canvas/use-chat-turn.ts` — call `deriveTabRecords()` and write
its return value. An architecture guard fails the build if any other source file
imports an extractor, and a second guard checks that both call sites use the
boundary and never call an extractor themselves.

The raw extractors still exist and are still tested: they are pure string
functions. What changed is who may read them.

### What the boundary does, in order

1. **Read the extractors as a set of untrusted inputs.** Each may return any
   type, and one that throws is a *parser failure*: the list comes back empty and
   an issue is recorded. A bad extractor cannot take the derivation down, and it
   cannot corrupt state by partially succeeding.
2. **Validate every record field by field** (`validateSectionRecord`,
   `validateEntityRecord`, `validateTimelineRecord`, `validateNoteRecord`,
   `validateFollowUp`). Missing or wrongly-typed fields drop the record. Unknown
   enumeration values (an entity `type` that is not a known type) fall back to
   the safe value and are counted.
3. **Check the record against the answer it claims to come from.** A record whose
   text does not occur in the answer is refused as a fabricated reference. This
   is a containment check, not a truth check — it catches an extractor that
   invents or rewrites text, and it cannot catch a sentence the model itself
   fabricated (the grounding report owns that question).
4. **Deduplicate** by normalised text, keeping the first record in answer order,
   and count the merges. Two records for the same subject that disagree about the
   subject's type are kept once, as the first type, with the conflict reported.
5. **Cap the lists**, keeping whole records and reporting how many were not kept.
   Nothing is truncated silently: an oversized field is kept and flagged.
6. **Refuse duplicate ids.** Ids are content-derived (`sec-`, `ent-`, `evt-`,
   `note-`, `fup-` + FNV-1a of the normalised key), so a repeat derivation of the
   same text produces the same ids and no duplicate rows. The id-uniqueness pass
   exists for the one remaining case, a 32-bit hash collision, and reports itself
   if it ever fires.
7. **Label support** by matching each record's text against the run's retrieved
   chunks. `supported` means a chunk contains the text; everything else is
   `unverified`. The boundary has no way to produce `verified`.
8. **Report.** The result carries records plus a `DerivationProvenance`: the
   schema version, the run id, the tab and workspace, the digest of the answer it
   was derived from, the answer's length, the counts (kept, dropped, merged,
   supported, unverified) and the issue log (bounded sample, complete totals).

### The sections exception

An answer with no `##` headings is rendered under the application's own
`Overview` label. Refusing that section would delete a legitimate part of the
report, so the boundary keeps it and marks its provenance `from: "app"` and its
issue log `app-supplied`. A section *body* that does not occur in the answer is
still refused: the app may label a record, it may not invent one.

## 2. Versioned schemas

| Constant | Where | Meaning |
| --- | --- | --- |
| `DERIVED_RECORD_SCHEMA_VERSION` (`1`) | `src/integrity/schema.ts` | the bounds and checks a record was validated against; stamped on every record's provenance as `<extractor>@1` |
| `INTEGRITY_SCHEMA_VERSION` (`1`) | `src/integrity/types.ts` | the change-log payload version; a stored payload from another version is refused as a whole and reported, never half-read |
| `TASKS_VERSION`, memory storage versions | `src/tasks`, `src/memory` | unchanged; this mission adds no new persisted format that duplicates them |

A record that was derived under one version and stored keeps the version it was
derived with, so a stored tab can be compared against a later build.

## 3. What is refused, and what is merely reported

Nothing at this boundary disappears silently. Every refusal, merge and cap is
counted, and up to 40 issues are stored verbatim with the full totals beside
them:

| Issue | Meaning |
| --- | --- |
| `malformed-record` | missing field, wrong type, unknown enum value, or an extractor that threw or returned a non-list |
| `fabricated-reference` | the record's text does not occur in the answer |
| `app-supplied` | the label came from the application, not the answer (the `Overview` heading) |
| `duplicate-merged` | a second record with the same normalised text was merged away |
| `type-conflict` | the same subject arrived with two different types; the first was kept |
| `oversized-record` | a field beyond its bound; the record was kept whole |
| `list-capped` | more records than the list's cap; whole records were kept, the rest were not |
| `id-collision` | two derived records hashed to one id; the second was refused |
| `answer-too-large` | the answer exceeds the derivation bound; it was derived from anyway |

Bounds (`RECORD_BOUNDS`): 60 sections (200-char titles, 120 000-char bodies),
120 entities, 60 timeline entries, 40 notes, 6 follow-ups, 400 000-char answers.
The caps exist so a hostile or degenerate answer cannot make a tab unstoreable;
they are not quality filters.

## 4. Provenance and the epistemic vocabulary

Every derived record carries `provenance`:

```ts
interface DerivedRecordProvenance {
  from: "answer" | "app";     // where the record came from
  runId: string | null;       // the pipeline run, when there was one
  answerDigest: string;       // digest of the exact answer text
  extractor: string;          // "sections@1", "entities@1", …
  at: number;
  evidence: string[];         // locators of chunks whose text contains the record
  support: "supported" | "unverified";
}
```

The full vocabulary the application uses, and where each value is produced:

| Status | Meaning | Produced by |
| --- | --- | --- |
| `verified` | checked against a specific source or test | **reserved, and not asserted by anything in this build.** The value exists so the vocabulary has somewhere to point; the task verifier (Mission 9) reports its checks in the task record, and the derivation boundary, the memory layer and the operators are all unable to write it. (The grounding layer uses the word "verified" for a *chunk* reproduced from its source text — that is a statement about the chunk, not about a claim.) |
| `supported` | retrieved evidence contains the claim's text | the derivation boundary (`evidence` contains the locators) |
| `inferred` | produced by the model from evidence, not stated by a source | the memory layer for model-written records |
| `assumed` | taken as true without being checked | the memory layer for operator-written records |
| `disputed` | conflicts with another record that is still stored | the memory layer, which keeps both sides |
| `unverified` | stored but never checked | the derivation boundary (no chunk matched the record) |
| `unknown` | origin or meaning is not known | legacy records imported before provenance existed |

The distinction the mission asks for is therefore not a colour on a badge: it is
which component is *allowed* to assert which value. The derivation path can
produce `supported` and `unverified` and nothing else; an operator can hand-set
`assumed`, `unverified` or `unknown`; `disputed` is produced by the memory layer
when two records disagree and both are kept; and `verified` is not written by
anything in this build — the vocabulary keeps the word for a check that names
what it checked, and no model, extractor or button may assert it.

## 5. Confidence semantics

The confidence score is computed from retrieval overlap, faithfulness of the
answer to the retrieved text, answer length and retry stability. A model's own
confidence statement is **not an input**, and the score is **not calibrated**: no
held-out dataset exists in this repository, so it is not a probability, not a
percentage of correctness and not a margin of safety. `src/eval/calibration.ts`
owns that phrasing (`CAVEAT`) and the evidence-coverage label.

Both places the number can be read now carry that context:

- `IntelligenceStrip` shows the evidence-coverage label beside the score and,
  under `What the confidence number means — and what it does not`, the caveat
  verbatim plus the list of actual inputs;
- `ReportExport` writes the caveat and the coverage label into every exported
  report, because the export is the artefact most likely to be read away from
  the app.

Nothing in the app turns either label into "verified".

## 6. Follow-up questions

`extractFollowUpQuestions` reports only questions the answer contains; the
hard-coded fallback it used to invent is gone. When an answer asks nothing, the
application supplies five suggested prompts labelled `origin: "app"`, and every
surface that renders them says so (`FollowUpQuestions`, `SimpleChat`). A tab
written before this change has no recorded origin and is labelled as unrecorded
rather than being presented as the model's.

## 7. The change set

`src/integrity/changes.ts` keeps a reviewable record of what each completed run
changed **outside** the tab:

- the derivation's counts, issue totals and issue sample;
- the ids of the knowledge-graph nodes and edges the run added (existing nodes
  that were merely reinforced are not reported as additions);
- the memory layer's own outcome for the exchange (`created`, `duplicate`,
  `conflict`, `rejected`), with the record id and any detail.

The log is capped at 60 entries (oldest dropped, with a count), persisted through
the key-value layer with a version tag, read back defensively — an entry that
does not have a usable shape is refused and counted — and merged with, never
replaced by, the stored copy, so a change recorded while the read was in flight
is not hidden.

What the change set is **not**: it is not an audit trail, and it is not evidence
that anything it lists is true. It records that the application stored something,
where it came from, and how far it could be checked.

`IntegrityPanel` (developer mode) lists the change sets for the active workspace
and offers exactly two actions:

- **Acknowledge** — appends a timestamped note. It changes nothing else.
- **Remove memory record** — calls the memory layer's audited deletion, so the
  removal leaves the same history entry any other deletion does.

Knowledge nodes are listed but not deletable here: a node is text shared by
everything that mentions the term, and deleting one quietly would leave its edges
behind.

## 8. Honest tool reporting

A tool call has three states, and the audit entry (`src/tools/audit.ts`) keeps
them apart:

| State | Field | Present when |
| --- | --- | --- |
| requested | `at` | always — the call reached the policy |
| started | `startedAt` | a tool actually began running |
| finished | `finishedAt` | a running tool stopped, for any reason |

A refused call, a call needing approval that never ran, and a call cancelled
before its first attempt have `at` and no start. There is no fourth state:
nothing in `src/tools` may describe a result as *verified* — a tool returning data
does not make the data true — and an architecture guard fails the build if the
word appears in the tool layer's code (the one place it appears at all is the
comment that denies it). The panel renders the lifecycle in those words.

## 9. What is deliberately not stored

Private chain-of-thought is not a feature. The app stores and shows evidence,
assumptions, decision summaries, uncertainty, tests, tool actions and outcomes:
the derivation's issues, the grounding report, the activity log, the audit trail,
the task history, the memory records and their statuses. No field anywhere holds
stream-of-thought text; an architecture guard checks that no source file mentions
a reasoning-content field at all.

## 10. Tests and guards

| File | What it covers |
| --- | --- |
| `src/test/integrity/derive.test.ts` | clean derivation and provenance, support vs. unverified, determinism, the `Overview` exception, app-labelled follow-ups, malformed and fabricated records, unknown types, oversized titles, type conflicts, duplicate merges, list caps, oversized answers, id collisions, extractor failures |
| `src/test/integrity/changes.test.ts` | recording, the cap and its dropped count, acknowledgement, defensive read (corrupt entries, wrong version), merge-not-replace, clearing |
| `src/test/integrity/panel.test.tsx` | the panel's rendering, memory removal through the audited path, acknowledgement, the empty state |
| `src/test/integrity/store-delta.test.ts` | graph deltas report only additions; a repeated derivation adds nothing; the memory outcome of an exchange |
| `src/test/tools/lifecycle.test.ts` | requested/started/finished for run, refusal, approval and timeout; and that no audit entry serialises the word "verified" |
| `src/test/architecture/import-guards.test.ts` | one extractor caller, both call sites through the boundary, the closed test-only seam, provenance on all four record types, support vocabulary, the labelled follow-up suggestion, the caveat in both confidence surfaces, the versioned change log, the panel mounting, and the tool/chain-of-thought rules |

## 11. Limitations, stated plainly

- The containment check compares normalised text. It catches invented and
  rewritten records; it cannot tell whether a sentence the model wrote is true,
  and it does not try to.
- `supported` means a retrieved chunk *contains the record's text*. Retrieval
  quality is bounded by the retriever, and a chunk is not a source of truth in
  itself.
- Support is computed only from the chunks the run retrieved. A record that a
  later retrieval would have matched stays `unverified` until another run
  derives it; that is a floor on support, not a ceiling on truth.
- Ids are content-derived, so an edited answer produces new ids for changed
  records. That is deliberate: an id identifies a record, not a position.
- The change log is a review queue capped at 60 entries. It is not the audit
  trail — `src/tools/audit.ts` and the memory history are — and clearing it
  removes nothing but the queue.
- The 32-bit id-uniqueness pass is defensive. It is not reachable by writing a
  test answer, and it is tested with crafted ids rather than a real collision.
- No live model was available in this environment, so every path in this
  document is verified against the test suite and architecture guards; the
  rendering of the panels was not re-checked in a browser for this mission.
