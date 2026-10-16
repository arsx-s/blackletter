/**
 * Provider capability metadata.
 *
 * The rule this module exists to enforce: **unknown stays unknown**. "Ornith 9B"
 * might or might not be a real Ollama model with tool calling, a 32k context, or
 * vision, and nothing in this repository gets to guess. A capability becomes
 * known in one of exactly two ways:
 *
 *   - the app's own code exercises it, and the capability record says so; or
 *   - the operator asks the local runtime about the model (`/api/show`) and the
 *     evidence is copied in verbatim.
 *
 * Sizes, names and families are never used as evidence: a parameter count says
 * nothing about whether a chat template supports tool calls.
 */

import type { ProviderId } from "./selection";

export type CapabilityValue = boolean | "unknown";

export interface ProviderCapabilities {
  id: ProviderId;
  label: string;
  transport: "local" | "remote";
  /** Plain chat completions. Both providers do this, because the app does it. */
  chat: true;
  /** Incremental streaming. Both providers stream, because the app streams. */
  streaming: true;
  /** Structured output constrained by a schema. Not implemented in the app yet. */
  structuredOutput: CapabilityValue;
  /** Native tool calling. Not implemented in the app yet. */
  toolCalls: CapabilityValue;
  /** Image input. Not implemented in the app yet. */
  vision: CapabilityValue;
  /** Prompt window in tokens, when a runtime told us. */
  contextWindow: number | null;
  /** Where each fact came from, so the panel can show its basis. */
  basis: string[];
}

export function openRouterCapabilities(): ProviderCapabilities {
  return {
    id: "openrouter",
    label: "Remote (OpenRouter)",
    transport: "remote",
    chat: true,
    streaming: true,
    structuredOutput: "unknown",
    toolCalls: "unknown",
    vision: "unknown",
    contextWindow: null,
    basis: [
      "chat and streaming: exercised by every pipeline run through the relay",
      "structured output, tool calls, vision: unknown per model; the app does not request them",
      "the model catalogue is whatever the relay is configured to allow",
    ],
  };
}

export function ollamaCapabilities(): ProviderCapabilities {
  return {
    id: "ollama",
    label: "Local (Ollama)",
    transport: "local",
    chat: true,
    streaming: true,
    structuredOutput: "unknown",
    toolCalls: "unknown",
    vision: "unknown",
    contextWindow: null,
    basis: [
      "chat and streaming: the adapter speaks /api/chat with stream: true",
      "everything else: unknown until the runtime is asked about this exact model",
    ],
  };
}

/** Evidence copied from the local runtime, never inferred. */
export interface ModelEvidence {
  model: string;
  /** Capability names the runtime reported, e.g. ["completion", "tools"]. */
  runtimeCapabilities: string[] | null;
  contextLength: number | null;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  inspectedAt: number;
}

/**
 * Merge runtime evidence into a capability record. `runtimeCapabilities` is a
 * positive list from Ollama: a capability it does not mention stays unknown, and
 * a context length it reports is used as-is.
 */
export function capabilitiesWithEvidence(base: ProviderCapabilities, evidence: ModelEvidence | null): ProviderCapabilities {
  if (!evidence) return base;
  const runtime = evidence.runtimeCapabilities;
  const mentionOf = (name: string): CapabilityValue => (runtime ? runtime.includes(name) : "unknown");
  return {
    ...base,
    structuredOutput: mentionOf("structured_output"),
    toolCalls: mentionOf("tools"),
    vision: mentionOf("vision"),
    contextWindow: evidence.contextLength,
    basis: [
      ...base.basis,
      `model "${evidence.model}" inspected at ${new Date(evidence.inspectedAt).toISOString()}`,
      runtime && runtime.length > 0
        ? `runtime reported capabilities: ${runtime.join(", ")}`
        : "the runtime did not report a capability list for this model",
      evidence.contextLength !== null
        ? `runtime reported a context length of ${evidence.contextLength} tokens`
        : "the runtime did not report a context length",
    ],
  };
}

export function describeCapability(value: CapabilityValue): string {
  return value === "unknown" ? "unknown" : value ? "supported" : "not supported";
}
