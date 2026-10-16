/**
 * Versioned evaluation dataset schema.
 *
 * A dataset is a plain data structure (JSON-representable, no functions) so a
 * fixture can be reviewed, diffed and versioned like any other artefact. Two
 * rules are enforced by the types themselves rather than by convention:
 *
 * 1. `provenance: "synthetic"` is a literal — a dataset or source document
 *    cannot typecheck unless it declares itself synthetic. Real user data must
 *    never be copied into `src/eval/datasets/`.
 * 2. Every case names exactly one `EvaluationCategory`, and the expectation
 *    block that belongs to that category (see `CATEGORY_EXPECTATION_BLOCK`).
 *    If the block is missing the case is reported as `not_evaluated` — the
 *    harness never invents a score for missing ground truth.
 *
 * Versioning rules are documented in `docs/evaluation.md`: bump the patch
 * version for wording/rationale edits that do not change pass/fail semantics,
 * minor for new cases, major for changed expectations or removed cases.
 */

/** Schema version of the dataset format itself (not of any dataset). */
export const DATASET_SCHEMA_VERSION = 1 as const;

export const EVALUATION_CATEGORIES = [
  "answer_correctness",
  "source_fidelity",
  "retrieval_relevance",
  "contradiction_detection",
  "uncertainty_abstention",
  "structured_output",
  "tool_honesty",
  "prompt_injection_resilience",
  "permission_boundary",
] as const;

export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];

/** Regression cases are frozen; fresh cases are replaced ad hoc so a static set alone cannot be optimised against. */
export type DatasetKind = "regression" | "fresh";

export function isEvaluationCategory(value: unknown): value is EvaluationCategory {
  return typeof value === "string" && (EVALUATION_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * A source document supplied to the system under test.
 *
 * `provenance` is a literal on purpose: fixtures are synthetic by construction
 * and no unexamined real document can be added without a type error.
 */
export interface EvalSourceDocument {
  /** Stable id referenced by retrieval/citation expectations. */
  id: string;
  title: string;
  text: string;
  provenance: "synthetic";
}

export interface EvalCaseInput {
  prompt: string;
  sources?: EvalSourceDocument[];
}

// ---------------------------------------------------------------------------
// Expectations
//
// Matching is lexical and deliberately strict: phrase checks run on
// whitespace/punctuation-normalised, lowercased text. This is documented as a
// limitation in docs/evaluation.md — the harness measures the *harness*, not a
// model, until a real answer adapter is wired in.
// ---------------------------------------------------------------------------

export interface PhraseExpectation {
  /** Phrases the answer must contain. */
  requiredPhrases?: string[];
  /** Phrases the answer must not contain. */
  forbiddenPhrases?: string[];
}

export interface SourceExpectation {
  /** Source ids the answer must cite to count as grounded. */
  requiredCitations?: string[];
  /** Source ids the answer must not cite. */
  forbiddenCitations?: string[];
}

export interface RetrievalExpectation {
  /** Source ids retrieval must surface for the case. */
  requiredSourceIds: string[];
  /** Source ids retrieval must not surface. */
  forbiddenSourceIds?: string[];
}

export interface ContradictionExpectation {
  /** Ground truth: do the supplied sources actually conflict? */
  present: boolean;
  /**
   * Lexical markers that indicate the answer claims a conflict. When
   * `present` is true and this list is empty the case is `not_evaluated`
   * rather than guessed at.
   */
  markers: string[];
}

export interface UncertaintyExpectation {
  /** `abstain` = the correct behaviour is to say the evidence is insufficient. */
  behaviour: "answer" | "abstain";
  /** Case-specific; falls back to `DEFAULT_ABSTENTION_MARKERS` from scorers.ts. */
  abstentionMarkers?: string[];
}

export type OutputExpectation =
  | { kind: "json"; requiredKeys: string[] }
  | { kind: "markdown"; requiredHeadings: string[] };

export interface ToolHonestyExpectation {
  /** Phrases that would claim a tool the run did not have. */
  unavailableToolClaims: string[];
  /** Phrases that must appear, e.g. an explicit statement of no web access. */
  requiredDisclosures?: string[];
}

export interface InjectionExpectation {
  /**
   * A unique marker planted in the prompt/sources that a resilient answer must
   * never repeat. Counts as a forbidden phrase.
   */
  canary?: string;
  forbiddenPhrases?: string[];
  /** Phrases proving the legitimate part of the request was still answered. */
  requiredPhrases?: string[];
}

export interface PermissionExpectation {
  /** Phrases that count as refusing an out-of-permission request. */
  refusalMarkers: string[];
  /** Phrases that would indicate the system performed the disallowed action. */
  complianceMarkers?: string[];
}

/**
 * Ground truth for the pipeline's lexical heuristics, used only for false
 * positive / false negative tracking (see calibration.ts). A case without this
 * block contributes no heuristic samples and is counted as `not_evaluated`.
 */
export interface HeuristicGroundTruth {
  /**
   * True when a careful reviewer would consider the response correct and safe
   * to rely on for its stated purpose. An appropriate abstention counts as
   * reliable; a confident wrong answer does not.
   */
  answerReliable: boolean;
  /** True when the answer's claims are supported by the supplied sources. */
  groundedInSources: boolean;
}

export interface EvalExpectation {
  answer?: PhraseExpectation;
  sources?: SourceExpectation;
  retrieval?: RetrievalExpectation;
  contradiction?: ContradictionExpectation;
  uncertainty?: UncertaintyExpectation;
  output?: OutputExpectation;
  tools?: ToolHonestyExpectation;
  injection?: InjectionExpectation;
  permission?: PermissionExpectation;
  heuristics?: HeuristicGroundTruth;
}

/** Which expectation block each category is scored from. */
export const CATEGORY_EXPECTATION_BLOCK: Record<EvaluationCategory, keyof Omit<EvalExpectation, "heuristics">> = {
  answer_correctness: "answer",
  source_fidelity: "sources",
  retrieval_relevance: "retrieval",
  contradiction_detection: "contradiction",
  uncertainty_abstention: "uncertainty",
  structured_output: "output",
  tool_honesty: "tools",
  prompt_injection_resilience: "injection",
  permission_boundary: "permission",
};

// ---------------------------------------------------------------------------
// Cases, datasets, sets
// ---------------------------------------------------------------------------

export interface EvalCaseMetadata {
  createdAt: string;
  /** Role or handle responsible for the case, e.g. "quality-programme". */
  author: string;
  /** Increment whenever the expectation changes. */
  revision: number;
  /** Why the case exists and which defect/regression it guards. */
  rationale: string;
  tags?: string[];
  /**
   * Set when a known gap means the recorded baseline answer is expected to
   * fail this case. Keeps an intentional failure distinguishable from drift.
   */
  knownGap?: string;
}

export interface EvalTestCase {
  /** Stable, kebab-case, unique across the whole dataset *set*. */
  id: string;
  category: EvaluationCategory;
  input: EvalCaseInput;
  expectation: EvalExpectation;
  metadata: EvalCaseMetadata;
}

export interface EvalDataset {
  datasetId: string;
  /** Semantic version of this dataset's contents. */
  version: string;
  createdAt: string;
  description: string;
  kind: DatasetKind;
  provenance: "synthetic";
  cases: EvalTestCase[];
}

export interface EvalDatasetSet {
  setId: string;
  version: string;
  createdAt: string;
  description: string;
  datasets: EvalDataset[];
}
