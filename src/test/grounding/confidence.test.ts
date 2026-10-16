import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_POLICY,
  GROUNDING_THRESHOLD,
  computeConfidence,
  computeSourceQuality,
  confidenceLabel,
  confidenceLabelOrNull,
  groundedSources,
  scoreChunks,
  type FaithfulnessResult,
  type ScoredChunk,
} from "../../pipeline/scoring";

function scored(overrides: Partial<ScoredChunk> = {}): ScoredChunk {
  return {
    id: "chunk-1",
    source: "Report",
    sourceType: "document",
    text: "some text",
    position: 0,
    score: 0.5,
    relevance: 0.5,
    coverage: 0.5,
    sourceQuality: 0.9,
    recency: 0.9,
    positionBias: 1,
    ...overrides,
  };
}

const MEASURED: FaithfulnessResult = {
  score: 1,
  supportedClaims: ["a claim"],
  unsupportedClaims: [],
  supportRatio: 1,
};

const NOT_MEASURED: FaithfulnessResult = {
  score: null,
  supportedClaims: [],
  unsupportedClaims: [],
  supportRatio: 0,
};

/** An answer long enough for the length term to saturate. */
const LONG_ANSWER = Array.from({ length: 300 }, () => "word").join(" ");

describe("confidence: components are measured or absent", () => {
  it("combines every measured component by its policy weight", () => {
    const result = computeConfidence("a question", [scored({ score: 0.1 })], LONG_ANSWER, MEASURED);

    // retrieval 0.35 x (0.1 x 1.4) + faithfulness 0.30 x 1 + quality 0.25 x 1 + stability 0.10 x 1
    expect(result.score).toBe(70);
    expect(result.components.every((component) => component.value !== null)).toBe(true);
    expect(result.measuredWeight).toBeCloseTo(1, 6);
  });

  it("returns no score at all when nothing could be measured", () => {
    const result = computeConfidence("a question", [], "", NOT_MEASURED);

    expect(result.score).toBeNull();
    expect(result.measuredWeight).toBe(0);
    expect(result.breakdown).toEqual({
      retrieval: null,
      faithfulness: null,
      completeness: null,
      stability: null,
    });
    for (const component of result.components) {
      expect(component.value).toBeNull();
      expect(component.reason).toBeTruthy();
    }
  });

  it("does not substitute a constant when retrieval produced nothing", () => {
    const result = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED);
    const retrieval = result.components.find((component) => component.name === "retrieval");
    const faithfulness = result.components.find((component) => component.name === "faithfulness");

    // The old implementation used 0.35 or 0.55 here and folded it into the score.
    expect(retrieval?.value).toBeNull();
    expect(retrieval?.reason).toMatch(/no evidence was retrieved/i);
    expect(faithfulness?.value).toBeNull();
    expect(faithfulness?.reason).toMatch(/no claim in the answer could be matched against evidence/i);

    // Only the two components that were measurable contribute.
    expect(result.score).toBe(98);
    expect(result.measuredWeight).toBeCloseTo(0.35, 6);

    // The breakdown shows the absence rather than a placeholder.
    expect(result.breakdown.retrieval).toBeNull();
    expect(result.breakdown.faithfulness).toBeNull();
    expect(result.breakdown.completeness).toBe(1);
  });

  it("explains an absent retrieval component differently when documents were attached", () => {
    const withDocs = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED, { hadDocuments: true });
    const retrieval = withDocs.components.find((component) => component.name === "retrieval");
    expect(retrieval?.reason).toMatch(/documents were attached but no chunk cleared retrieval/i);
  });

  it("records the basis of every measured value", () => {
    const result = computeConfidence("a question", [scored({ score: 0.6 })], LONG_ANSWER, MEASURED);
    for (const component of result.components) {
      expect(component.basis.length).toBeGreaterThan(10);
      expect(component.reason).toBeNull();
    }
  });

  it("reduces stability with each retry, under a stated curve", () => {
    const first = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED, { retryCount: 0 });
    const second = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED, { retryCount: 1 });

    const stability = (score: ReturnType<typeof computeConfidence>) =>
      score.components.find((component) => component.name === "stability")?.value;

    expect(stability(second)).toBeCloseTo(0.8, 6);
    expect(stability(first)).toBe(1);
    expect(second.score).toBeLessThan(first.score ?? 0);
    expect(second.score).toBe(94);
  });

  it("floors stability rather than letting retries drive it to zero", () => {
    const result = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED, { retryCount: 9 });
    const stability = result.components.find((component) => component.name === "stability");
    expect(stability?.value).toBe(CONFIDENCE_POLICY.stabilityFloor);
  });

  it("uses the length term alone when no quality heuristic ran", () => {
    const result = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED);
    const quality = result.components.find((component) => component.name === "answerQuality");
    expect(quality?.basis).toMatch(/answer length only/i);
  });

  it("blends the quality heuristics when they are present", () => {
    const result = computeConfidence("a question", [], LONG_ANSWER, NOT_MEASURED, {
      qualityScores: { clarity: 0, structure: 0 },
    });
    const quality = result.components.find((component) => component.name === "answerQuality");
    // 0.6 x 1 (length) + 0.4 x 0 (heuristics) = 0.6
    expect(quality?.value).toBeCloseTo(0.6, 6);
    expect(quality?.basis).toMatch(/2 quality heuristic/i);
  });

  it("never reports the floor or the ceiling as certainty", () => {
    const result = computeConfidence("a question", [], LONG_ANSWER, MEASURED);
    expect(result.score).toBeLessThanOrEqual(CONFIDENCE_POLICY.displayCeiling);
    expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_POLICY.displayFloor);
  });
});

