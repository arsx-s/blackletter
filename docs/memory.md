# Memory: provenance, editing, and retention

Mission 4 turned workspace persistence into a memory system the operator can
inspect, correct, and control. This document is the contract: what a memory
record is, what the code guarantees, and what is *not* verified.

## What memory is, and what it is not

A memory record is a **claim the system can act on later**, with a recorded
origin and a recorded trust level. It is not:

- **a conversation log.** Chat messages stay in the tab's message list. A
  completed research run may *also* write one episodic record, clearly marked as
  auto-recorded and `inferred`, because "what happened" is a legitimate thing to
  remember — but the two are separate stores.
- **a document store.** Uploaded files live in `documents` and are read through
  `src/lib/extraction`. A document can *produce* memory records (source memory),
  and a record can point at a document with a locator, but the bytes are not
  memory.
- **a model-weight update.** Nothing in `src/memory` calls a model, a network, or
  a training path. `src/test/architecture/import-guards.test.ts` enforces that
  with a banned-API scan over the module.

## Categories

| Category | Meaning |
| --- | --- |
| `episodic` | What happened: a conversation turn, a completed run, a project event. |
| `semantic` | Facts, concepts, relationships, and the evidence behind them. |
| `procedural` | Approved workflows and repeatable methods. |
| `project` | Goals, preferences, commitments, and current status. |
| `source` | Source identity, retrieval time, provenance, verification state. |

## Origin and trust are different things

`origin` says **where a claim came from** and is set once at creation. `status`
says **how far it is trusted** and can change — always through a revision that
records why.

| Origin | Initial status | Meaning |
| --- | --- | --- |
| `user` | `assumed` | The operator stated it. Authority, not verification. |
| `model-inference` | `inferred` | A model produced it. |
| `external-source` | `supported` if it carries a locator, else `unverified` | It came from a retrieved source. |
| `legacy-import` | `unknown` | It predates memory records; the origin was not stored. |

`verified` is not reachable from an origin at all: only code that actually
performed a check may set it, and the memory panel does not offer it as a label.
The panel's trust dropdown offers `assumed`, `unverified` and `unknown` only.

This is the "never silently promote an inference into a confirmed personal fact"
rule: **editing an inferred record's text does not change its origin.** The
operator corrects the wording or the trust level, and the revision history shows
both.

## Guarantees enforced by the code

Each of these is a test, not a policy statement:

1. **Stable ids.** A record's id is a digest of `(category, normalised content,
   scope)`, so importing the same legacy entry twice cannot create a duplicate.
2. **Duplicates are visible.** Storing an identical claim again does not create a
   second record, and it appends a `merged` revision rather than silently
   discarding the sighting.
3. **Contradictions are preserved.** Two records that share content words and
   disagree — one negates what the other asserts, or they give different figures
   for the same subject — are *both* kept and both marked `disputed`, with the
   reason in the history. Resolving a dispute marks the winner `assumed`, marks
   the loser `unverified`, records `supersedes`, and deletes nothing.
4. **Deletion removes the record from retrieval.** Retrieval reads the same
   record list that deletion mutates; there is no second index to go stale. The
   audit entry left behind holds a digest (`fnv1a32:`), never the content.
5. **Retention is per record.** `keep`, `review` (surfaced once it is old but
   never deleted), `expire` (deleted once the date passes, and skipped by
   retrieval even before the sweep runs). Every applied policy writes an audit
   entry.
6. **Auto-recorded memory is capped and the cap is stated.** At most
   `MEMORY_MAX_AUTO_PER_WORKSPACE` (120) auto records per workspace; the oldest is
   retired with a `retention-capped` audit entry. Operator records are never
   retired by the cap.
7. **Clear-all needs the scope repeated.** `clearScope` requires `confirm` to
   equal the workspace id, or `*` for everything, plus a written reason. Clearing
   one workspace leaves global records and other workspaces alone.
8. **Prompts carry the labels.** `memoryContextText` renders
   `[Category · Status · Origin]` per record, names the source and locator, and
   adds an explicit caution when a returned record is `disputed` or a legacy
   import. It renders nothing at all when there is nothing to render.

## Migration

`migrateMemoryState(raw, legacyWorkspaceMemory)` is the only reader of persisted
memory and runs during hydration.

- State written by this version is sanitised record by record; a record whose
  shape is unusable is dropped and counted, and the rest are kept.
- Workspace memory written *before* records existed (`AppState.memory`, the
  `goals` / `concepts` / `gaps` / `entries` shape) is imported once, marked
  `legacy-import` / `unknown`, and linked to its workspace. `legacyMigratedAt`
  records that it happened, and content-addressed ids make it idempotent anyway.
- Unrecognisable state yields an empty memory state and a note. It is never
  guessed at, and nothing is deleted.
- The legacy shape is still written by `rememberExchange` because follow-up
  detection reads it; the migration and that writer coexist deliberately.

## Where it is used

- `workspaceStore.memoryContextFor(workspaceId, query)` → `memoryContextText` →
  the `memoryContext` field of the pipeline input, set by
  `src/components/canvas/use-chat-turn.ts` and
  `src/components/research/ResearchWorkspace.tsx`.
- `workspaceStore.rememberExchange(...)` writes the legacy summary **and** one
  episodic record with `origin: model-inference`, `status: inferred`,
  `auto: true`.
- `src/components/memory/MemoryPanel.tsx`, rendered in Workshop ("What Blackletter
  remembers"), is the operator surface: filter, inspect, edit, correct, set
  retention, delete, resolve disputes, add by hand, apply retention, clear.

## What is not verified

- **No runtime check with a real model.** There is no API key in this
  environment, so no live pipeline run was performed. The prompt block is covered
  by unit tests over `formatMemoryContext`; the store wiring is covered by
  hydration and panel tests. A live run remains unverified.
- **Contradiction detection is heuristic.** It flags opposite polarity or
  differing figures over shared content words. It will miss contradictions
  phrased without shared words, and it does not use embeddings. It never deletes
  and never resolves anything on its own.
- **No cross-device sync.** Records live in the same IndexedDB/localStorage state
  as everything else. Multi-device synchronisation is out of scope for this
  mission and is not implemented.
- **No automatic memory extraction from documents.** Source memory records are
  created by code paths that have a source in hand; a document upload does not
  yet produce semantic records by itself.
- **`status: "verified"` is defined but unused.** No current pipeline stage
  performs a check strong enough to set it, so nothing sets it. That is
  deliberate: an unused-but-honest label is better than a false one.
