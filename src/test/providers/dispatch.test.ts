/**
 * Provider dispatch: which of the two adapters a request actually reaches, and
 * the one condition under which a failed local run may be retried remotely.
 *
 * The property under test is that nothing above the provider layer can cause a
 * request to leave the machine unless the operator asked for it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateResponse, generateStream } from "../../providers/provider";
import { resetProviderSelection, setProviderSelection } from "../../providers/selection";
import { CancelledError } from "../../lib/cancellation";

const LOCAL = "http://127.0.0.1:11434";

afterEach(() => {
  resetProviderSelection();
  vi.restoreAllMocks();
});

interface Call {
  url: string;
  init?: RequestInit;
}

function localNdjson(...texts: string[]): Response {
  const body = [...texts.map((t) => JSON.stringify({ message: { content: t }, done: false })), JSON.stringify({ done: true })].join("\n") + "\n";
  return new Response(body, { status: 200 });
}

function relaySse(...texts: string[]): Response {
  const body = texts.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200 });
}

/** Routes by host so a test can fail locally and succeed remotely. */
function routedFetch(local: () => Response | Promise<Response>, remote: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return String(url).startsWith(LOCAL) ? local() : remote();
  }) as unknown as typeof fetch;
  globalThis.fetch = fetchImpl as unknown as typeof fetch;
  return { calls, fetchImpl };
}

async function collect(gen: AsyncGenerator<string, void, unknown>): Promise<string> {
  let text = "";
  for await (const chunk of gen) text += chunk;
  return text;
}

describe("generateStream provider dispatch", () => {
  it("goes remote by default, and reports the remote provider", async () => {
    const { calls } = routedFetch(
      () => localNdjson("local"),
      () => relaySse("remote"),
    );

    const seen: Array<{ provider: string; fallback: boolean }> = [];
    const text = await collect(generateStream({ prompt: "hi", onProvider: (info) => seen.push(info) }));

    expect(text).toBe("remote");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/chat");
    expect(seen).toEqual([{ provider: "openrouter", model: "openai/gpt-4o-mini", fallback: false }]);
  });

  it("runs locally when selected, and never touches the relay", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "qwen2:7b" });
    const { calls } = routedFetch(
      () => localNdjson("local"),
      () => relaySse("remote"),
    );

    const seen: Array<{ provider: string; fallback: boolean }> = [];
    const text = await collect(generateStream({ prompt: "hi", onProvider: (info) => seen.push(info) }));

    expect(text).toBe("local");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${LOCAL}/api/chat`);
    expect(seen).toEqual([{ provider: "ollama", model: "qwen2:7b", fallback: false }]);
  });

  it("fails instead of falling back by default when the local runtime is down", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "qwen2:7b" });
    const { calls } = routedFetch(
      () => {
        throw new TypeError("connection refused");
      },
      () => relaySse("remote"),
    );

    const seen: Array<{ provider: string }> = [];
    await expect(collect(generateStream({ prompt: "hi", onProvider: (info) => seen.push(info) }))).rejects.toMatchObject({
      code: "OLLAMA_UNREACHABLE",
    });

    // Every attempt went to the local runtime; the relay was never asked.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.url.startsWith(LOCAL)).toBe(true);
    expect(seen).toEqual([]);
  });

  it("falls back and says so when the operator allowed it", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "qwen2:7b", remoteFallback: "allow" });
    const { calls } = routedFetch(
      () => {
        throw new TypeError("connection refused");
      },
      () => relaySse("remote"),
    );

    const seen: Array<{ provider: string; fallback: boolean }> = [];
    const text = await collect(generateStream({ prompt: "hi", onProvider: (info) => seen.push(info) }));

    expect(text).toBe("remote");
    expect(calls.some((c) => c.url.startsWith(LOCAL))).toBe(true);
    expect(calls.some((c) => c.url === "/api/chat")).toBe(true);
    expect(seen).toEqual([{ provider: "openrouter", model: "openai/gpt-4o-mini", fallback: true }]);
  });

  it("never falls back for a missing model, even when fallback is allowed", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "ghost:1b", remoteFallback: "allow" });
    const { calls } = routedFetch(
      () => new Response("model not found", { status: 404 }),
      () => relaySse("remote"),
    );

    await expect(collect(generateStream({ prompt: "hi" }))).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
    for (const call of calls) expect(call.url.startsWith(LOCAL)).toBe(true);
  });

  it("refuses a local selection with no model, without sending anything", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "", remoteFallback: "allow" });
    const { calls } = routedFetch(
      () => localNdjson("local"),
      () => relaySse("remote"),
    );

    await expect(collect(generateStream({ prompt: "hi" }))).rejects.toMatchObject({ code: "LOCAL_PROVIDER_MISCONFIGURED" });
    expect(calls).toHaveLength(0);
  });

  it("keeps a cancellation from being treated as a local failure", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "qwen2:7b", remoteFallback: "allow" });
    const controller = new AbortController();
    controller.abort();
    const { calls } = routedFetch(
      () => localNdjson("local"),
      () => relaySse("remote"),
    );

    await expect(collect(generateStream({ prompt: "hi", signal: controller.signal }))).rejects.toBeInstanceOf(CancelledError);
    expect(calls).toHaveLength(0);
  });

  it("reports provider and locality on the non-streaming response", async () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "qwen2:7b" });
    routedFetch(
      () => localNdjson("local answer"),
      () => relaySse("remote"),
    );

    const response = await generateResponse({ prompt: "hi" });

    expect(response.text).toBe("local answer");
    expect(response.provider).toBe("ollama");
    expect(response.local).toBe(true);
    expect(response.fallback).toBe(false);
  });
});
