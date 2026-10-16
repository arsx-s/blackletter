import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  engageStop,
  inFlightEntries,
  isStopEngaged,
  loadStop,
  registerInFlight,
  releaseStop,
  resetStopForTests,
  stopSignal,
  stopState,
  subscribeStop,
} from "../../control";

/**
 * The switch itself. What is under test here is deliberately narrow: that the
 * state is what it says, that engaging aborts what is running, that a restart
 * cannot un-stop the application, and that the reason that gets stored is
 * redacted first.
 */

const KEY = "control-stop";

function stored(): { version: number; state: { engaged: boolean; reason: string; by: string; at: number | null } } | null {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

/** `kvPut` is fire-and-forget; this lets it settle before a read. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  localStorage.clear();
  resetStopForTests();
});

describe("the global stop: state and persistence", () => {
  it("starts idle, with a signal that has not fired", () => {
    expect(isStopEngaged()).toBe(false);
    expect(stopState()).toEqual({ engaged: false, reason: "", by: "operator", at: null });
    expect(stopSignal().aborted).toBe(false);
  });

  it("engages, persists, and notifies subscribers", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStop(listener);

    const result = engageStop({ reason: "drill", at: 1000 });

    expect(result.state.engaged).toBe(true);
    expect(isStopEngaged()).toBe(true);
    expect(stopState().reason).toBe("drill");
    expect(stopState().at).toBe(1000);
    expect(stopSignal().aborted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    await flush();
    expect(stored()?.version).toBe(1);
    expect(stored()?.state.engaged).toBe(true);
    expect(stored()?.state.reason).toBe("drill");

    unsubscribe();
    engageStop({ reason: "again", at: 2000 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("comes back engaged after a restart", async () => {
    engageStop({ reason: "the operator stopped all work", at: 1000 });
    await flush();

    resetStopForTests(); // a fresh process: in-memory state gone, storage intact
    expect(isStopEngaged()).toBe(false);

    const loaded = await loadStop();
    expect(loaded.engaged).toBe(true);
    expect(loaded.reason).toBe("the operator stopped all work");
    expect(isStopEngaged()).toBe(true);
    expect(stopSignal().aborted, "work started after a restart must also be refused").toBe(true);
  });

  it("replaces the signal on release, so work after a release is not aborted", () => {
    engageStop({ reason: "drill", at: 1000 });
    const duringStop = stopSignal();
    expect(duringStop.aborted).toBe(true);

    const released = releaseStop({ at: 2000 });
    expect(released.engaged).toBe(false);
    expect(released.at).toBeNull();
    expect(released.releasedAt).toBe(2000);
    expect(duringStop.aborted, "a signal handed out before the release stays aborted").toBe(true);
    expect(stopSignal().aborted).toBe(false);
    expect(stopSignal()).not.toBe(duringStop);
  });

  it("redacts a credential typed into the reason before it is stored", async () => {
    engageStop({ reason: "leaked key sk-or-v1-abcdefghijklmnop please rotate", at: 1000 });
    expect(stopState().reason).toContain("[redacted]");
    expect(stopState().reason).not.toContain("abcdefghijklmnop");

    await flush();
    expect(stored()?.state.reason).not.toContain("abcdefghijklmnop");
  });

  it("refuses a stored record it does not understand, and keeps an idle release time", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, state: { engaged: true, reason: "x", by: "operator", at: 1 } }));
    await loadStop();
    expect(isStopEngaged(), "another version's stop is not this build's stop").toBe(false);

    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, state: { engaged: false, reason: "", by: "operator", at: null, releasedAt: 5000 } }),
    );
    resetStopForTests();
    const loaded = await loadStop();
    expect(loaded.engaged).toBe(false);
    expect(loaded.releasedAt).toBe(5000);
  });
});

describe("the global stop: aborting what is in flight", () => {
  it("aborts every registered operation on engage, and reports how many", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerInFlight({ id: "run-1", label: "a chat run", abort: first });
    registerInFlight({ id: "web-1", label: "a web fetch", abort: second });
    expect(inFlightEntries()).toHaveLength(2);

    const result = engageStop({ reason: "drill", at: 1000 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.abortedInFlight).toBe(2);
  });

  it("does not call an operation that deregistered itself, and survives an abort that throws", () => {
    const gone = vi.fn();
    registerInFlight({ id: "run-1", label: "a finished run", abort: gone })();
    registerInFlight({ id: "run-2", label: "a broken abort", abort: () => { throw new Error("boom"); } });
    const live = vi.fn();
    registerInFlight({ id: "run-3", label: "the live one", abort: live });

    const result = engageStop({ reason: "drill", at: 1000 });
    expect(gone).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalledTimes(1);
    expect(result.abortedInFlight).toBe(1);
    expect(isStopEngaged()).toBe(true);
  });
});
