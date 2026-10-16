/**
 * Structural validation for evaluation datasets.
 *
 * Validation exists so a fixture typo surfaces as a message instead of a
 * mysterious `not_evaluated` or — worse — a silently skipped case. It returns
 * issues rather than throwing so callers (tests, tooling) can decide how
 * strict to be. `runEvaluation` throws on errors and folds warnings into the
 * run record's reproducibility notes.
 */

import {
  CATEGORY_EXPECTATION_BLOCK,
  EVALUATION_CATEGORIES,
  isEvaluationCategory,
} from "./dataset";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  /** Dotted path to the offending value, e.g. `datasets[0].cases[2].input.prompt`. */
  path: string;
  message: string;
  severity: ValidationSeverity;
}

export interface DatasetSetValidation {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function push(issues: ValidationIssue[], severity: ValidationSeverity, path: string, message: string): void {
  issues.push({ path, message, severity });
}

function requireString(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isNonEmptyString(value)) push(issues, "error", path, "must be a non-empty string");
}

function requireId(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    push(issues, "error", path, `must match ${ID_PATTERN} (lowercase kebab-case)`);
  }
}

function requireVersion(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isNonEmptyString(value) || !VERSION_PATTERN.test(value)) {
    push(issues, "error", path, "must be a semver string like 1.0.0");
  }
}

function requireTimestamp(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    push(issues, "error", path, "must be an ISO date string");
  }
}

function checkOptionalStringArray(issues: ValidationIssue[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isStringArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    push(issues, "error", path, "must be an array of non-empty strings");
  }
}

function checkRequiredStringArray(issues: ValidationIssue[], value: unknown, path: string): void {
  if (!isStringArray(value) || value.length === 0 || value.some((entry) => !isNonEmptyString(entry))) {
    push(issues, "error", path, "must be a non-empty array of non-empty strings");
  }
}

// ---------------------------------------------------------------------------
// Expectation blocks
// ---------------------------------------------------------------------------

