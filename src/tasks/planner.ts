import { queryTerms } from "../pipeline/scoring";
import { clampBudget, type AutonomyLevel, type TaskBudget, type TaskCriterion, type TaskPlan, type TaskStepSpec } from "./types";

/**
 * The planner: a goal in, a short bounded plan out.
 *
 * It is **deterministic on purpose**. No model writes this plan, so a plan can be
 * reproduced, reviewed and compared across runs, and a step's rationale always
 * names the reason it exists. What a model may do with a task is separate (and, in
 * this build, nothing): the planner only proposes steps built from the *closed*
 * tool registry — a tool name is never invented here, because a name that is not
 * in the registry is refused by the machine before anything runs.
 *
 * The success criteria are checks, not prose. Every criterion carries an id the
 * verifier knows how to evaluate, so "did this task succeed?" is answered by
 * running code over the task's own record rather than by reading a summary.
 */

/** Distinctive terms taken from a goal: the same rule the retrieval scorer uses. */
export const PLAN_TERM_LIMIT = 6;

/**
 * Words that describe the *request* rather than its subject.
 *
 * The planner uses this list for one purpose: choosing the term to search
 * literally. A goal like "what does this workspace say about the coolant loop"
 * names its own act of asking in words the workspace will not contain, so a search
 * for "workspace" or "say" returns nothing while the subject term is right there.
 * The list is small and visible, and the plan states which term it chose, so the
 * choice can be disagreed with.
 */
const REQUEST_WORDS: ReadonlySet<string> = new Set([
  "workspace",
  "document",
  "documents",
  "doc",
  "docs",
  "note",
  "notes",
  "knowledge",
  "anything",
  "something",
  "nothing",
  "tell",
  "explain",
  "describe",
  "summarise",
  "summarize",
  "summary",
  "report",
  "find",
  "known",
  "about",
  "say",
  "says",
  "said",
  "please",
  "give",
  "show",
  "list",
  "need",
  "want",
  "used",
  "use",
]);

/** The goal's terms with the request's own vocabulary removed, when anything is left. */
export function subjectTerms(goal: string): string[] {
  const terms = queryTerms(goal).slice(0, PLAN_TERM_LIMIT);
  const subject = terms.filter((term) => !REQUEST_WORDS.has(term));
  return subject.length > 0 ? subject : terms;
}

export interface PlanRequest {
  goal: string;
  constraints: string[];
  level: AutonomyLevel;
  /** Extra criteria the operator supplied, displayed but never silently dropped. */
  criteria?: string[];
  budget?: Partial<TaskBudget>;
}

export function planBudget(request: PlanRequest): TaskBudget {
  return clampBudget(request.level, request.budget);
}

/** The goal's distinctive terms, joined, for a scored retrieval query. */
export function goalTerms(goal: string): string {
  return subjectTerms(goal).join(" ");
}

/** The goal's most distinctive single term, for a tool that matches literally. */
export function topTerm(goal: string): string {
  const terms = subjectTerms(goal);
  // Longest first: length is a crude but visible proxy for a term being the subject
  // rather than the request, and the plan names the term it picked.
  return [...terms].sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ?? "";
}

