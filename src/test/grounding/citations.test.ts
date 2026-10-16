import { describe, expect, it } from "vitest";
import {
  extractCitationMarkers,
  resolveCitations,
  type EvidenceChunk,
} from "../../pipeline/grounding";

function chunk(id: string, source = "Report"): EvidenceChunk {
  return {
    id,
    source,
    sourceType: "document",
    text: `${id} text`,
    location: {
      documentId: "doc-1",
      documentName: `${source}.pdf`,
      page: 1,
      section: null,
      charStart: 0,
      charEnd: 8,
    },
  };
}

describe("citations: marker extraction", () => {
  it("finds a single marker", () => {
    const markers = extractCitationMarkers("The sample was heated slowly [1].");
    expect(markers).toHaveLength(1);
    expect(markers[0].references).toEqual([1]);
    expect(markers[0].marker).toBe("[1]");
  });

  it("finds a comma list and keeps the order written", () => {
    expect(extractCitationMarkers("See [3,1] for details.")[0].references).toEqual([3, 1]);
    expect(extractCitationMarkers("[1, 2 ,4]")[0].references).toEqual([1, 2, 4]);
  });

  it("expands a range", () => {
    expect(extractCitationMarkers("Widely reported [2-5].")[0].references).toEqual([2, 3, 4, 5]);
  });

  it("refuses an absurd range rather than expanding it", () => {
    // A backwards or enormous range is a defect in the answer; expanding it
    // would manufacture dozens of citations from one typo.
    expect(extractCitationMarkers("[9-2]")[0]).toBeUndefined();
    expect(extractCitationMarkers("[1-99]")[0]).toBeUndefined();
  });

  it("ignores bracketed text that is not a reference", () => {
    expect(extractCitationMarkers("A [note] and a [see 4] are not markers.")).toEqual([]);
  });

  it("reports where each marker sits in the answer", () => {
    const answer = "First [1]. Second [2].";
    const markers = extractCitationMarkers(answer);
    expect(answer.slice(markers[1].charStart)).toMatch(/^\[2\]/);
  });
});

describe("citations: resolution", () => {
  const evidence = [
    { chunk: chunk("a"), score: 0.9 },
    { chunk: chunk("b"), score: 0.1 },
  ];

  it("resolves a marker to the evidence entry it numbers", () => {
    const report = resolveCitations("Heat rises [1].", evidence);
    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].chunkId).toBe("a");
    expect(report.resolved[0].source).toBe("Report");
    expect(report.resolved[0].grounded).toBe(true);
    expect(report.unresolved).toEqual([]);
  });

  it("reports a marker that points past the evidence rather than dropping it", () => {
    const report = resolveCitations("Heat rises [7].", evidence);
    expect(report.resolved).toEqual([]);
    expect(report.unresolved).toEqual([{ marker: "[7]", reference: 7, reason: "no-such-evidence" }]);
  });

  it("flags a citation to evidence that scored below the grounding threshold", () => {
    const report = resolveCitations("Heat rises [2].", evidence);
    expect(report.resolved[0].grounded).toBe(false);
    expect(report.weakCitations).toHaveLength(1);
    expect(report.weakCitations[0].chunkId).toBe("b");
  });

  it("treats an unscored entry as grounded, because no score is not a low score", () => {
    const report = resolveCitations("Heat rises [1].", [{ chunk: chunk("a") }]);
    expect(report.resolved[0].score).toBeNull();
    expect(report.resolved[0].grounded).toBe(true);
    expect(report.weakCitations).toEqual([]);
  });

  it("counts how many judged sentences carried a citation", () => {
    const answer =
      "Photosynthesis converts light energy into chemical energy [1]. " +
      "This second sentence is comfortably long enough to be judged but cites nothing at all. " +
      "A third sentence continues the passage and carries a marker too [2].";
    const report = resolveCitations(answer, evidence);
    expect(report.citedClaimRatio).toBeCloseTo(2 / 3, 3);
  });

  it("reports no ratio when there is nothing worth judging", () => {
    expect(resolveCitations("Short [1].", evidence).citedClaimRatio).toBeNull();
  });

  it("de-duplicates nothing: the same marker twice is two citations", () => {
    const report = resolveCitations("Heat rises [1]. And falls [1].", evidence);
    expect(report.resolved).toHaveLength(2);
  });
});
