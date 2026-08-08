import { describe, it, expect } from "vitest";
import {
  extractConceptHits,
  extractDefinitions,
  extractDerivations,
  extractEntities,
  extractHeadings,
  extractQueryTerms,
  extractRelationshipHits,
  normalizeLabel,
  seedCount,
} from "../../knowledge/extractor";

describe("extractor", () => {
  it("normalizes labels", () => {
    expect(normalizeLabel("CSS Flexbox")).toBe("css flexbox");
    expect(normalizeLabel("React's Hooks!")).toBe("react s hooks");
  });

  it("extracts bold and code concepts with context", () => {
    const hits = extractConceptHits("**Flexbox** is a layout mode. Use `grid-template-columns` for rows.");
    const labels = hits.map((h) => h.label);
    expect(labels).toContain("Flexbox");
    expect(labels).toContain("grid-template-columns");
    expect(hits[0].contexts.length).toBeGreaterThan(0);
  });

  it("extracts definitions", () => {
    const defs = extractDefinitions("A contract is a legally binding agreement between parties. Offer is an invitation to contract.");
    expect(defs.length).toBe(2);
    expect(defs[0].term).toBe("contract");
    expect(defs[0].definition).toContain("legally binding agreement");
  });

  it("extracts people, organizations, cases, laws and events", () => {
    const text = "**Ada Lovelace** worked at the Analytical Institute. The Data Protection Act applies. In 1969, ARPANET was created. See Smith v. Jones.";
    const entities = extractEntities(text);
    const types = Object.fromEntries(entities.map((e) => [e.type, e.label]));
    expect(types.person).toBe("Ada Lovelace");
    expect(types.organization).toBe("Analytical Institute");
    expect(types.law).toBe("Data Protection Act");
    expect(types.case).toBe("Smith v. Jones");
    expect(types.event).toContain("ARPANET");
  });

  it("detects contains and requires relationships", () => {
    const hits = extractRelationshipHits("CSS contains Selectors. React requires Node.");
    const types = hits.map((h) => `${h.source}|${h.target}|${h.type}`);
    expect(types).toContain("CSS|Selectors|contains");
    expect(types).toContain("React|Node|requires");
  });

  it("extracts document headings", () => {
    const headings = extractHeadings("# Introduction\n## Core Concepts\n### Pseudo Classes\n## Conclusion");
    expect(headings.map((h) => h.title)).toEqual(["Introduction", "Core Concepts", "Pseudo Classes", "Conclusion"]);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 2]);
  });

  it("extracts query terms removing stopwords", () => {
    const terms = extractQueryTerms("Explain how React Hooks differ from useState?");
    expect(terms).toContain("react");
    expect(terms).toContain("hooks");
    expect(terms).toContain("usestate");
    expect(terms).not.toContain("explain");
    expect(terms).not.toContain("how");
  });

  it("keeps camelCase query terms intact", () => {
    const terms = extractQueryTerms("what is useState vs useEffect");
    expect(terms).toContain("usestate");
    expect(terms).toContain("useeffect");
  });

  it("builds a complete derivation from text", () => {
    const d = extractDerivations("**Flexbox** is a CSS layout mode. Flexbox requires CSS Grid. **Grid** contains Pseudo Classes.");
    expect(d.nodes.length).toBeGreaterThanOrEqual(3);
    expect(d.nodes.some((n) => n.label === "Flexbox" && n.type === "technology")).toBe(true);
    expect(d.edges.length).toBeGreaterThan(0);
  });

  it("has a substantial seed dictionary", () => {
    expect(seedCount()).toBeGreaterThan(100);
  });
});