const EXPRESSION_RUN = /[0-9.+\-*/^%()\s]+/g;
const BINARY = /\d\s*[+\-*/^%]\s*\(?\s*-?\d/;
/** A date or a year range is not an expression, however arithmetic it looks. */
const DATE_LIKE = /^\d{4}\s*[-–]\s*(\d{1,2}|\d{4})(\s*[-–]\s*\d{1,2})?$/;

/**
 * The arithmetic fragment a goal states, if it states one.
 *
 * Only characters the calculator accepts are considered, the fragment must contain
 * an operator *between two digits*, and date-like and year-range shapes are
 * rejected — otherwise "in 2023-2024" would become a subtraction.
 */
export function arithmeticIn(goal: string): string | null {
  for (const run of goal.match(EXPRESSION_RUN) ?? []) {
    const candidate = run.trim();
    if (candidate.length < 3 || candidate.length > 100) continue;
    if (!/\d/.test(candidate) || !/[+\-*/^%]/.test(candidate)) continue;
    if (!BINARY.test(candidate)) continue;
    if (DATE_LIKE.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function successCriteria(level: AutonomyLevel, extra: string[] = []): TaskCriterion[] {
  if (level === 0) {
    return [
      { id: "steps-completed", text: "every planned step finished, or was skipped with a stated reason" },
      { id: "no-tool-calls", text: "no tool was called, because level 0 executes nothing" },
      ...extra.map((text) => ({ id: "steps-completed" as const, text })),
    ];
  }

  return [
    { id: "steps-completed", text: "every planned step completed, or was skipped with a stated reason" },
    { id: "evidence-present", text: "at least one step returned evidence from this workspace" },
    { id: "numbers-grounded", text: "every number stated in the answer appears in the retrieved evidence" },
    { id: "support-ratio", text: "at least 60% of the answer's judged sentences are supported by retrieved evidence", threshold: 0.6 },
    ...extra.map((text) => ({ id: "steps-completed" as const, text })),
  ];
}

/**
 * Build the plan for a request.
 *
 * Step order is deliberate: count, then search, then read the best match, then
 * memory, then scored retrieval. The search runs before the read so the read has an
 * id to resolve; the read runs before the rest so that what follows is anchored to
 * an item this workspace actually contains; memory comes before retrieval so the
 * record a task already holds is in play alongside the text it is about to fetch.
 */
export function buildPlan(request: PlanRequest): TaskPlan {
  const goal = request.goal.trim().replace(/\s+/g, " ");
  const terms = goalTerms(goal);
  const steps: TaskStepSpec[] = [];

  if (request.level >= 1) {
    steps.push({
      id: "step-1-status",
      tool: "workspace.status",
      rationale: "Report what this workspace holds before reading anything from it.",
      args: {},
      because: "the counts are cheap and tell the operator whether the goal is addressable in this workspace at all",
    });

    if (terms.length > 0) {
      steps.push({
        id: "step-2-search",
        tool: "workspace.search",
        rationale: "Find the documents, notes and knowledge nodes that mention the goal's most distinctive term.",
        args: { query: "", limit: 8 },
        resolve: { query: "topTerm" },
        because: `workspace.search matches text literally, so the step searches one term — "${topTerm(goal)}" — chosen as the longest subject term in the goal; a phrase would find nothing unless the workspace wrote it that way`,
      });

      steps.push({
        id: "step-3-read",
        tool: "workspace.read",
        rationale: "Read the best-matching item from the search in full.",
        args: { id: "" },
        resolve: { id: "previousHitId" },
        optional: true,
        because: "the top search hit is the most likely source; the step is skipped, with the reason recorded, when the search found nothing",
      });

      steps.push({
        id: "step-4-memory",
        tool: "memory.search",
        rationale: "Read this workspace's memory records for the same terms, so the task uses what the operator already established.",
        args: { query: "", limit: 8 },
        resolve: { query: "terms" },
        because: "memory records carry a category, an epistemic status and an origin note, which is what separates an established fact from a model inference",
      });

      steps.push({
        id: "step-5-evidence",
        tool: "evidence.retrieve",
        rationale: "Retrieve scored passages of the matching documents, with locators, so any claim can be traced back to its text.",
        args: { query: "" },
        resolve: { query: "terms" },
        because: "a locator is what makes a citation checkable after the fact",
      });

      const arithmetic = arithmeticIn(goal);
      if (arithmetic) {
        steps.push({
          id: "step-6-calculate",
          tool: "calculate",
          rationale: `Evaluate the arithmetic the goal states: ${arithmetic}`,
          args: { expression: arithmetic },
          because: "the goal contains an expression, and the local calculator is exact where a model's arithmetic is not",
        });
      }
    }
  }

  const difficulty: TaskPlan["estimate"]["difficulty"] = steps.length <= 2 ? "low" : steps.length <= 4 ? "medium" : "high";

  return {
    steps,
    successCriteria: successCriteria(request.level, request.criteria ?? []),
    estimate: {
      difficulty,
      uncertainty:
        "The plan does not know how many documents this workspace holds, whether they cover the goal, or how the retrieved text will read; the steps establish that, and the verification reports it.",
      risk: request.level >= 2 ? "medium" : "none",
      note:
        request.level === 0
          ? "Level 0 plans and explains. It executes nothing, so this plan is a proposal for the operator to run at level 1 or above."
          : `${steps.length} read-only step(s). Every call is budgeted, audited, and may be paused or cancelled before it runs.`,
    },
  };
}