function validateExpectation(
  expectation: unknown,
  path: string,
  category: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(expectation)) {
    push(issues, "error", path, "must be an object");
    return;
  }

  const answer = expectation.answer;
  if (answer !== undefined) {
    if (!isRecord(answer)) {
      push(issues, "error", `${path}.answer`, "must be an object");
    } else {
      checkOptionalStringArray(issues, answer.requiredPhrases, `${path}.answer.requiredPhrases`);
      checkOptionalStringArray(issues, answer.forbiddenPhrases, `${path}.answer.forbiddenPhrases`);
    }
  }

  const sources = expectation.sources;
  if (sources !== undefined) {
    if (!isRecord(sources)) {
      push(issues, "error", `${path}.sources`, "must be an object");
    } else {
      checkOptionalStringArray(issues, sources.requiredCitations, `${path}.sources.requiredCitations`);
      checkOptionalStringArray(issues, sources.forbiddenCitations, `${path}.sources.forbiddenCitations`);
    }
  }

  const retrieval = expectation.retrieval;
  if (retrieval !== undefined) {
    if (!isRecord(retrieval)) {
      push(issues, "error", `${path}.retrieval`, "must be an object");
    } else {
      checkRequiredStringArray(issues, retrieval.requiredSourceIds, `${path}.retrieval.requiredSourceIds`);
      checkOptionalStringArray(issues, retrieval.forbiddenSourceIds, `${path}.retrieval.forbiddenSourceIds`);
    }
  }

  const contradiction = expectation.contradiction;
  if (contradiction !== undefined) {
    if (!isRecord(contradiction)) {
      push(issues, "error", `${path}.contradiction`, "must be an object");
    } else {
      if (typeof contradiction.present !== "boolean") {
        push(issues, "error", `${path}.contradiction.present`, "must be a boolean");
      }
      checkRequiredStringArray(issues, contradiction.markers, `${path}.contradiction.markers`);
      if (contradiction.present === true && isStringArray(contradiction.markers) && contradiction.markers.length === 0) {
        push(issues, "warning", `${path}.contradiction.markers`, "empty for a present contradiction; the case will be not_evaluated");
      }
    }
  }

  const uncertainty = expectation.uncertainty;
  if (uncertainty !== undefined) {
    if (!isRecord(uncertainty)) {
      push(issues, "error", `${path}.uncertainty`, "must be an object");
    } else {
      if (uncertainty.behaviour !== "answer" && uncertainty.behaviour !== "abstain") {
        push(issues, "error", `${path}.uncertainty.behaviour`, 'must be "answer" or "abstain"');
      }
      checkOptionalStringArray(issues, uncertainty.abstentionMarkers, `${path}.uncertainty.abstentionMarkers`);
    }
  }

  const output = expectation.output;
  if (output !== undefined) {
    if (!isRecord(output)) {
      push(issues, "error", `${path}.output`, "must be an object");
    } else if (output.kind === "json") {
      checkRequiredStringArray(issues, output.requiredKeys, `${path}.output.requiredKeys`);
    } else if (output.kind === "markdown") {
      checkRequiredStringArray(issues, output.requiredHeadings, `${path}.output.requiredHeadings`);
    } else {
      push(issues, "error", `${path}.output.kind`, 'must be "json" or "markdown"');
    }
  }

  const tools = expectation.tools;
  if (tools !== undefined) {
    if (!isRecord(tools)) {
      push(issues, "error", `${path}.tools`, "must be an object");
    } else {
      checkRequiredStringArray(issues, tools.unavailableToolClaims, `${path}.tools.unavailableToolClaims`);
      checkOptionalStringArray(issues, tools.requiredDisclosures, `${path}.tools.requiredDisclosures`);
    }
  }

  const injection = expectation.injection;
  if (injection !== undefined) {
    if (!isRecord(injection)) {
      push(issues, "error", `${path}.injection`, "must be an object");
    } else {
      if (injection.canary !== undefined) requireString(issues, injection.canary, `${path}.injection.canary`);
      checkOptionalStringArray(issues, injection.forbiddenPhrases, `${path}.injection.forbiddenPhrases`);
      checkOptionalStringArray(issues, injection.requiredPhrases, `${path}.injection.requiredPhrases`);
      if (
        injection.canary === undefined &&
        !(isStringArray(injection.forbiddenPhrases) && injection.forbiddenPhrases.length > 0) &&
        !(isStringArray(injection.requiredPhrases) && injection.requiredPhrases.length > 0)
      ) {
        push(issues, "warning", `${path}.injection`, "declares no canary, forbidden or required phrases; the case will be not_evaluated");
      }
    }
  }

  const permission = expectation.permission;
  if (permission !== undefined) {
    if (!isRecord(permission)) {
      push(issues, "error", `${path}.permission`, "must be an object");
    } else {
      checkRequiredStringArray(issues, permission.refusalMarkers, `${path}.permission.refusalMarkers`);
      checkOptionalStringArray(issues, permission.complianceMarkers, `${path}.permission.complianceMarkers`);
    }
  }

  const heuristics = expectation.heuristics;
  if (heuristics !== undefined) {
    if (!isRecord(heuristics)) {
      push(issues, "error", `${path}.heuristics`, "must be an object");
    } else {
      if (typeof heuristics.answerReliable !== "boolean") {
        push(issues, "error", `${path}.heuristics.answerReliable`, "must be a boolean");
      }
      if (typeof heuristics.groundedInSources !== "boolean") {
        push(issues, "error", `${path}.heuristics.groundedInSources`, "must be a boolean");
      }
    }
  }

  if (isEvaluationCategory(category)) {
    const block = CATEGORY_EXPECTATION_BLOCK[category];
    if (expectation[block] === undefined) {
      push(
        issues,
        "warning",
        `${path}.${block}`,
        `missing expectation block for category "${category}"; the case will be reported not_evaluated`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Case, dataset, set
// ---------------------------------------------------------------------------

function validateCase(testCase: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(testCase)) {
    push(issues, "error", path, "must be an object");
    return;
  }

  requireId(issues, testCase.id, `${path}.id`);

  if (!isEvaluationCategory(testCase.category)) {
    push(issues, "error", `${path}.category`, `must be one of: ${EVALUATION_CATEGORIES.join(", ")}`);
  }

  const input = testCase.input;
  if (!isRecord(input)) {
    push(issues, "error", `${path}.input`, "must be an object");
  } else {
    requireString(issues, input.prompt, `${path}.input.prompt`);
    if (input.sources !== undefined) {
      if (!Array.isArray(input.sources)) {
        push(issues, "error", `${path}.input.sources`, "must be an array");
      } else {
        const seenSourceIds = new Set<string>();
        input.sources.forEach((source, sourceIndex) => {
          const sourcePath = `${path}.input.sources[${sourceIndex}]`;
          if (!isRecord(source)) {
            push(issues, "error", sourcePath, "must be an object");
            return;
          }
          requireId(issues, source.id, `${sourcePath}.id`);
          requireString(issues, source.title, `${sourcePath}.title`);
          requireString(issues, source.text, `${sourcePath}.text`);
          if (source.provenance !== "synthetic") {
            push(issues, "error", `${sourcePath}.provenance`, 'must be the literal "synthetic"');
          }
          if (isNonEmptyString(source.id)) {
            if (seenSourceIds.has(source.id)) {
              push(issues, "error", `${sourcePath}.id`, `duplicate source id "${source.id}" inside the case`);
            }
            seenSourceIds.add(source.id);
          }
        });
      }
    }
  }

  validateExpectation(testCase.expectation, `${path}.expectation`, typeof testCase.category === "string" ? testCase.category : "", issues);

  const metadata = testCase.metadata;
  if (!isRecord(metadata)) {
    push(issues, "error", `${path}.metadata`, "must be an object");
  } else {
    requireTimestamp(issues, metadata.createdAt, `${path}.metadata.createdAt`);
    requireString(issues, metadata.author, `${path}.metadata.author`);
    requireString(issues, metadata.rationale, `${path}.metadata.rationale`);
    if (typeof metadata.revision !== "number" || !Number.isInteger(metadata.revision) || metadata.revision < 1) {
      push(issues, "error", `${path}.metadata.revision`, "must be an integer >= 1");
    }
    checkOptionalStringArray(issues, metadata.tags, `${path}.metadata.tags`);
    if (metadata.knownGap !== undefined) {
      requireString(issues, metadata.knownGap, `${path}.metadata.knownGap`);
    }
  }
}

/** Validate one dataset. Returns every issue found, errors and warnings. */
export function validateDataset(value: unknown, basePath = "dataset"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    push(issues, "error", basePath, "must be an object");
    return issues;
  }

  requireId(issues, value.datasetId, `${basePath}.datasetId`);
  requireVersion(issues, value.version, `${basePath}.version`);
  requireTimestamp(issues, value.createdAt, `${basePath}.createdAt`);
  requireString(issues, value.description, `${basePath}.description`);

  if (value.kind !== "regression" && value.kind !== "fresh") {
    push(issues, "error", `${basePath}.kind`, 'must be "regression" or "fresh"');
  }
  if (value.provenance !== "synthetic") {
    push(issues, "error", `${basePath}.provenance`, 'must be the literal "synthetic"');
  }

  if (!Array.isArray(value.cases)) {
    push(issues, "error", `${basePath}.cases`, "must be an array");
    return issues;
  }
  if (value.cases.length === 0) {
    push(issues, "warning", `${basePath}.cases`, "dataset contains no cases; a run over it produces no evidence");
  }

  const seenCaseIds = new Set<string>();
  value.cases.forEach((testCase, caseIndex) => {
    const casePath = `${basePath}.cases[${caseIndex}]`;
    validateCase(testCase, casePath, issues);
    if (isRecord(testCase) && isNonEmptyString(testCase.id)) {
      if (seenCaseIds.has(testCase.id)) {
        push(issues, "error", `${casePath}.id`, `duplicate case id "${testCase.id}" inside the dataset`);
      }
      seenCaseIds.add(testCase.id);
    }
  });

  return issues;
}

/** Validate a dataset set, including cross-dataset case id uniqueness. */
export function validateDatasetSet(value: unknown, basePath = "datasetSet"): DatasetSetValidation {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    push(issues, "error", basePath, "must be an object");
  } else {
    requireId(issues, value.setId, `${basePath}.setId`);
    requireVersion(issues, value.version, `${basePath}.version`);
    requireTimestamp(issues, value.createdAt, `${basePath}.createdAt`);
    requireString(issues, value.description, `${basePath}.description`);

    if (!Array.isArray(value.datasets)) {
      push(issues, "error", `${basePath}.datasets`, "must be an array");
    } else if (value.datasets.length === 0) {
      push(issues, "error", `${basePath}.datasets`, "must contain at least one dataset");
    } else {
      const seenCaseIds = new Map<string, string>();
      value.datasets.forEach((dataset, datasetIndex) => {
        const datasetPath = `${basePath}.datasets[${datasetIndex}]`;
        issues.push(...validateDataset(dataset, datasetPath));
        if (!isRecord(dataset) || !Array.isArray(dataset.cases)) return;
        const datasetId = isNonEmptyString(dataset.datasetId) ? dataset.datasetId : datasetPath;
        dataset.cases.forEach((testCase, caseIndex) => {
          if (!isRecord(testCase) || !isNonEmptyString(testCase.id)) return;
          const previous = seenCaseIds.get(testCase.id);
          if (previous !== undefined && previous !== datasetId) {
            push(
              issues,
              "error",
              `${datasetPath}.cases[${caseIndex}].id`,
              `case id "${testCase.id}" collides with dataset "${previous}"; ids must be unique across a set`,
            );
          }
          seenCaseIds.set(testCase.id, datasetId);
        });
      });
    }
  }

  return {
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    ok: !issues.some((issue) => issue.severity === "error"),
  };
}
