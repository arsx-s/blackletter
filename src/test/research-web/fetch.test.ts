import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultResearchPolicy, fetchSource } from "../../research/web";

/**
 * Transfer limits. Every test here asserts a refusal path, because the failure
 * modes of a fetch layer are the dangerous ones: following a redirect, keeping
 * half a document, or hanging forever.
 */

const policy = (overrides: Partial<Parameters<typeof defaultResearchPolicy>[0]> = {}) =>
  defaultResearchPolicy({ allowedHosts: ["example.gov"], ...overrides });

function html(body: string, init: { status?: number; contentType?: string; extraHeaders?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/html; charset=utf-8", ...(init.extraHeaders ?? {}) },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("fetchSource", () => {
  it("returns the body for a readable response", async () => {
    const fetchImpl = vi.fn(async () => html("<title>T</title><p>Hello</p>"));
    const outcome = await fetchSource("https://example.gov/report", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 42 });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.page.body).toContain("Hello");
    expect(outcome.page.contentType).toBe("text/html");
    expect(outcome.page.fetchedAt).toBe(42);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("manual");
    expect(init.credentials).toBe("omit");
  });

  it("never follows a redirect", async () => {
    const fetchImpl = vi.fn(async () => ({ type: "opaqueredirect", status: 0 }) as unknown as Response);
    const outcome = await fetchSource("https://example.gov/moved", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("redirect-blocked");
    expect(outcome.reason).toContain("redirect");
  });

  it("does not fetch at all when the url is refused", async () => {
    const fetchImpl = vi.fn();
    const outcome = await fetchSource("https://10.0.0.1/admin", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("private-address");
    expect(fetchImpl).not.toHaveBeenCalled();

    const plaintext = await fetchSource("http://example.gov/x", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(plaintext.ok).toBe(false);
    if (!plaintext.ok) expect(plaintext.code).toBe("insecure");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-text content type instead of guessing", async () => {
    const fetchImpl = vi.fn(async () => html("binary", { contentType: "application/pdf" }));
    const outcome = await fetchSource("https://example.gov/file.pdf", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("content-type");
    expect(outcome.reason).toContain("application/pdf");
  });

  it("refuses a missing content type", async () => {
    const fetchImpl = vi.fn(async () => {
      const response = new Response("body", { status: 200 });
      response.headers.delete("content-type");
      return response;
    });
    const outcome = await fetchSource("https://example.gov/x", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("content-type");
  });

  it("refuses an http error without reading the body as a document", async () => {
    const fetchImpl = vi.fn(async () => html("<h1>Not found</h1>", { status: 404 }));
    const outcome = await fetchSource("https://example.gov/missing", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("http-error");
    expect(outcome.reason).toContain("404");
  });

  it("refuses a body that declares more bytes than the cap", async () => {
    const fetchImpl = vi.fn(async () => html("small", { extraHeaders: { "content-length": "5000000" } }));
    const outcome = await fetchSource("https://example.gov/huge", { policy: policy({ maxBytes: 1000 }), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("too-large");
      expect(outcome.reason).toContain("1000");
    }
  });

  it("refuses a body that exceeds the cap mid-stream, and does not keep a fragment", async () => {
    const chunks = [new Uint8Array(600).fill(65), new Uint8Array(600).fill(66)];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { headers: { "content-type": "text/plain" } }));
    const outcome = await fetchSource("https://example.gov/big", { policy: policy({ maxBytes: 1000 }), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("too-large");
  });

  it("reports a timeout as a timeout, not as a cancellation", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const outcome = await fetchSource("https://example.gov/slow", { policy: policy({ timeoutMs: 20 }), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("timeout");
    expect(outcome.reason).toContain("20ms");
  });

  it("reports an operator cancellation as a cancellation", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const pending = fetchSource("https://example.gov/slow", { policy: policy({ timeoutMs: 5000 }), fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("cancelled");
  });

  it("reports an already-cancelled signal before opening anything", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
        }),
    );
    const outcome = await fetchSource("https://example.gov/x", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("cancelled");
  });

  it("reports a network failure with a bounded message and no secret", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connection refused: " + "x".repeat(500));
    });
    const outcome = await fetchSource("https://example.gov/x", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("network");
    expect(outcome.reason.length).toBeLessThanOrEqual(200);
  });

  it("refuses an empty body rather than reporting an empty success", async () => {
    const fetchImpl = vi.fn(async () => html("   \n  "));
    const outcome = await fetchSource("https://example.gov/blank", { policy: policy(), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("empty");
  });
});
