import { describe, expect, it } from "vitest";
import {
  SUPPORT_POLICY,
  STOP,
  attributeClaims,
  evaluateGrounding,
  type EvidenceChunk,
} from "../../pipeline/grounding";
import { computeFaithfulness, detectHallucination, faithfulnessFromReport, tokenize } from "../../pipeline/scoring";
import type { RetrievedChunk } from "../../pipeline/scoring";

function chunk(id: string, text: string): EvidenceChunk {
  return {
    id,
    source: "Report",
    sourceType: "document",
    text,
    location: {
      documentId: "doc-1",
      documentName: "Report.pdf",
      page: null,
      section: null,
      charStart: 0,
      charEnd: text.length,
    },
  };
}

function retrieved(id: string, text: string): RetrievedChunk {
  return { id, source: "Report", sourceType: "document", text, position: 0 };
}

describe("claims: word matching is whole-word", () => {
  it("does not count a content word that only occurs inside a longer word", () => {
    const evidence = [chunk("a", "To manage a system you must document and measure it")];

    // The coincidence the old substring implementation counted as support:
    expect(evidence[0].text.toLowerCase().includes("age")).toBe(true);

    const claims = attributeClaims("The age limits growth rates", evidence);
    expect(claims).toHaveLength(1);
    expect(claims[0].overlap).toBe(0);
    expect(claims[0].supported).toBe(false);
  });

  it("supports a claim the evidence actually contains", () => {
    const evidence = [
      chunk("a", "Photosynthesis converts light energy into chemical energy stored as glucose"),
    ];
    const claims = attributeClaims("Photosynthesis converts light energy into chemical energy", evidence);
    expect(claims[0].supported).toBe(true);
    expect(claims[0].overlap).toBe(1);
    expect(claims[0].supportingChunkIds).toEqual(["a"]);
  });

  it("names the chunk that carried the match, best first", () => {
    const evidence = [
      chunk("weak", "The reactor was inspected before the procedure began and no faults were found"),
      chunk("strong", "The reactor reached its peak thermal output during the procedure and held it"),
    ];
    const claims = attributeClaims(
      "The reactor reached its peak thermal output during the procedure",
      evidence,
    );
    expect(claims[0].supportingChunkIds[0]).toBe("strong");
  });

  it("leaves a partially matching claim unjudged rather than calling it either way", () => {
    const evidence = [
      chunk("a", "The reactor was inspected before the procedure began and no faults were found"),
    ];
    const claims = attributeClaims("The reactor reached its peak thermal output during the procedure", evidence);
    expect(claims[0].overlap).toBeGreaterThanOrEqual(SUPPORT_POLICY.unsupported);
    expect(claims[0].overlap).toBeLessThan(SUPPORT_POLICY.supported);
    expect(claims[0].supported).toBe(false);
  });

  it("skips a sentence too short to judge instead of guessing", () => {
    expect(attributeClaims("Too short.", [chunk("a", "Anything at all in the evidence")])).toEqual([]);
  });

  it("skips a sentence too long to be a single claim", () => {
    const long = `${"word ".repeat(100)}end of a very long paragraph indeed`;
    expect(attributeClaims(long, [chunk("a", "word")])).toEqual([]);
  });

  it("uses one stopword list for scoring and for grounding", () => {
    // The list lives in `grounding.ts`; `scoring.ts` re-exports it. Two drifting
    // lists would mean retrieval and verification disagreed about content words.
    expect(tokenize("the quick brown fox")).toEqual(["quick", "brown", "fox"]);
    expect(STOP.has("the")).toBe(true);
    expect(STOP.has("quick")).toBe(false);
  });
});

describe("claims: numbers must appear in the evidence", () => {
  const claim = "The sample reached 900 degrees during the second trial run";

  it("refuses to support a numeric claim when the number is absent", () => {
    const evidence = [
      chunk("a", "The sample reached equilibrium within the second trial and held its shape throughout"),
    ];
    const claims = attributeClaims(claim, evidence);
    // Word overlap alone would call this supported: 4 of 6 content words match.
    expect(claims[0].overlap).toBeGreaterThan(SUPPORT_POLICY.supported);
    expect(claims[0].supported).toBe(false);
  });

  it("supports the same claim when the number is present", () => {
    const evidence = [
      chunk("a", "The sample reached 900 degrees within the second trial and held its shape throughout"),
    ];
    expect(attributeClaims(claim, evidence)[0].supported).toBe(true);
  });

  it("does not let a different number stand in for the one claimed", () => {
    const evidence = [
      chunk("a", "The sample reached 90 degrees within the second trial and held its shape throughout"),
    ];
    expect(attributeClaims(claim, evidence)[0].supported).toBe(false);
  });
});

