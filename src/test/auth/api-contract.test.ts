import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamOpenRouter } from "../../providers/openrouter";

function sseChunks(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
      controller.close();
    },
  });
}

function sseResponse(events: Array<{ role: string; content?: string }>): Response {
  const lines: string[] = [];
  for (const ev of events) {
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: ev }] })}`);
  }
  lines.push("data: [DONE]");
  return new Response(sseChunks(lines), { status: 200 });
}

describe("frontend → /api/chat auth contract", () => {
  const originalFetch = globalThis.fetch;
  let calls: Array<{ url: string; init: RequestInit }> = [];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return sseResponse([{ role: "assistant", content: "CSS " }, { role: "assistant", content: "is styling." }]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls ONLY the local /api/chat endpoint", async () => {
    const chunks: string[] = [];
    for await (const c of streamOpenRouter("Explain CSS", "Be brief", "openai/gpt-4o-mini", 0.3, 200)) chunks.push(c);
    expect(chunks.join("")).toBe("CSS is styling.");
    expect(calls.length).toBe(1);
    expect(calls[0].url.endsWith("/api/chat")).toBe(true);
    expect(calls[0].url).not.toMatch(/openrouter\.ai|generativelanguage|anthropic\.com|api\.openai/);
  });

  it("NEVER sends an Authorization header or any API key", async () => {
    for await (const _ of streamOpenRouter("Explain CSS")) { /* drain */ }
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers.Authorization ?? headers.authorization).toBeUndefined();
    const body = JSON.parse(String(calls[0].init.body));
    expect(JSON.stringify(body)).not.toMatch(/key|token|secret|sk-|Bearer/i);
    expect(body.prompt).toBe("Explain CSS");
    expect(body.model).toBeDefined();
  });

  it("parses choices[0].delta.content from OpenRouter SSE", async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { role: "assistant", content: "a" },
        { role: "assistant", content: "b" },
        { role: "assistant", content: "c" },
      ])) as typeof fetch;
    const chunks: string[] = [];
    for await (const c of streamOpenRouter("hi")) chunks.push(c);
    expect(chunks.join("")).toBe("abc");
  });

  it("surfaces server error codes (NO_KEY) instead of generic failures", async () => {
    globalThis.fetch = (async () =>
      new Response(
        sseChunks([`data: ${JSON.stringify({ error: { code: "NO_KEY", message: "key missing" } })}`]),
        { status: 200 },
      )) as typeof fetch;
    await expect(async () => {
      for await (const _ of streamOpenRouter("hi")) { /* drain */ }
    }).rejects.toMatchObject({ code: "NO_KEY" });
  });
});
