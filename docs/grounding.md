# Evidence grounding and citation integrity

This document describes what the retrieval and evaluation stages actually
guarantee, where the guarantees stop, and which numbers are measurements rather
than policy. It describes the code in `src/pipeline/grounding.ts`,
`src/pipeline/scoring.ts`, `src/langgraph/nodes/RetrievalNode.ts` and
`src/langgraph/nodes/EvaluationNode.ts` as they exist today.

## The unit of evidence: a chunk

A chunk is a span of a source document, plus a locator that identifies the span:

```ts
interface SourceLocation {
  documentId: string;   // stable across runs for the same uploaded file
  documentName: string; // the file name as the user sees it
  page: number | null;  // null unless the format exposed page boundaries
  section: string | null;
  charStart: number;    // offsets into the stored source text
  charEnd: number;
}
```

Four properties are enforced, and each has a test:

1. **The text is a literal slice of the stored source.** `chunkDocumentPart`
   derives `charStart`/`charEnd` from an index map over the original text and
   then re-slices the source and compares it to the chunk text. A chunk that
   does not reproduce is dropped before it leaves the chunker, with a reason.
2. **The id is content addressed.** `chunkId(sourceType, source, location, text)`
   digests the source type, source name, all four locator fields and the text.
   It is not a list position, so reordering or re-chunking the corpus cannot
   silently rename a stored citation.
3. **Offsets are exact even when the document's whitespace is irregular.**
   Windows are cut from a whitespace-collapsed copy of the document, so a
   `number[]` map records where each normalised character came from in the
   original. A window boundary that lands on a collapsed space is trimmed and
   the offsets move with it.
4. **A locator never escapes its document.** `verifyChunk` distinguishes
   `unknown-document`, `out-of-range` and `text-mismatch`, and the pipeline logs
   each drop rather than discarding it silently.

Chunk policy (`CHUNK_POLICY`): target 700 characters, 120 characters of overlap
between adjacent windows, a 100-character floor below which a span is not
evidence, and at most 200 chunks per source. These are policy choices, chosen so
that a sentence split across a boundary is present in full in at least one
chunk.

## Where the sources come from

`analyzeDocuments` returns one `DocumentPart` per uploaded file — its text, its
section boundaries and its real page count, all produced by
`src/lib/extraction`. Retrieval chunks those parts directly.

The joined `documentText` (with `--- name ---` separators) is still produced, for
display and for storage. It is **not** parsed to recover document boundaries;
an earlier version split it on those markers and so split any document whose own
text contained a line like `--- Methods ---` into two documents with the wrong
names.

A session stored before parts existed still contributes: with no parts and a
non-empty `documentText`, retrieval chunks the joined text as a single unnamed
source. Those chunks are locatable within the run but cannot be verified against
a per-file source, and the code says so rather than inventing page numbers.

Knowledge-graph and canvas context, and the last assistant message, are chunked
the same way, except that their "document id" is `type:name` and their locators
index the *normalised* context string that `chunkInlineSource` returns alongside
the chunks.

## Claims, support, and what "unsupported" means

`attributeClaims` judges a sentence at a time:

- Sentences shorter than 25 characters or longer than 400 are not judged; a
  fragment is not a claim, and a paragraph is not one claim.
- Sentences with fewer than four content words are not judged.
- Matching is **whole word, per chunk**. The older implementation asked
  `corpus.toLowerCase().includes(token)` over every chunk concatenated, so `age`
  was "supported" by `manage` and every answer was attributed to the corpus as a
  whole rather than to a piece of evidence.
- Overlap is `matched content words / content words` against the single
  best-matching chunk. `≥ 0.45` is supported, `< 0.25` is unsupported, and the
  band between the two is reported as **unjudged** rather than forced either way.
- A claim that states a number is only supported by a chunk containing that
  number. Word overlap cannot tell `900` from `90`. Citation markers (`[1]`) are
  stripped before this check, because a marker is a pointer, not a quantity.

`supportRatio` is `supported / (supported + unsupported)` and is **`null` when
the denominator is zero**. `FaithfulnessResult.score` is likewise `null`, not
`0` — nothing measured is not the same as measured zero.

`detectHallucination` only accuses when the answer has a faithfulness score, and
only flags claims carrying at least two figures or a named entity, at an
unsupported ratio of at least 0.25. A claim resting on a single figure is left
alone: that policy is deliberately conservative, and it means the detector
misses some fabricated single numbers.

## Citations

The prompt builder lists the top `EVIDENCE_WINDOW` (15) retrieved chunks as
numbered entries and instructs the model to cite those numbers inline. The
constant lives next to the resolver so the prompt and the resolver cannot
disagree about the namespace size.

`extractCitationMarkers` recognises `[3]`, `[1,4]` and `[2-5]`, refusing a
backwards or enormous range rather than expanding it. `resolveCitations` then
maps each reference to entry *n* of the evidence list:

- a reference past the end of the list becomes an `unresolved` entry with the
  reason `no-such-evidence` — it is reported, not dropped;
- a reference to a chunk scoring below `GROUNDING_THRESHOLD` (0.22) is
  `grounded: false` and appears in `weakCitations`;
- a reference to an unscored chunk is treated as grounded, because no score is
  not a low score.

`citedClaimRatio` is the share of judged sentences (25+ characters) that carry at
least one marker, or `null` when there are none.

## Confidence

Six inputs, four components, one rule: **a component that could not be measured
is `null` with a reason, contributes no weight, and the score is renormalised
over what remains.** With nothing measurable, `ConfidenceResult.score` is `null`
and the UI says "not measured" instead of showing a band.

| Component | Weight | Measured from |
| --- | --- | --- |
| `retrieval` | 0.35 | mean score of the top 5 chunks, scaled by 1.4 |
| `faithfulness` | 0.30 | the claim support ratio |
| `answerQuality` | 0.25 | answer length (saturating at 280 words), blended 60/40 with the quality heuristics when they ran |
| `stability` | 0.10 | `max(0.5, 1 − 0.2 × retries)` |

`computeSourceQuality` is a stated prior about *kinds* of source, not a
measurement: attached document 0.9, knowledge 0.72, canvas 0.6, history 0.55,
with +0.08 for `.gov`/`.mil`/`.edu` hosts and +0.03 for `.org`, and community
hosts (wikipedia, fandom, answers.com, quora, reddit) pinned at 0.6 — checked
first, so the `.org` bonus cannot mask the demotion.

The displayed score is clamped to `[5, 98]`: the app never claims certainty.

## What is not verified

- **Answer text is not verified against the sources.** Claims are compared to
  chunk text; an answer that paraphrases heavily will score low on faithfulness
  even when it is accurate.
- **Retrieval quality is not measured.** Scores rank chunks for the prompt; there
  is no relevance judgement, so a low `retrieval` component is not evidence that
  the right documents were missing.
- **Markers are not attributed to sentences.** A citation is checked for
  pointing at real evidence, not for supporting the sentence it follows. A
  well-formed marker on the wrong sentence passes.
- **`Weak citations` is a threshold judgement, not a measurement** of whether the
  citation supports the claim.
- **Page numbers come from the extractor.** Where a format's sections cannot be
  located in the text, `page` is `null`; the app reports no page rather than
  guessing. DOCX and Markdown produce section labels but no page numbers.
- **No evaluation fixture exercises this layer end to end yet.** The Mission 5
  harness still reports `source_fidelity` as `not_evaluated`; wiring the
  structured citations above into an adapter is what would change that.
