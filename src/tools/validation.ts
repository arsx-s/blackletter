/**
 * Argument validation.
 *
 * Validation is deliberately strict and entirely generic: there is one
 * implementation for every tool, driven by the tool's declared field specs.
 * Three properties matter more than convenience:
 *
 *   - **Unknown fields are rejected, not ignored.** A proposal that carries
 *     `{"permissions": ["workspace:write"]}` is refused for that key; arguments
 *     can never grant anything, because they can never reach the gateway as
 *     anything but validated values.
 *   - **No coercion.** `"5"` is not a number, `5` is not a string. A missing
 *     required field is a refusal, not a default.
 *   - **Bounded.** Every string has a maximum length, every number a range,
 *     every array a maximum item count, so a proposal cannot be used to make
 *     the app allocate or scan without limit.
 */

import { fnv1a32, digestValue } from "../lib/hash";
import type { ToolDefinition, ToolFieldSpec } from "./types";

export type ArgumentValidation =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; reason: string };

function fieldFailure(field: ToolFieldSpec, reason: string): { ok: false; reason: string } {
  return { ok: false, reason: `field "${field.name}" ${reason}` };
}

function validateScalar(field: ToolFieldSpec, value: unknown): { ok: true } | { ok: false; reason: string } {
  switch (field.type) {
    case "string": {
      if (typeof value !== "string") return fieldFailure(field, "must be a string");
      const min = field.minLength ?? 0;
      if (value.length < min) return fieldFailure(field, `must be at least ${min} characters`);
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        return fieldFailure(field, `must be at most ${field.maxLength} characters`);
      }
      return { ok: true };
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return fieldFailure(field, "must be a finite number");
      if (field.min !== undefined && value < field.min) return fieldFailure(field, `must be at least ${field.min}`);
      if (field.max !== undefined && value > field.max) return fieldFailure(field, `must be at most ${field.max}`);
      return { ok: true };
    }
    case "string[]": {
      if (!Array.isArray(value)) return fieldFailure(field, "must be an array");
      if (field.maxItems !== undefined && value.length > field.maxItems) {
        return fieldFailure(field, `must contain at most ${field.maxItems} items`);
      }
      if (value.some((item) => typeof item !== "string")) return fieldFailure(field, "must contain only strings");
      return { ok: true };
    }
    case "number[]": {
      if (!Array.isArray(value)) return fieldFailure(field, "must be an array");
      if (field.maxItems !== undefined && value.length > field.maxItems) {
        return fieldFailure(field, `must contain at most ${field.maxItems} items`);
      }
      if (value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
        return fieldFailure(field, "must contain only finite numbers");
      }
      return { ok: true };
    }
  }
}

/**
 * Validate a raw argument object against a tool's declared schema. Returns the
 * validated values (a fresh object containing only declared fields) or a reason
 * that is safe to show and to log.
 */
export function validateArguments(tool: ToolDefinition, raw: unknown): ArgumentValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "arguments must be an object" };
  }

  const record = raw as Record<string, unknown>;
  const known = new Map(tool.schema.input.map((field) => [field.name, field]));

  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      return { ok: false, reason: `unknown argument "${key}" — arguments cannot grant permissions or add fields` };
    }
  }

  const args: Record<string, unknown> = {};
  for (const field of tool.schema.input) {
    const value = record[field.name];
    if (value === undefined) {
      if (field.required) return fieldFailure(field, "is required");
      continue;
    }
    const result = validateScalar(field, value);
    if (!result.ok) return result;
    args[field.name] = value;
  }

  return { ok: true, args };
}

/** Fields whose contents are never copied into the audit trail. */
const CONTENT_FIELDS = new Set(["content", "text", "expression", "passage"]);

/**
 * A short, safe description of the arguments for the audit trail.
 *
 * Ids, numbers and short non-content strings are kept so the operator can see
 * *what* was asked; content-bearing fields are reduced to a digest and a length,
 * so remembering what the app did never means storing what the operator read.
 */
export function summariseArguments(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (CONTENT_FIELDS.has(key)) {
      const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
      parts.push(`${key}=${fnv1a32(text)}(${text.length} chars)`);
      continue;
    }
    if (Array.isArray(value)) {
      parts.push(`${key}=[${value.length} items]`);
      continue;
    }
    if (typeof value === "string") {
      parts.push(`${key}="${value.length > 80 ? `${value.slice(0, 80)}…` : value}"`);
      continue;
    }
    parts.push(`${key}=${String(value)}`);
  }
  return parts.join(" ");
}

/** Stable digest of the call as proposed, used for repetition checks and audit. */
export function proposalDigest(toolName: string, args: Record<string, unknown>): string {
  return digestValue({ tool: toolName, args });
}
