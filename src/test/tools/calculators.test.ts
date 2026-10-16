import { describe, expect, it } from "vitest";
import { MAX_EXPRESSION_CHARS, evaluateExpression, summariseNumbers } from "../../tools/calculators";

describe("constrained calculator", () => {
  it("evaluates arithmetic with the usual precedence", () => {
    expect(evaluateExpression("2+3*4")).toEqual({ ok: true, value: 14 });
    expect(evaluateExpression("(2+3)*4")).toEqual({ ok: true, value: 20 });
    expect(evaluateExpression("10/4")).toEqual({ ok: true, value: 2.5 });
    expect(evaluateExpression("10%3")).toEqual({ ok: true, value: 1 });
    expect(evaluateExpression("2^10")).toEqual({ ok: true, value: 1024 });
    expect(evaluateExpression("-5+2")).toEqual({ ok: true, value: -3 });
    expect(evaluateExpression("3 - -2")).toEqual({ ok: true, value: 5 });
  });

  it("treats ^ as right-associative, like the mathematical operator", () => {
    expect(evaluateExpression("2^3^2")).toEqual({ ok: true, value: 512 });
  });

  it("refuses division by zero rather than returning infinity", () => {
    const result = evaluateExpression("1/0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("division by zero");

    const modulo = evaluateExpression("5%0");
    expect(modulo.ok).toBe(false);
  });

  it("refuses every character that is not part of arithmetic", () => {
    for (const expression of [
      "alert(1)",
      "a+1",
      "process.exit()",
      "1;2",
      '1+"2"',
      "globalThis",
      "1e3",
      "1,2",
      "1.2.3",
      "()",
      "1+",
      "(1+2",
      "1+2)",
    ]) {
      expect(evaluateExpression(expression).ok, expression).toBe(false);
    }
  });

  it("cannot be used to reach the host", () => {
    // The parser has no identifiers, so there is nothing to evaluate but numbers.
    for (const escape of ["this.constructor", "[].filter", "({}).toString", "Number(1)"]) {
      const result = evaluateExpression(escape);
      expect(result.ok, escape).toBe(false);
    }
  });

  it("bounds the expression length and token count", () => {
    expect(evaluateExpression("1".repeat(MAX_EXPRESSION_CHARS + 1)).ok).toBe(false);
    const manyTokens = Array.from({ length: 31 }, () => "1+1").join("+"); // 93 tokens
    const result = evaluateExpression(manyTokens);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tokens");
  });

  it("refuses an empty expression", () => {
    expect(evaluateExpression("").ok).toBe(false);
    expect(evaluateExpression("   ").ok).toBe(false);
  });

  it("refuses a non-finite result", () => {
    const result = evaluateExpression("10^400");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("finite");
  });
});

describe("number summaries", () => {
  it("summarises an odd-length list", () => {
    const result = summariseNumbers([1, 2, 3, 4, 100]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toMatchObject({ count: 5, sum: 110, min: 1, max: 100, mean: 22, median: 3 });
  });

  it("averages the middle pair for an even-length list", () => {
    const result = summariseNumbers([1, 2, 3, 4]);
    expect(result.ok && result.summary.median).toBe(2.5);
  });

  it("rounds to the requested precision", () => {
    const result = summariseNumbers([1, 2, 2], 2);
    expect(result.ok && result.summary.mean).toBe(1.67);
    const whole = summariseNumbers([1, 2, 2], 0);
    expect(whole.ok && whole.summary.mean).toBe(2);
  });

  it("refuses empty, unbounded, non-finite and out-of-range input", () => {
    expect(summariseNumbers([]).ok).toBe(false);
    expect(summariseNumbers(Array.from({ length: 501 }, (_, i) => i)).ok).toBe(false);
    expect(summariseNumbers([1, Number.NaN]).ok).toBe(false);
    expect(summariseNumbers([1, Number.POSITIVE_INFINITY]).ok).toBe(false);
    expect(summariseNumbers([1, 2], 7).ok).toBe(false);
    expect(summariseNumbers([1, 2], -1).ok).toBe(false);
    expect(summariseNumbers([1, 2], 1.5).ok).toBe(false);
  });
});