describe("confidence: labels", () => {
  it("bands a measured score", () => {
    expect(confidenceLabel(80)).toBe("High");
    expect(confidenceLabel(75)).toBe("High");
    expect(confidenceLabel(74)).toBe("Medium");
    expect(confidenceLabel(50)).toBe("Medium");
    expect(confidenceLabel(49)).toBe("Low");
  });

  it("gives no band to a score that was never measured", () => {
    // Calling an unmeasured run "Low" would be a claim the run did not establish.
    expect(confidenceLabelOrNull(null)).toBeNull();
    expect(confidenceLabelOrNull(undefined)).toBeNull();
    expect(confidenceLabelOrNull(Number.NaN)).toBeNull();
    expect(confidenceLabelOrNull(80)).toBe("High");
  });
});

describe("source quality prior", () => {
  it("ranks an attached document above assembled context", () => {
    expect(computeSourceQuality("Report", "document")).toBeGreaterThan(
      computeSourceQuality("Knowledge Graph", "knowledge"),
    );
    expect(computeSourceQuality("Knowledge Graph", "knowledge")).toBeGreaterThan(
      computeSourceQuality("Session History", "history"),
    );
  });

  it("adds a bonus for an institutional host", () => {
    expect(computeSourceQuality("mit.edu", "knowledge")).toBeGreaterThan(
      computeSourceQuality("example.com", "knowledge"),
    );
  });

  it("demotes a community-edited host even though it ends in .org", () => {
    expect(computeSourceQuality("en.wikipedia.org", "knowledge")).toBe(0.6);
    expect(computeSourceQuality("some-random.org", "knowledge")).toBe(0.75);
  });

  it("never exceeds one", () => {
    expect(computeSourceQuality("data.gov", "document")).toBeLessThanOrEqual(1);
  });
});

describe("grounded sources carry their evidence", () => {
  it("drops chunks below the grounding threshold", () => {
    const sources = groundedSources([
      scored({ id: "a", score: 0.9 }),
      scored({ id: "b", source: "Notes", score: 0.1 }),
    ]);
    expect(sources.map((source) => source.name)).toEqual(["Report"]);
    expect(sources[0].chunkIds).toEqual(["a"]);
  });

  it("reports the pages a source's grounded chunks came from", () => {
    const location = (page: number | null) => ({
      documentId: "doc",
      documentName: "Report.pdf",
      page,
      section: null,
      charStart: page ?? 1,
      charEnd: (page ?? 1) + 10,
    });
    const sources = groundedSources([
      scored({ id: "a", score: 0.9, location: location(3) }),
      scored({ id: "b", score: 0.8, location: location(1) }),
      scored({ id: "c", score: 0.7, location: location(3) }),
      scored({ id: "d", score: 0.6, location: location(null) }),
    ]);
    // Ascending and de-duplicated; the null page is simply not claimed.
    expect(sources[0].pages).toEqual([1, 3]);
    expect(sources[0].locators).toHaveLength(4);
  });

  it("leaves pages empty rather than guessing when no locator has one", () => {
    const sources = groundedSources([scored({ id: "a", score: 0.9 })]);
    expect(sources[0].pages).toEqual([]);
    expect(sources[0].locators).toEqual([]);
  });

  it("uses the same threshold the citation resolver defaults to", () => {
    expect(GROUNDING_THRESHOLD).toBe(0.22);
  });
});

describe("chunk scoring", () => {
  it("returns nothing for an empty corpus", () => {
    expect(scoreChunks("anything", [])).toEqual([]);
  });

  it("ranks a chunk that contains the query terms above one that does not", () => {
    const chunks = [
      scored({ id: "match", text: "thermal conduction in a metal bar" }),
      scored({ id: "other", text: "an unrelated passage about cooking" }),
    ];
    const scoredChunks = scoreChunks("thermal conduction", chunks);
    const match = scoredChunks.find((chunk) => chunk.id === "match");
    const other = scoredChunks.find((chunk) => chunk.id === "other");
    expect(match?.score).toBeGreaterThan(other?.score ?? 1);
    expect(match?.coverage).toBe(1);
    expect(other?.coverage).toBe(0);
  });

  it("gives every chunk a score between zero and one", () => {
    const chunks = [scored({ id: "a", text: "alpha beta" }), scored({ id: "b", text: "gamma delta" })];
    for (const chunk of scoreChunks("alpha", chunks)) {
      expect(chunk.score).toBeGreaterThanOrEqual(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    const chunks = [scored({ id: "a", text: "alpha beta" }), scored({ id: "b", text: "beta alpha" })];
    expect(scoreChunks("alpha beta", chunks)).toEqual(scoreChunks("alpha beta", chunks));
  });
});
