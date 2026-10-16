import { describe, it, expect, afterEach, vi } from "vitest";
import {
  checkOllamaHealth,
  inspectOllamaModel,
  listOllamaModels,
  streamOllama,
} from "../../providers/ollama";
import { CancelledError } from "../../lib/cancellation";
import { resetProviderSelection, setProviderSelection } from "../../providers/selection";

const BASE = "http://127.0.0.1:11434";

afterEach(() => {
  resetProviderSelection();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fetch double that records every call and answers from a handler. */
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function ndjsonResponse(events: unknown[]): Response {
  const body = events.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n") + "\n";
  return new Response(body, { status: 200 });
}

function content(text: string) {
  return { message: { role: "assistant", content: text }, done: false };
}

async function expectFailure(gen: AsyncGenerator<string, void, unknown>): Promise<string> {
  try {
    for await (const _ of gen) {
      /* drain */
    }
  } catch (e) {
    return (e as { code?: string }).code ?? "NO_CODE";
  }
  throw new Error("expected the generator to fail");
}

async function collect(gen: AsyncGenerator<string, void, unknown>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

describe("streamOllama", () => {
  it("streams NDJSON content in order from the local runtime", async () => {
    const { calls, fetchImpl } = mockFetch(() =>
      ndjsonResponse([content("Hel"), content("lo"), { done: true, done_reason: "stop" }]),
    );

    const chunks = await collect(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));

    expect(chunks.join("")).toBe("Hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/chat`);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.model).toBe("m");
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("sends a system instruction as the first message when given", async () => {
    const { calls, fetchImpl } = mockFetch(() => ndjsonResponse([content("ok"), { done: true }]));
    await collect(streamOllama({ prompt: "q", systemInstruction: "be brief", model: "m", baseUrl: BASE, fetchImpl }));
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "q" },
    ]);
  });

  it("retries exactly once for an unreachable runtime, then reports it", async () => {
    const { calls, fetchImpl } = mockFetch(() => {
      throw new TypeError("connection refused");
    });
    const onRetry = vi.fn();

    const code = await expectFailure(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl, onRetry }));

    expect(code).toBe("OLLAMA_UNREACHABLE");
    expect(calls).toHaveLength(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Nothing was sent anywhere but this machine.
    for (const call of calls) expect(call.url.startsWith(BASE)).toBe(true);
  });

  it("recovers when the retry succeeds", async () => {
    let attempt = 0;
    const { fetchImpl } = mockFetch(() => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("connection refused");
      return ndjsonResponse([content("recovered"), { done: true }]);
    });

    const chunks = await collect(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));

    expect(chunks.join("")).toBe("recovered");
    expect(attempt).toBe(2);
  });

  it("reports a missing model without retrying and without downloading anything", async () => {
    const { calls, fetchImpl } = mockFetch(
      () => new Response(JSON.stringify({ error: "model 'm' not found" }), { status: 404 }),
    );

    const code = await expectFailure(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));

    expect(code).toBe("MODEL_NOT_FOUND");
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("pull"))).toBe(false);
  });

  it("classifies an oversized prompt as a context overflow, not a generic 400", async () => {
    const { calls, fetchImpl } = mockFetch(
      () => new Response("prompt is too long for the context window", { status: 400 }),
    );

    const code = await expectFailure(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));

    expect(code).toBe("CONTEXT_OVERFLOW");
    expect(calls).toHaveLength(1);
  });

  it("reports malformed output as malformed instead of passing it off as an answer", async () => {
    const { fetchImpl } = mockFetch(() => ndjsonResponse(["<html>not json</html>", "still not json"]));
    const code = await expectFailure(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));
    expect(code).toBe("MALFORMED_RESPONSE");
  });

  it("reports an empty stream as empty, and mentions the output limit when it hit one", async () => {
    const empty = mockFetch(() => ndjsonResponse([{ done: true, done_reason: "stop" }]));
    expect(await expectFailure(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl: empty.fetchImpl }))).toBe("EMPTY");

    const limited = mockFetch(() => ndjsonResponse([{ done: true, done_reason: "length" }]));
    try {
      await collect(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl: limited.fetchImpl }));
      throw new Error("expected failure");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("EMPTY");
      expect((e as { message?: string }).message).toContain("output limit");
    }
  });

  it("refuses an unusable base URL without contacting anything", async () => {
    const { calls, fetchImpl } = mockFetch(() => ndjsonResponse([content("no")]));
    const code = await expectFailure(
      streamOllama({ prompt: "hi", model: "m", baseUrl: "http://192.168.1.20:11434", fetchImpl }),
    );
    expect(code).toBe("LOCAL_PROVIDER_MISCONFIGURED");
    expect(calls).toHaveLength(0);
  });

  it("permits a non-loopback runtime only with the explicit opt-in", async () => {
    const { calls, fetchImpl } = mockFetch(() => ndjsonResponse([content("lan"), { done: true }]));
    const chunks = await collect(
      streamOllama({ prompt: "hi", model: "m", baseUrl: "http://192.168.1.20:11434", allowNonLoopback: true, fetchImpl }),
    );
    expect(chunks.join("")).toBe("lan");
    expect(calls[0].url).toBe("http://192.168.1.20:11434/api/chat");
  });

  it("refuses to run without a configured model", async () => {
    const { calls, fetchImpl } = mockFetch(() => ndjsonResponse([content("no")]));
    const code = await expectFailure(streamOllama({ prompt: "hi", model: "   ", baseUrl: BASE, fetchImpl }));
    expect(code).toBe("MODEL_NOT_CONFIGURED");
    expect(calls).toHaveLength(0);
  });

  it("throws CancelledError for an already-cancelled request, without calling fetch", async () => {
    const { calls, fetchImpl } = mockFetch(() => ndjsonResponse([content("no")]));
    const controller = new AbortController();
    controller.abort();

    await expect(
      collect(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl, signal: controller.signal })),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(calls).toHaveLength(0);
  });

  it("reports a timeout distinctly from a cancellation", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    let settled: string | null = null;
    let failed = false;
    const pending = (async () => {
      try {
        await collect(streamOllama({ prompt: "hi", model: "m", baseUrl: BASE, fetchImpl }));
      } catch (e) {
        failed = true;
        settled = (e as { code?: string }).code ?? "NO_CODE";
      }
    })();

    // Let the request start, then run the clock past the local timeout.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(200_000);
    await pending;

    expect(failed).toBe(true);
    expect(settled).toBe("TIMEOUT");
  });
});

