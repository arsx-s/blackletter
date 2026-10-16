import { describe, it, expect, vi, afterEach } from "vitest";
import { streamOpenRouter } from "../../providers/openrouter";
import { linkAbort } from "../../lib/cancellation";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

/** A fetch that only ever settles when its signal aborts. */
function hangingFetch() {
  const calls: number[] = [];
  const mock = vi.fn((_url: unknown, init?: RequestInit) => {
    calls.push(Date.now());
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return { count: () => calls.length };
}

async function drain(iterator: AsyncGenerator<string, void, unknown>) {
  while (!(await iterator.next()).done) {
    /* discard */
  }
}

describe("linkAbort", () => {
  it("reports a caller cancellation", () => {
    const external = new AbortController();
    const link = linkAbort(external.signal, 60_000);
    expect(link.reason).toBeNull();

    external.abort();

    expect(link.signal.aborted).toBe(true);
    expect(link.reason).toBe("cancelled");
    link.dispose();
  });

  it("reports a timeout distinctly from a cancellation", () => {
    const link = linkAbort(undefined, 5);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(link.reason).toBe("timeout");
        expect(link.signal.aborted).toBe(true);
        link.dispose();
        resolve();
      }, 30);
    });
  });

  it("treats a non-positive budget as 'no timeout'", () => {
    const link = linkAbort(undefined, 0);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(link.reason).toBeNull();
        expect(link.signal.aborted).toBe(false);
        link.dispose();
        resolve();
      }, 20);
    });
  });

  it("aborts immediately when the external signal is already aborted", () => {
    const external = new AbortController();
    external.abort();
    const link = linkAbort(external.signal, 60_000);
    expect(link.signal.aborted).toBe(true);
    expect(link.reason).toBe("cancelled");
    link.dispose();
  });

  it("stops listening after dispose", () => {
    const external = new AbortController();
    const link = linkAbort(external.signal, 60_000);
    link.dispose();
    external.abort();
    expect(link.reason).toBeNull();
    expect(link.signal.aborted).toBe(false);
  });
});

describe("streamOpenRouter cancellation", () => {
  it("refuses to issue a request when the signal is already aborted", async () => {
    const { count } = hangingFetch();
    const controller = new AbortController();
    controller.abort();

    await expect(drain(streamOpenRouter("hi", undefined, "openai/gpt-4o-mini", undefined, undefined, controller.signal)))
      .rejects.toMatchObject({ code: "CANCELLED" });
    expect(count()).toBe(0);
  });

  it("aborts the in-flight request and does not retry", async () => {
    const { count } = hangingFetch();
    const controller = new AbortController();

    const iterator = streamOpenRouter("hi", undefined, "openai/gpt-4o-mini", undefined, undefined, controller.signal);
    const pending = iterator.next();

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(count()).toBe(1);
  });

  it("reports a cancellation as CANCELLED, never as TIMEOUT", async () => {
    hangingFetch();
    const controller = new AbortController();
    const iterator = streamOpenRouter("hi", undefined, "openai/gpt-4o-mini", undefined, undefined, controller.signal);
    const pending = iterator.next();
    controller.abort();

    let captured: unknown;
    try {
      await pending;
    } catch (error) {
      captured = error;
    }
    expect((captured as { code?: string })?.code).toBe("CANCELLED");
    expect((captured as { code?: string })?.code).not.toBe("TIMEOUT");
  });

  it("still reports a genuine timeout as TIMEOUT and retries exactly once", async () => {
    vi.useFakeTimers();
    const { count } = hangingFetch();

    const run = drain(streamOpenRouter("hi", undefined, "openai/gpt-4o-mini"));
    const settled = expect(run).rejects.toMatchObject({ code: "TIMEOUT" });

    // First attempt times out at 60s, then the backoff elapses and a second
    // attempt runs and times out as well.
    await vi.advanceTimersByTimeAsync(61_000);
    await vi.advanceTimersByTimeAsync(6_000);
    await vi.advanceTimersByTimeAsync(61_000);

    await settled;
    expect(count()).toBe(2);
  });

  it("completes normally when not cancelled", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n"));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

    const chunks: string[] = [];
    for await (const chunk of streamOpenRouter("hi")) chunks.push(chunk);
    expect(chunks.join("")).toBe("hello");
  });
});
