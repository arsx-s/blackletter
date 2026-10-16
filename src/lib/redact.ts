/**
 * Credential redaction.
 *
 * The rule the pack sets — secrets come from a broker or the environment, and
 * never end up in a task plan, a project goal or a log — only holds if text the
 * operator (or a model) can paste into a stored field is checked before it is
 * stored. This module is that check: a small closed set of credential shapes is
 * replaced, everything stored goes through it, and a stored value that still
 * looks like a credential is a bug, not a leak waiting to happen.
 *
 * It lives in `lib` because more than one module stores operator text (projects,
 * and the control plane's stop reason). It is not a security boundary against a
 * determined human — it is a boundary against the ordinary accident (a key
 * copied into a goal field, an API token in a milestone title) and it counts what
 * it removed.
 */

export interface RedactionResult {
  text: string;
  /** How many distinct matches were replaced. Zero means nothing looked like a credential. */
  redacted: number;
}

/** The replacement marker. Deliberately visible: a redaction should be legible. */
export const REDACTED = "[redacted]";

interface Pattern {
  name: string;
  regex: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const PATTERNS: readonly Pattern[] = [
  {
    name: "openrouter-style-key",
    regex: /\bsk-[A-Za-z0-9_-]{8,}\b/g,
    replace: () => REDACTED,
  },
  {
    name: "public-key",
    regex: /\bpk-[A-Za-z0-9_-]{16,}\b/g,
    replace: () => REDACTED,
  },
  {
    name: "bearer-token",
    regex: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
    replace: () => `Bearer ${REDACTED}`,
  },
  {
    name: "aws-access-key",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replace: () => REDACTED,
  },
  {
    name: "assigned-credential",
    regex: /\b([A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD))\s*[:=]\s*\S+/g,
    replace: (_match, name) => `${name}=${REDACTED}`,
  },
];

/** True when any pattern matches. Used by tests and by the store as a last check. */
export function hasSecret(text: string): boolean {
  return PATTERNS.some((pattern) => {
    pattern.regex.lastIndex = 0;
    return pattern.regex.test(text);
  });
}

/** Replace every credential-shaped match, counting replacements. */
export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let redacted = 0;
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    out = out.replace(pattern.regex, (...args: unknown[]) => {
      redacted += 1;
      const groups = args.slice(1, -2).map((value) => String(value ?? ""));
      return pattern.replace(String(args[0]), ...groups);
    });
  }
  return { text: out, redacted };
}

/**
 * The form everything user-supplied stored in a project goes through: redact,
 * collapse whitespace, and cap the length. The cap is the schema bound, so a
 * pasted document cannot inflate the store.
 */
export function storedText(text: string, maxChars: number): { text: string; redacted: number; truncated: boolean } {
  const { text: clean, redacted } = redactSecrets(text.trim().replace(/\s+/g, " "));
  if (clean.length <= maxChars) return { text: clean, redacted, truncated: false };
  return { text: clean.slice(0, maxChars).trimEnd() + "…", redacted, truncated: true };
}