describe("ollama diagnostics", () => {
  it("checks the runtime version with a bodyless GET", async () => {
    const { calls, fetchImpl } = mockFetch(() => new Response(JSON.stringify({ version: "0.3.1" }), { status: 200 }));
    const health = await checkOllamaHealth({ baseUrl: BASE, fetchImpl });
    expect(health).toEqual({ ok: true, version: "0.3.1" });
    expect(calls[0].url).toBe(`${BASE}/api/version`);
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("reports an unreachable runtime for the health check", async () => {
    const { fetchImpl } = mockFetch(() => {
      throw new TypeError("refused");
    });
    const health = await checkOllamaHealth({ baseUrl: BASE, fetchImpl });
    expect(health.ok).toBe(false);
    expect(health.code).toBe("OLLAMA_UNREACHABLE");
  });

  it("lists installed models and pulls nothing", async () => {
    const { calls, fetchImpl } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            models: [
              {
                name: "qwen2:7b",
                size: 4_400_000_000,
                modified_at: "2026-01-02T03:04:05Z",
                details: { family: "qwen2", parameter_size: "7B", quantization_level: "Q4_K_M" },
              },
              { model: "llama3:8b" },
              { note: "no name" },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await listOllamaModels({ baseUrl: BASE, fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.models.map((m) => m.name)).toEqual(["qwen2:7b", "llama3:8b"]);
    expect(result.models[0]).toMatchObject({ family: "qwen2", parameterSize: "7B", quantization: "Q4_K_M" });
    expect(calls[0].url).toBe(`${BASE}/api/tags`);
    expect(calls.some((c) => c.url.includes("pull"))).toBe(false);
  });

  it("copies the runtime's own capability report for one model", async () => {
    const { calls, fetchImpl } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            capabilities: ["completion", "tools"],
            details: { family: "qwen2", parameter_size: "7B", quantization_level: "Q4_K_M" },
            model_info: { "qwen2.context_length": 32768 },
          }),
          { status: 200 },
        ),
    );

    const result = await inspectOllamaModel("qwen2:7b", { baseUrl: BASE, fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.evidence).toMatchObject({
      model: "qwen2:7b",
      runtimeCapabilities: ["completion", "tools"],
      contextLength: 32768,
      parameterSize: "7B",
    });
    expect(calls[0].url).toBe(`${BASE}/api/show`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ model: "qwen2:7b" });
  });

  it("reports an unknown model on inspection rather than inventing capabilities", async () => {
    const { fetchImpl } = mockFetch(() => new Response("no such model", { status: 404 }));
    const result = await inspectOllamaModel("nope", { baseUrl: BASE, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MODEL_NOT_FOUND");
    expect(result.evidence).toBeUndefined();
  });

  it("refuses diagnostics against a non-loopback runtime without the opt-in", async () => {
    const { calls, fetchImpl } = mockFetch(() => new Response("{}", { status: 200 }));
    const health = await checkOllamaHealth({ baseUrl: "http://10.0.0.7:11434", fetchImpl });
    expect(health.ok).toBe(false);
    expect(health.code).toBe("LOCAL_PROVIDER_MISCONFIGURED");
    expect(calls).toHaveLength(0);
  });

  it("takes the base URL from the selection when none is passed", async () => {
    setProviderSelection({ ollamaBaseUrl: "http://127.0.0.1:11500" });
    const { calls, fetchImpl } = mockFetch(() => new Response(JSON.stringify({ version: "1" }), { status: 200 }));
    await checkOllamaHealth({ fetchImpl });
    expect(calls[0].url).toBe("http://127.0.0.1:11500/api/version");
  });
});