describe("grounding report", () => {
  it("returns no ratio at all when nothing could be judged", () => {
    const report = evaluateGrounding("Very short.", [chunk("a", "Some evidence text here")]);
    expect(report.supportRatio).toBeNull();
    expect(report.supportedClaims).toEqual([]);
    expect(report.unsupportedClaims).toEqual([]);
  });

  it("counts only supported and unsupported claims in the ratio", () => {
    const evidence = [
      chunk("a", "Photosynthesis converts light energy into chemical energy stored as glucose"),
      chunk("b", "The reactor was inspected before the procedure began and no faults were found"),
    ];
    const answer =
      "Photosynthesis converts light energy into chemical energy [1]. " +
      "The reactor reached its peak thermal output during the procedure. " +
      "The age limits growth rates of the culture substantially over the period.";
    const report = evaluateGrounding(answer, evidence);

    expect(report.supportedClaims).toHaveLength(1);
    expect(report.unsupportedClaims).toHaveLength(1);
    expect(report.supportRatio).toBe(0.5);
    // The middle-band claim is neither: it is listed as unjudged so the reader
    // can see the denominator is not the whole answer.
    expect(report.unjudgedSentences.length).toBeGreaterThanOrEqual(1);
  });

  it("lists a source that produced no evidence, with a reason", () => {
    const sources = new Map([
      ["doc-1", "Some text"],
      ["doc-2", "No chunk came from here"],
    ]);
    const report = evaluateGrounding("An answer with enough words to be judged properly.", [chunk("a", "Some text")], {
      sources,
    });
    expect(report.withoutEvidence).toEqual([
      { documentId: "doc-2", reason: "no chunk of usable length was produced" },
    ]);
  });

  it("marks chunks that cannot be reproduced from their source", () => {
    const bad = chunk("bad", "This text is not in the document");
    const report = evaluateGrounding("An answer with enough words to be judged properly.", [bad], {
      sources: new Map([["doc-1", "Completely different content entirely here"]]),
    });
    expect(report.unverifiable).toEqual([{ chunkId: "bad", reason: "text-mismatch" }]);
  });
});

describe("faithfulness summary", () => {
  it("is absent, not zero, when no claim could be judged", () => {
    const result = computeFaithfulness("Okay.", [retrieved("a", "Some evidence text that is long enough")]);
    expect(result.score).toBeNull();
    expect(result.supportRatio).toBe(0);
  });

  it("is absent when there is no evidence at all", () => {
    expect(computeFaithfulness("A full answer with several words in it.", []).score).toBeNull();
  });

  it("reports the ratio of supported to judged claims", () => {
    const chunks = [retrieved("a", "Photosynthesis converts light energy into chemical energy stored as glucose")];
    const result = computeFaithfulness(
      "Photosynthesis converts light energy into chemical energy. " +
        "The age limits growth rates of the culture substantially over the period.",
      chunks,
    );
    expect(result.supportedClaims).toHaveLength(1);
    expect(result.unsupportedClaims).toHaveLength(1);
    expect(result.score).toBe(0.5);
  });

  it("keeps working for chunks that carry no locator, such as a legacy session", () => {
    const result = computeFaithfulness(
      "Photosynthesis converts light energy into chemical energy.",
      [retrieved("a", "Photosynthesis converts light energy into chemical energy stored as glucose")],
    );
    expect(result.score).toBe(1);
  });

  it("carries per-claim attribution through to the summary", () => {
    const chunks = [retrieved("a", "Photosynthesis converts light energy into chemical energy stored as glucose")];
    const result = computeFaithfulness("Photosynthesis converts light energy into chemical energy.", chunks);
    expect(result.claims?.[0].supportingChunkIds).toEqual(["a"]);
  });

  it("derives the same summary from a report as from the chunks", () => {
    const evidence = [chunk("a", "Photosynthesis converts light energy into chemical energy stored as glucose")];
    const answer = "Photosynthesis converts light energy into chemical energy.";
    const fromReport = faithfulnessFromReport(evaluateGrounding(answer, evidence));
    const fromChunks = computeFaithfulness(answer, [
      { ...retrieved("a", evidence[0].text) },
    ]);
    expect(fromReport.score).toBe(fromChunks.score);
    expect(fromReport.supportedClaims).toEqual(fromChunks.supportedClaims);
  });
});

describe("hallucination detection", () => {
  it("reports nothing when faithfulness could not be measured", () => {
    const result = detectHallucination("Some answer.", [retrieved("a", "text")], {
      score: null,
      supportedClaims: [],
      unsupportedClaims: ["The sample reached 900 degrees during the second trial"],
      supportRatio: 0,
    });
    // No measurement means no accusation.
    expect(result.present).toBe(false);
    expect(result.unsupportedRatio).toBe(0);
  });

  it("flags a claim that states several specific values the evidence does not contain", () => {
    const result = detectHallucination(
      "Some answer.",
      [retrieved("a", "text")],
      {
        score: 0,
        supportedClaims: [],
        // The policy requires more than one figure before calling a claim
        // fabricated: a single number is often a legitimate restatement.
        unsupportedClaims: ["The reactor reached 900 degrees during the second trial at 14 atmospheres"],
        supportRatio: 0,
      },
    );
    expect(result.present).toBe(true);
    expect(result.flaggedClaims).toHaveLength(1);
    expect(result.unsupportedRatio).toBe(1);
  });

  it("does not accuse a claim on a single figure", () => {
    const result = detectHallucination(
      "Some answer.",
      [retrieved("a", "text")],
      {
        score: 0,
        supportedClaims: [],
        unsupportedClaims: ["The reactor reached 900 degrees during the second trial run"],
        supportRatio: 0,
      },
    );
    expect(result.present).toBe(false);
    expect(result.unsupportedRatio).toBe(1);
  });
});
