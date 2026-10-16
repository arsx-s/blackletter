import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportControlState, parseBackup, restoreControlState, summariseBackup } from "../../control";
import { kvGet, kvPut } from "../../lib/db";

/**
 * Backup and restore, tested with safe test data whose only job is to show that
 * the allowlist holds in both directions and that an invalid payload is refused
 * whole rather than half-applied.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("backup and restore", () => {
  it("exports the allowlisted keys that hold something, and nothing else", async () => {
    await kvPut("tasks", { version: 1, tasks: [] });
    await kvPut("control-stop", { version: 1, state: { engaged: false } });
    localStorage.setItem("someone-elses-key", "not ours");

    const payload = await exportControlState(1000);

    expect(payload.version).toBe(1);
    expect(payload.exportedAt).toBe(1000);
    expect(Object.keys(payload.entries).sort()).toEqual(["control-stop", "tasks"]);
    expect(summariseBackup(payload).keys).toEqual(["control-stop", "tasks"]);
    expect(summariseBackup(payload).bytes).toBeGreaterThan(0);
  });

  it("round-trips: export, wipe, restore, and the data is back", async () => {
    await kvPut("tasks", { version: 1, tasks: ["a"] });
    await kvPut("projects", { version: 1, projects: ["b"] });
    const payload = await exportControlState(1000);

    localStorage.clear();
    expect(await kvGet("tasks")).toBeUndefined();

    const result = await restoreControlState(payload);
    expect(result.restored.sort()).toEqual(["projects", "tasks"]);
    expect(result.refused).toEqual([]);
    expect(result.missing).not.toContain("tasks");
    expect(await kvGet("tasks")).toEqual({ version: 1, tasks: ["a"] });
    expect(await kvGet("projects")).toEqual({ version: 1, projects: ["b"] });
  });

  it("refuses the whole payload when it names a key that is not ours, and writes nothing", async () => {
    await kvPut("tasks", { version: 1, tasks: ["the real one"] });

    const result = await restoreControlState({
      version: 1,
      exportedAt: 1,
      entries: { tasks: { version: 1, tasks: ["replaced?"] }, "someone-elses-key": 1 },
    });

    expect(result.refused).toEqual(["someone-elses-key"]);
    expect(result.restored).toEqual([]);
    expect(await kvGet("tasks"), "a refused payload leaves every key alone").toEqual({ version: 1, tasks: ["the real one"] });
  });

  it("refuses another version whole", async () => {
    await kvPut("tasks", { version: 1, tasks: ["untouched"] });
    const result = await restoreControlState({ version: 2, exportedAt: 1, entries: { tasks: null } });
    expect(result.refused).toEqual(["2"]);
    expect(result.restored).toEqual([]);
    expect(await kvGet("tasks")).toEqual({ version: 1, tasks: ["untouched"] });
  });

  it("refuses an invalid entry shape before writing any key", async () => {
    await kvPut("tasks", { version: 1, tasks: ["preserve"] });
    const result = await restoreControlState({
      version: 1,
      exportedAt: 1,
      entries: { tasks: { version: 1, tasks: "not-an-array" }, projects: { version: 1, projects: [] } },
    });
    expect(result.restored).toEqual([]);
    expect(result.refused).toEqual(["invalid:tasks"]);
    expect(await kvGet("tasks")).toEqual({ version: 1, tasks: ["preserve"] });
    expect(await kvGet("projects")).toBeUndefined();
  });

  it("rolls back the localStorage fallback if a multi-key restore fails", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await kvPut("tasks", { version: 1, tasks: ["old-task"] });
    await kvPut("projects", { version: 1, projects: ["old-project"] });
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === "projects" && value.includes("new-project")) throw new DOMException("quota", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });

    await expect(restoreControlState({
      version: 1,
      exportedAt: 1,
      entries: { tasks: { version: 1, tasks: ["new-task"] }, projects: { version: 1, projects: ["new-project"] } },
    })).rejects.toThrow();
    expect(await kvGet("tasks")).toEqual({ version: 1, tasks: ["old-task"] });
    expect(await kvGet("projects")).toEqual({ version: 1, projects: ["old-project"] });
  });

  it("parses a backup's text, and explains what is wrong with a bad one", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup("[1]")).toEqual({ ok: false, reason: "the payload must be a JSON object" });
    expect(parseBackup('{"version":9,"entries":{}}').ok).toBe(false);
    expect(parseBackup('{"version":1}')).toEqual({ ok: false, reason: "the payload has no entries object" });

    const parsed = parseBackup('{"version":1,"exportedAt":1,"entries":{"tasks":null}}');
    expect(parsed).toEqual({ ok: false, reason: 'the backup entry "tasks" has an invalid shape' });
    expect(parseBackup('{"version":1,"exportedAt":1,"entries":{"tasks":{"version":1,"tasks":[]}}}').ok).toBe(true);
  });
});
