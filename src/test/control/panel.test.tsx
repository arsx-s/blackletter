import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StopControl } from "../../components/app/StopControl";
import { ControlPanel } from "../../components/observability/ControlPanel";
import { createTask, type TaskRecord } from "../../tasks";
import { clearTasks, loadTasks, resetTaskStoreForTests, saveTask, taskById } from "../../tasks/store";
import { isStopEngaged, resetControlForTests } from "../../control";
import { kvPut } from "../../lib/db";

/**
 * The two operator surfaces. The status-bar control is tested on its own (it is
 * mounted by `OperatingSystem`, which is not this mission's file to edit), and the
 * panel against the real store, so the assertions are about the recorded task, not
 * about the text the screen happens to show.
 */

function makeTask(options: { id: string; status?: TaskRecord["status"] } = { id: "t1" }): TaskRecord {
  const created = createTask({
    workspaceId: "w1",
    goal: "Summarise the coolant loop B incident",
    constraints: ["read-only"],
    level: 1,
    grants: ["workspace:read"],
    now: () => 1000,
  });
  if (!created.ok) throw new Error(created.reason);
  return { ...created.task, id: options.id, status: options.status ?? "RUNNING", updatedAt: 1000 };
}

beforeEach(async () => {
  localStorage.clear();
  resetControlForTests();
  resetTaskStoreForTests();
  await clearTasks();
  await loadTasks();
  localStorage.clear();
});

describe("the status-bar stop control", () => {
  test("engages the stop on one press and releases it on a second, separate one", () => {
    render(<StopControl />);

    expect(screen.queryByText("Stopped")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Stop all work/ }));

    expect(isStopEngaged()).toBe(true);
    expect(screen.getByText("Stopped")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Release" }));

    expect(isStopEngaged()).toBe(false);
    expect(screen.getByRole("button", { name: /Stop all work/ })).toBeTruthy();
  });
});

describe("the control panel", () => {
  test("pauses a live task and clears its grants when the operator stops all work", async () => {
    saveTask(makeTask({ id: "t1" }));
    await loadTasks();

    render(<ControlPanel />);
    expect(screen.getByText(/Live tasks \(1\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Stop all work/ }));

    expect(isStopEngaged()).toBe(true);
    expect(taskById("t1")?.status).toBe("PAUSED");
    expect(taskById("t1")?.grants).toEqual([]);
    await screen.findByText(/Stopped\. Paused 1 task/);
    expect(screen.getByRole("button", { name: "Already stopped" })).toBeTruthy();
  });

  test("revokes one task's access without stopping the rest", async () => {
    saveTask(makeTask({ id: "t1" }));
    saveTask(makeTask({ id: "t2" }));
    await loadTasks();

    render(<ControlPanel />);
    const buttons = screen.getAllByRole("button", { name: "Revoke grants" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);

    expect(taskById("t1")?.grants).toEqual([]);
    expect(taskById("t2")?.grants).toEqual(["workspace:read"]);
    expect(isStopEngaged(), "revoking one grant is not a stop").toBe(false);
  });

  test("exports a backup to the box, and refuses one that names a foreign key", async () => {
    await kvPut("tasks", { version: 1, tasks: [] });
    render(<ControlPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Export to the box/ }));
    const box = screen.getByLabelText("Backup payload") as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toContain('"version": 1'));
    expect(box.value).toContain('"tasks"');

    fireEvent.change(box, { target: { value: '{"version":1,"entries":{"not-ours":1}}' } });
    fireEvent.click(screen.getByRole("button", { name: /Restore from the box/ }));
    await screen.findByText(/backup header or key allowlist is invalid/);
  });
});
