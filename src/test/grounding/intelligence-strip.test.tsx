import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { IntelligenceStrip } from "../../components/research/IntelligenceStrip";
import { computeConfidence, type ScoredChunk } from "../../pipeline/scoring";
import type { TabIntelligence } from "../../types/workspace";

function chunk(overrides: Partial<ScoredChunk> = {}): ScoredChunk {
  return {
    id: "document-abc123",
    source: "Thermal Report",
    sourceType: "document",
    text: "Thermal conduction through the sample was measured and recorded.",
    position: 0,
    score: 0.9,
    relevance: 0.8,
    coverage: 1,
    sourceQuality: 0.9,
    recency: 0.9,
    positionBias: 1,
    location: {
      documentId: "doc-1",
      documentName: "Thermal Report.pdf",
      page: 3,
      section: null,
      charStart: 100,
      charEnd: 164,
    },
    ...overrides,
  };
}

const UNMEASURED: TabIntelligence = {
  confidence: computeConfidence("q", [], "", {
    score: null,
    supportedClaims: [],
    unsupportedClaims: [],
    supportRatio: 0,
  }),
  faithfulness: {
    score: null,
    supportedClaims: [],
    unsupportedClaims: [],
    supportRatio: 0,
  },
  hallucination: { present: false, flaggedClaims: [], unsupportedRatio: 0 },
  groundingReport: null,
  groundedSources: [],
  retrievedChunks: [],
  trace: [],
  telemetry: null,
};

describe("IntelligenceStrip: nothing measured is shown as nothing measured", () => {
  it("does not invent a confidence band when the score is absent", () => {
    const { container } = render(<IntelligenceStrip intelligence={UNMEASURED} />);
    const text = container.textContent ?? "";

    expect(text).toContain("not measured");
    expect(text).not.toContain("Low");
    expect(text).not.toContain("Medium");
    expect(text).not.toContain("High");
  });

  it("renders no NaN and no dash-shaped number", () => {
    const { container } = render(<IntelligenceStrip intelligence={UNMEASURED} />);
    expect(container.textContent ?? "").not.toMatch(/NaN|undefined|%$/);
  });

  it("explains why the score is absent", () => {
    const { container } = render(<IntelligenceStrip intelligence={UNMEASURED} />);
    expect(container.textContent ?? "").toMatch(/Nothing in this run could be measured/);
  });

  it("renders nothing at all when the tab has no intelligence", () => {
    const { container } = render(<IntelligenceStrip intelligence={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("IntelligenceStrip: evidence is shown with its verification status", () => {
  const withSomethingToSay: TabIntelligence = {
    ...UNMEASURED,
    confidence: computeConfidence(
      "q",
      [chunk()],
      Array.from({ length: 300 }, () => "word").join(" "),
      { score: 1, supportedClaims: ["a claim"], unsupportedClaims: [], supportRatio: 1 },
    ),
    faithfulness: { score: 1, supportedClaims: ["a claim"], unsupportedClaims: [], supportRatio: 1 },
    groundedSources: [
      {
        name: "Thermal Report",
        type: "document",
        chunkCount: 1,
        bestScore: 0.9,
        averageScore: 0.9,
        chunkIds: ["document-abc123"],
        pages: [3],
        locators: [],
      },
    ],
    retrievedChunks: [chunk()],
    groundingReport: {
      claims: [],
      supportedClaims: ["a claim"],
      unsupportedClaims: [],
      unjudgedSentences: [],
      supportRatio: 1,
      citations: {
        markers: [
          { marker: "[1]", references: [1], charStart: 10 },
          { marker: "[2]", references: [2], charStart: 40 },
        ],
        resolved: [
          {
            marker: "[1]",
            reference: 1,
            chunkId: "document-abc123",
            source: "Thermal Report",
            sourceType: "document",
            location: chunk().location!,
            score: 0.9,
            grounded: true,
          },
        ],
        unresolved: [{ marker: "[2]", reference: 2, reason: "no-such-evidence" }],
        citedClaimRatio: 0.5,
        weakCitations: [],
      },
      unverifiable: [],
      withoutEvidence: [],
    },
  };

  it("shows the confidence band only when there is a score", () => {
    const { container } = render(<IntelligenceStrip intelligence={withSomethingToSay} />);
    // Every component is measurable here, so the raw mean is 1.0 — and the
    // display clamp holds the score at the ceiling rather than claiming certainty.
    expect(withSomethingToSay.confidence?.score).toBe(98);
    expect(container.textContent ?? "").toContain("98/100 High");
  });

  it("counts resolved citations against the markers that were written", () => {
    const { container } = render(<IntelligenceStrip intelligence={withSomethingToSay} />);
    expect(container.textContent ?? "").toContain("1/2 resolved");
  });

  it("names citation markers that point at evidence which does not exist", () => {
    const { container } = render(<IntelligenceStrip intelligence={withSomethingToSay} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/1 citation\(s\) point at evidence that does not exist/);
    expect(text).toContain("[2]");
  });

  it("lists a resolved citation with its page", () => {
    const { container } = render(<IntelligenceStrip intelligence={withSomethingToSay} />);
    const toggles = [...container.querySelectorAll("button")];
    const citationsToggle = toggles.find((button) => button.textContent?.includes("Citations"));
    expect(citationsToggle).toBeDefined();
    fireEvent.click(citationsToggle!);
    expect(container.textContent ?? "").toContain("Thermal Report.pdf, page 3");
  });

  it("labels a chunk with no locator as unverified rather than as evidence", () => {
    const legacy = { ...chunk({ id: "legacy-1" }), location: undefined } as unknown as ScoredChunk;
    const { container } = render(
      <IntelligenceStrip
        intelligence={{
          ...withSomethingToSay,
          retrievedChunks: [legacy],
          groundingReport: null,
          groundedSources: [],
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("0/1");
    expect(text).toMatch(/1 chunk\(s\) could not be reproduced from their source/);
  });
});
