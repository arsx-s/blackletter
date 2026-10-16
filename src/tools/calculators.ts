/**
 * Constrained numeric evaluation.
 *
 * The pack allows "read-only calculations or data analysis in a constrained
 * environment". This is that environment: a hand-written recursive-descent
 * parser over numbers, `+ - * / % ^`, parentheses and unary minus, with hard
 * limits on expression length and token count.
 *
 * There is no `eval`, no `new Function`, no property access, no identifiers and
 * no host access of any kind — an expression is a string of arithmetic and
 * nothing else. `alert(1)`, `process.exit()`, `[].constructor` and every other
 * escape hatch are refused as syntax.
 */

/** Longest expression accepted, before parsing. */
export const MAX_EXPRESSION_CHARS = 200;
/** Most tokens accepted, so the parser cannot be made to work without limit. */
export const MAX_EXPRESSION_TOKENS = 60;
/** Most values one summary may cover. */
export const MAX_STAT_VALUES = 500;

type Token = { kind: "number"; value: number } | { kind: "op"; value: string } | { kind: "paren"; value: "(" | ")" };

export type ComputeResult = { ok: true; value: number } | { ok: false; error: string };

function tokenize(expression: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (char === " " || char === "\t" || char === "\n") {
      index++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let digits = "";
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        digits += expression[index];
        index++;
      }
      // One decimal point, at least one digit: `1.2.3` and `.` are refused.
      if ((digits.match(/\./g) ?? []).length > 1 || !/[0-9]/.test(digits)) {
        return { ok: false, error: `"${digits}" is not a number` };
      }
      const value = Number(digits);
      if (!Number.isFinite(value)) return { ok: false, error: `"${digits}" is not a finite number` };
      tokens.push({ kind: "number", value });
      continue;
    }

    if ("+-*/%^".includes(char)) {
      tokens.push({ kind: "op", value: char });
      index++;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index++;
      continue;
    }

    return { ok: false, error: `character "${char}" is not allowed in a calculation` };
  }

  if (tokens.length === 0) return { ok: false, error: "the expression is empty" };
  if (tokens.length > MAX_EXPRESSION_TOKENS) {
    return { ok: false, error: `the expression has more than ${MAX_EXPRESSION_TOKENS} tokens` };
  }
  return { ok: true, tokens };
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const value = this.expression();
    if (this.position !== this.tokens.length) throw new Error("unexpected trailing input");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private expression(): number {
    return this.additive();
  }

  private additive(): number {
    let value = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== "op" || (token.value !== "+" && token.value !== "-")) return value;
      this.position++;
      const right = this.multiplicative();
      value = token.value === "+" ? value + right : value - right;
    }
  }

  private multiplicative(): number {
    let value = this.unary();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== "op" || (token.value !== "*" && token.value !== "/" && token.value !== "%")) return value;
      this.position++;
      const right = this.unary();
      if ((token.value === "/" || token.value === "%") && right === 0) throw new Error("division by zero");
      value = token.value === "*" ? value * right : token.value === "/" ? value / right : value % right;
    }
  }

  private unary(): number {
    const token = this.peek();
    if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
      this.position++;
      const value = this.unary();
      return token.value === "-" ? -value : value;
    }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    const token = this.peek();
    if (token?.kind === "op" && token.value === "^") {
      this.position++;
      // Right-associative, like the mathematical operator: 2^3^2 = 2^9.
      const exponent = this.unary();
      const value = base ** exponent;
      if (!Number.isFinite(value)) throw new Error("the result is not a finite number");
      return value;
    }
    return base;
  }

  private primary(): number {
    const token = this.peek();
    if (!token) throw new Error("the expression ends where a number or ( was expected");
    if (token.kind === "number") {
      this.position++;
      return token.value;
    }
    if (token.kind === "paren" && token.value === "(") {
      this.position++;
      const value = this.expression();
      const closing = this.peek();
      if (!closing || closing.kind !== "paren" || closing.value !== ")") throw new Error("a ( was never closed");
      this.position++;
      return value;
    }
    throw new Error("unexpected operator");
  }
}

/** Evaluate a constrained arithmetic expression. */
export function evaluateExpression(expression: string): ComputeResult {
  const trimmed = (expression ?? "").trim();
  if (trimmed.length === 0) return { ok: false, error: "the expression is empty" };
  if (trimmed.length > MAX_EXPRESSION_CHARS) {
    return { ok: false, error: `the expression is longer than ${MAX_EXPRESSION_CHARS} characters` };
  }

  const tokenized = tokenize(trimmed);
  if (!tokenized.ok) return tokenized;

  try {
    const value = new Parser(tokenized.tokens).parse();
    if (!Number.isFinite(value)) return { ok: false, error: "the result is not a finite number" };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "the expression could not be evaluated" };
  }
}

export interface NumericSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  precision: number;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Summary statistics over a bounded list of numbers. Values are rounded to
 * `precision` decimals so the output is stable and does not expose float noise.
 */
export function summariseNumbers(values: number[], precision = 6): { ok: true; summary: NumericSummary } | { ok: false; error: string } {
  if (!Array.isArray(values) || values.length === 0) return { ok: false, error: "no values were provided" };
  if (values.length > MAX_STAT_VALUES) return { ok: false, error: `more than ${MAX_STAT_VALUES} values were provided` };
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return { ok: false, error: "every value must be a finite number" };
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    return { ok: false, error: "precision must be an integer between 0 and 6" };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    ok: true,
    summary: {
      count: sorted.length,
      sum: round(sum, precision),
      min: round(sorted[0], precision),
      max: round(sorted[sorted.length - 1], precision),
      mean: round(sum / sorted.length, precision),
      median: round(median, precision),
      precision,
    },
  };
}
