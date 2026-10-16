import { describe, expect, it } from "vitest";
import { cancelTask, createTask, pauseTask, resumeTask, type TaskRecord } from "../../tasks";
import {
  MAX_SCHEDULE_MINUTES,
  MAX_SCHEDULE_RUNS,
  MIN_SCHEDULE_MINUTES,
  STALE_TASK_MS,
  addMilestone,
  approvalStatus,
  approveMilestone,
  cancelProject,
  classifyToolFailure,
  createProject,
  createTaskForMilestone,
  goalChangedMilestoneIds,
  grantPermission,
  hasSecret,
  milestoneViews,
  pauseProject,
  projectProgress,
  recordScheduleRun,
  redactSecrets,
  resumeProject,
  retryDecision,
  revokeGrant,
  scheduleDue,
  setNotification,
  setSchedule,
  statesForIds,
  storedText,
  updateGoal,
  type Project,
  type ProjectActionResult,
  type ProjectTaskPort,
} from "../../projects";

/**
 * Mission 11's contract, tested where it can actually be broken: creating a task
 * for a milestone, pausing and cancelling the work, approving a checkpoint,
 * spending a budget, revoking a grant, changing the goal, and recording a
 * schedule. The task machine runs for real through a recording port; only the
 * task store is faked, so a test can set a task's status without pretending to
 * execute one.
 */

const T0 = 1_700_000_000_000;

function makePort(): {
  port: ProjectTaskPort;
  tasks: Map<string, TaskRecord>;
  calls: string[];
  patch: (id: string, changes: Partial<TaskRecord>) => void;
} {
  const tasks = new Map<string, TaskRecord>();
  const calls: string[] = [];
  const port: ProjectTaskPort = {
    create: (request) => {
      calls.push("create");
      return createTask(request);
    },
    save: (task) => {
      calls.push(`save:${task.id}`);
      tasks.set(task.id, task);
      return task;
    },
    pause: (task, options) => {
      calls.push(`pause:${task.id}`);
      return pauseTask(task, options);
    },
    resume: (task, options) => {
      calls.push(`resume:${task.id}`);
      return resumeTask(task, options);
    },
    cancel: (task, options) => {
      calls.push(`cancel:${task.id}`);
      return cancelTask(task, options);
    },
    byId: (id) => tasks.get(id) ?? null,
  };
  const patch = (id: string, changes: Partial<TaskRecord>): void => {
    const task = tasks.get(id);
    if (!task) throw new Error(`no task ${id}`);
    tasks.set(id, { ...task, ...changes });
  };
  return { port, tasks, calls, patch };
}

function must<T>(result: ProjectActionResult<T>, context = ""): { project: Project; value: T } {
  if (!result.ok) throw new Error(`${context} expected ok, got ${result.code}: ${result.reason}`);
  return { project: result.project, value: result.value };
}

/** A refusal that recorded itself carries the new project; otherwise keep the old one. */
function keep(project: Project, result: ProjectActionResult<unknown>): Project {
  return result.ok ? result.project : result.project ?? project;
}

function twoMilestones(budget?: { maxTasks?: number; maxToolCalls?: number; deadlineAt?: number }): Project {
  return must(
    createProject({
      workspaceId: "w1",
      title: "Coolant loop report",
      goal: "Document what happened in the coolant loop incident",
      at: T0,
      milestones: [
        { id: "mA", title: "Gather the logs", deliverable: "A list of log excerpts", acceptanceCriteria: ["Every claim names a log line"] },
        { id: "mB", title: "Write the summary", dependsOn: ["mA"] },
      ],
      budget,
    }),
  ).project;
}

describe("projects: creating work", () => {
  it("requires a title and a goal, and redacts a credential pasted into either", () => {
    const refused = createProject({ workspaceId: "w1", title: "", goal: "something", at: T0 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("invalid-input");

    const created = must(
      createProject({
        workspaceId: "w1",
        title: "Keys",
        goal: "Rotate OPENROUTER_API_KEY=sk-abcdefgh12345678 before Friday",
        at: T0,
      }),
    );
    expect(created.project.goal.text).not.toContain("sk-abcdefgh12345678");
    expect(created.project.goal.text).toContain("[redacted]");
    expect(hasSecret("sk-abcdefgh12345678")).toBe(true);
  });

  it("creates a task only when the dependencies are complete, and records the refusal", () => {
    const { port } = makePort();
    let project = twoMilestones();

    const early = createTaskForMilestone(project, { milestoneId: "mB", level: 1, actionKey: "k-b", at: T0 }, { port });
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.code).toBe("dependency-incomplete");
      expect(early.project).toBeDefined();
    }
    project = keep(project, early);
    expect(project.events.some((event) => event.kind === "refused")).toBe(true);
    // A refused attempt spends nothing: the key is still free for a later retry.
    expect(project.appliedActions).not.toContain("k-b");

    const first = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = first.project;
    expect(first.value.task.goal).toContain('milestone "Gather the logs"');
    // The milestone's acceptance criteria become the task's stated constraints.
    expect(first.value.task.constraints).toContain("Every claim names a log line");
    expect(first.value.task.plan.successCriteria.length).toBeGreaterThan(0);
    expect(project.milestones[0].taskId).toBe(first.value.task.id);
    expect(project.milestones[0].taskGoalVersion).toBe(1);
    expect(project.events.some((event) => event.kind === "task-created")).toBe(true);
  });

  it("blocks a dependent when its dependency failed", () => {
    const { port, patch } = makePort();
    let project = twoMilestones();
    const first = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = first.project;
    patch(first.value.task.id, { status: "FAILED" });

    const blocked = createTaskForMilestone(project, { milestoneId: "mB", level: 1, actionKey: "k-b", at: T0 }, { port });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("dependency-failed");
    project = keep(project, blocked);
    const view = milestoneViews(project, (id) => port.byId(id), T0).find((entry) => entry.id === "mB");
    expect(view?.state).toBe("blocked");
    expect(view?.reason).toContain("failed");
  });

  it("refuses a second live task for one milestone, and a repeated action key", () => {
    const { port, tasks } = makePort();
    let project = twoMilestones();
    const first = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = first.project;

    const repeated = createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 + 1 }, { port });
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("duplicate-action");

    const second = createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a2", at: T0 + 1 }, { port });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("duplicate-task");
    expect(tasks.size).toBe(1);
  });

  it("stops creating tasks when the project budget or the deadline is spent", () => {
    const { port, patch } = makePort();
    let project = twoMilestones({ maxTasks: 1, maxToolCalls: 40 });
    const first = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = first.project;
    patch(first.value.task.id, { status: "COMPLETED" });

    const overBudget = createTaskForMilestone(project, { milestoneId: "mB", level: 1, actionKey: "k-b", at: T0 }, { port });
    expect(overBudget.ok).toBe(false);
    if (!overBudget.ok) expect(overBudget.code).toBe("budget-exhausted");
    project = keep(project, overBudget);
    expect(project.events.some((event) => event.detail.includes("task budget"))).toBe(true);

    // The tool-call budget is arithmetic over the linked tasks, and it stops creation too.
    let withCalls = twoMilestones({ maxTasks: 6, maxToolCalls: 3 });
    const a = must(createTaskForMilestone(withCalls, { milestoneId: "mA", level: 1, actionKey: "ka", at: T0 }, { port }));
    withCalls = a.project;
    patch(a.value.task.id, { status: "COMPLETED", spend: { ...a.value.task.spend, toolCalls: 3 } });
    const spent = createTaskForMilestone(withCalls, { milestoneId: "mB", level: 1, actionKey: "kb", at: T0 }, { port });
    expect(spent.ok).toBe(false);
    if (!spent.ok) expect(spent.reason).toContain("tool call");

    // The deadline stops creation outright.
    const late = createTaskForMilestone(twoMilestones({ deadlineAt: T0 - 1 }), { milestoneId: "mA", level: 1, actionKey: "k-late", at: T0 }, { port });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.code).toBe("deadline-passed");
  });

  it("passes exactly the project's grants to a new task, never a default", () => {
    const { port } = makePort();
    let project = twoMilestones();
    project = must(grantPermission(project, { permission: "workspace:read" }, { at: T0 })).project;
    const created = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    expect(created.value.task.grants).toEqual(["workspace:read"]);
  });

  it("validates a new milestone: an unknown dependency is refused", () => {
    const project = twoMilestones();
    const bad = addMilestone(project, { title: "Later", dependsOn: ["mZ"] }, { at: T0 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("mZ");
    const good = must(addMilestone(project, { title: "Later", dependsOn: ["mA"], acceptanceCriteria: ["Names a date"] }, { at: T0 }));
    expect(good.value.dependsOn).toEqual(["mA"]);
    expect(good.project.milestones).toHaveLength(3);
  });
});

describe("projects: checkpoints", () => {
  function checkpointProject(): Project {
    return must(
      createProject({
        workspaceId: "w1",
        title: "Sign-off",
        goal: "Approve the report",
        at: T0,
        milestones: [{ id: "m1", title: "Operator sign-off", checkpoint: true }],
      }),
    ).project;
  }

  it("refuses to start a checkpoint milestone without a current approval", () => {
    const { port } = makePort();
    const project = checkpointProject();
    const refused = createTaskForMilestone(project, { milestoneId: "m1", level: 1, actionKey: "k1", at: T0 }, { port });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("checkpoint-missing");
    expect(approvalStatus(project, "m1", T0)).toBe("missing");
  });

  it("treats an expired approval as no approval, and accepts a fresh one", () => {
    const { port } = makePort();
    let project = checkpointProject();
    const approved = must(approveMilestone(project, { milestoneId: "m1", note: "read it", ttlMs: 1000, at: T0 }, { actionKey: "ap1" }));
    project = approved.project;
    expect(approved.value.expiresAt).toBe(T0 + 1000);
    expect(approvalStatus(project, "m1", T0 + 500)).toBe("approved");
    expect(approvalStatus(project, "m1", T0 + 1001)).toBe("expired");

    const expired = createTaskForMilestone(project, { milestoneId: "m1", level: 1, actionKey: "k1", at: T0 + 1001 }, { port });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.code).toBe("checkpoint-missing");
      expect(expired.reason).toContain("expired");
    }
    project = keep(project, expired);
    const view = milestoneViews(project, () => null, T0 + 1001).find((entry) => entry.id === "m1");
    expect(view?.state).toBe("approval-needed");
    expect(view?.reason).toContain("expired");

    project = must(approveMilestone(project, { milestoneId: "m1", note: "read it again", ttlMs: 60_000, at: T0 + 2000 }, { actionKey: "ap2" })).project;
    const ok = must(createTaskForMilestone(project, { milestoneId: "m1", level: 1, actionKey: "k2", at: T0 + 2001 }, { port }));
    expect(ok.value.task.id).toBeTruthy();
  });

  it("uses the default TTL and refuses a duplicate approval key", () => {
    const project = checkpointProject();
    const first = must(approveMilestone(project, { milestoneId: "m1", at: T0, actionKey: "same" }));
    expect(first.value.expiresAt).toBe(T0 + 24 * 60 * 60 * 1000);
    // The key lives on the updated project: idempotency is about the stored state.
    const again = approveMilestone(first.project, { milestoneId: "m1", at: T0, actionKey: "same" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("duplicate-action");
    const withOrdinary = must(addMilestone(project, { title: "Ordinary" }, { at: T0 }));
    const refused = approveMilestone(withOrdinary.project, { milestoneId: withOrdinary.value.id, at: T0 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("not-a-checkpoint");
  });
});

describe("projects: pause, resume, cancel, revoke", () => {
  function projectWithTask(port: ProjectTaskPort): { project: Project; taskId: string } {
    let project = twoMilestones();
    const created = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = created.project;
    return { project, taskId: created.value.task.id };
  }

  it("cancels every live task and leaves finished ones alone", () => {
    const { port, patch, tasks } = makePort();
    let project = must(
      createProject({
        workspaceId: "w1",
        title: "Two tracks",
        goal: "Cancel one track, keep the finished one",
        at: T0,
        milestones: [
          { id: "mDone", title: "Finished track" },
          { id: "mLive", title: "Live track" },
        ],
      }),
    ).project;
    const done = must(createTaskForMilestone(project, { milestoneId: "mDone", level: 1, actionKey: "k-done", at: T0 }, { port }));
    project = done.project;
    const live = must(createTaskForMilestone(project, { milestoneId: "mLive", level: 1, actionKey: "k-live", at: T0 + 1 }, { port }));
    project = live.project;
    patch(done.value.task.id, { status: "COMPLETED" });

    const cancelled = must(cancelProject(project, { reason: "the incident report was dropped", at: T0 + 2 }, { port }));
    expect(cancelled.value.changed).toEqual([live.value.task.id]);
    expect(cancelled.value.skipped).toHaveLength(1);
    expect(tasks.get(done.value.task.id)?.status).toBe("COMPLETED");
    expect(tasks.get(live.value.task.id)?.status).toBe("CANCELLED");
    expect(cancelled.project.events.some((event) => event.kind === "cancelled")).toBe(true);
  });

  it("pauses and resumes, and reports what it skipped", () => {
    const { port, tasks } = makePort();
    const { project, taskId } = projectWithTask(port);
    const paused = must(pauseProject(project, { at: T0 + 1 }, { port }));
    expect(paused.value.changed).toEqual([taskId]);
    expect(tasks.get(taskId)?.status).toBe("PAUSED");

    const resumed = must(resumeProject(paused.project, { at: T0 + 2 }, { port }));
    expect(resumed.value.changed).toEqual([taskId]);
    expect(tasks.get(taskId)?.status).toBe("RUNNING");

    const again = must(resumeProject(resumed.project, { at: T0 + 3 }, { port }));
    expect(again.value.changed).toEqual([]);
    expect(again.value.skipped[0].reason).toContain("not paused");
  });

  it("pauses a task whose permission was revoked, and records it", () => {
    const { port, tasks } = makePort();
    let project = twoMilestones();
    project = must(grantPermission(project, { permission: "compute:local" }, { at: T0 })).project;
    const created = must(createTaskForMilestone(project, { milestoneId: "mA", level: 2, actionKey: "k-a", at: T0 }, { port }));
    project = created.project;
    expect(created.value.task.grants).toEqual(["compute:local"]);

    const revoked = must(revokeGrant(project, { permission: "compute:local", at: T0 + 1 }, { port }));
    expect(revoked.value.revoked).toBe(true);
    expect(revoked.value.pausedTaskIds).toEqual([created.value.task.id]);
    expect(revoked.project.grants).toEqual([]);
    // The task keeps its own record of what it held; it is stopped, not rewritten.
    expect(tasks.get(created.value.task.id)?.grants).toEqual(["compute:local"]);
    expect(tasks.get(created.value.task.id)?.status).toBe("PAUSED");
    expect(revoked.project.events.some((event) => event.kind === "grant-revoked")).toBe(true);

    const again = must(revokeGrant(revoked.project, { permission: "compute:local", at: T0 + 2 }, { port }));
    expect(again.value.revoked).toBe(false);
  });

  it("refuses to resume a task planned against an older goal, and allows an explicit re-plan", () => {
    const { port, tasks } = makePort();
    let project = twoMilestones();
    const created = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
    project = created.project;
    project = must(pauseProject(project, { at: T0 + 1 }, { port })).project;

    const changed = must(updateGoal(project, { text: "Document the incident and the pump replacement", at: T0 + 2 }));
    project = changed.project;
    expect(changed.value.version).toBe(2);
    expect(goalChangedMilestoneIds(project)).toEqual(["mA"]);

    const resumed = must(resumeProject(project, { at: T0 + 3 }, { port }));
    expect(resumed.value.changed).toEqual([]);
    expect(resumed.value.skipped[0].reason).toContain("obsolete plan");
    expect(tasks.get(created.value.task.id)?.status).toBe("PAUSED");

    // Re-planning is explicit: cancel the obsolete task, then create a new one.
    project = must(cancelProject(resumed.project, { at: T0 + 4 }, { port })).project;
    const replanned = must(createTaskForMilestone(project, { milestoneId: "mA", level: 1, actionKey: "k-a2", at: T0 + 5 }, { port }));
    expect(replanned.value.replannedFromGoalVersion).toBe(1);
    expect(replanned.project.milestones[0].taskGoalVersion).toBe(2);
    expect(replanned.project.events.some((event) => event.detail.includes("Replanned against goal version 2"))).toBe(true);
  });
});

describe("projects: progress", () => {
  it("reports the five words with a reason for each state", () => {
    const { port, patch } = makePort();
    let project = must(
      createProject({
        workspaceId: "w1",
        title: "Mixed",
        goal: "Show every state",
        at: T0,
        milestones: [
          { id: "done", title: "Done" },
          { id: "next", title: "Ready", dependsOn: ["done"] },
          { id: "later", title: "Pending", dependsOn: ["next"] },
          { id: "gate", title: "Checkpoint", checkpoint: true },
        ],
      }),
    ).project;
    const created = must(createTaskForMilestone(project, { milestoneId: "done", level: 1, actionKey: "k-done", at: T0 }, { port }));
    project = created.project;
    patch(created.value.task.id, { status: "COMPLETED" });

    const views = milestoneViews(project, (id) => port.byId(id), T0);
    const states = statesForIds(views, ["done", "next", "later", "gate"]);
    expect(states).toEqual(["completed", "ready", "pending", "approval-needed"]);
    for (const view of views) expect(view.reason.length).toBeGreaterThan(0);

    const progress = projectProgress(project, (id) => port.byId(id), T0);
    expect(progress.counts.completed).toBe(1);
    expect(progress.counts.ready).toBe(1);
    expect(progress.counts.pending).toBe(1);
    expect(progress.counts["approval-needed"]).toBe(1);
    expect(progress.tasksCreated).toBe(1);
    expect(progress.budgetRemaining.tasks).toBe(project.budget.maxTasks - 1);
    expect(progress.deadlinePassed).toBe(false);
  });

  it("flags a linked task that has gone quiet, and stops flagging it once it moves", () => {
    const { port, patch } = makePort();
    const { project, taskId } = (() => {
      const p = twoMilestones();
      const created = must(createTaskForMilestone(p, { milestoneId: "mA", level: 1, actionKey: "k-a", at: T0 }, { port }));
      return { project: created.project, taskId: created.value.task.id };
    })();

    patch(taskId, { updatedAt: T0 - STALE_TASK_MS - 1 });
    const staleRead = milestoneViews(project, (id) => port.byId(id), T0);
    expect(staleRead[0].stale).toBe(true);
    expect(projectProgress(project, (id) => port.byId(id), T0).staleTaskIds).toEqual([taskId]);

    patch(taskId, { updatedAt: T0 - 1000 });
    expect(milestoneViews(project, (id) => port.byId(id), T0)[0].stale).toBe(false);
    expect(projectProgress(project, (id) => port.byId(id), T0).staleTaskIds).toEqual([]);
  });
});

describe("projects: schedule", () => {
  it("is off until an operator turns it on with an acknowledgement", () => {
    let project = twoMilestones();
    expect(project.schedule.enabled).toBe(false);
    expect(scheduleDue(project, T0)).toBe(false);

    const unacknowledged = setSchedule(project, { enabled: true, everyMinutes: 30, acknowledged: false, at: T0, actionKey: "s1" });
    expect(unacknowledged.ok).toBe(false);
    if (!unacknowledged.ok) expect(unacknowledged.code).toBe("schedule-needs-acknowledgement");
    expect(project.schedule.enabled).toBe(false);

    project = must(setSchedule(project, { enabled: true, everyMinutes: 30, maxRuns: 2, acknowledged: true, at: T0, actionKey: "s2" })).project;
    expect(project.schedule.enabled).toBe(true);
    expect(scheduleDue(project, T0)).toBe(true);
    expect(project.events.some((event) => event.detail.includes("Nothing starts by itself"))).toBe(true);
  });

  it("clamps the interval and the run count", () => {
    const project = twoMilestones();
    const low = must(setSchedule(project, { enabled: true, everyMinutes: 1, maxRuns: 99, acknowledged: true, at: T0, actionKey: "low" }));
    expect(low.value.everyMinutes).toBe(MIN_SCHEDULE_MINUTES);
    expect(low.value.maxRuns).toBe(MAX_SCHEDULE_RUNS);
    const high = must(setSchedule(project, { enabled: true, everyMinutes: 99_999, acknowledged: true, at: T0, actionKey: "high" }));
    expect(high.value.everyMinutes).toBe(MAX_SCHEDULE_MINUTES);
  });

  it("records runs idempotently, refuses a run that is not due, and stops at the cap", () => {
    let project = twoMilestones();
    project = must(setSchedule(project, { enabled: true, everyMinutes: 15, maxRuns: 2, acknowledged: true, at: T0, actionKey: "s" })).project;

    const notEnabled = recordScheduleRun(twoMilestones(), { at: T0, actionKey: "run0" });
    expect(notEnabled.ok).toBe(false);
    if (!notEnabled.ok) expect(notEnabled.code).toBe("schedule-not-enabled");

    project = must(recordScheduleRun(project, { at: T0, actionKey: "run1" })).project;
    expect(project.schedule.runsDone).toBe(1);

    const duplicate = recordScheduleRun(project, { at: T0, actionKey: "run1" });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("duplicate-action");

    const tooSoon = recordScheduleRun(project, { at: T0 + 5 * 60_000, actionKey: "run2" });
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.code).toBe("schedule-not-due");

    project = must(recordScheduleRun(project, { at: T0 + 16 * 60_000, actionKey: "run3" })).project;
    expect(project.schedule.runsDone).toBe(2);
    const exhausted = recordScheduleRun(project, { at: T0 + 32 * 60_000, actionKey: "run4" });
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.code).toBe("schedule-exhausted");

    project = must(setSchedule(project, { enabled: false, acknowledged: false, at: T0 + 33 * 60_000, actionKey: "s-off" })).project;
    const off = recordScheduleRun(project, { at: T0 + 34 * 60_000, actionKey: "run5" });
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.code).toBe("schedule-not-enabled");
  });
});

describe("projects: notifications", () => {
  it("toggles the in-app channel and refuses the ones this build cannot use", () => {
    const project = twoMilestones();
    const enabled = must(setNotification(project, { channelId: "in-app", enabled: true, at: T0 }));
    expect(enabled.value.channels.find((entry) => entry.id === "in-app")?.enabled).toBe(true);

    const webhook = setNotification(project, { channelId: "webhook", enabled: true, at: T0 });
    expect(webhook.ok).toBe(false);
    if (!webhook.ok) {
      expect(webhook.code).toBe("unknown-channel");
      expect(webhook.reason).toContain("unavailable");
    }
    const missing = setNotification(project, { channelId: "carrier-pigeon", enabled: true, at: T0 });
    expect(missing.ok).toBe(false);
  });
});

describe("projects: retry policy", () => {
  it("separates a transient failure from a deterministic one and from a decision", () => {
    expect(classifyToolFailure("timeout")).toBe("transient");
    expect(classifyToolFailure("error")).toBe("deterministic");
    expect(classifyToolFailure("error", "ETIMEDOUT")).toBe("transient");
    expect(classifyToolFailure("error", "rate-limited")).toBe("transient");
    expect(classifyToolFailure("error", "no-such-document")).toBe("deterministic");
    expect(classifyToolFailure("denied")).toBe("operator");
    expect(classifyToolFailure("needs-approval")).toBe("operator");
    expect(classifyToolFailure("cancelled")).toBe("operator");
  });

  it("backs off exponentially inside the task's retry budget, and stops at it", () => {
    const first = retryDecision({ status: "timeout", attempts: 1, maxRetries: 2 });
    expect(first.retry).toBe(true);
    expect(first.delayMs).toBe(500);
    expect(retryDecision({ status: "timeout", attempts: 2, maxRetries: 2 }).delayMs).toBe(1000);
    const spent = retryDecision({ status: "timeout", attempts: 3, maxRetries: 2 });
    expect(spent.retry).toBe(false);
    expect(spent.reason).toContain("retries are spent");
    expect(retryDecision({ status: "error", attempts: 1, maxRetries: 2 }).retry).toBe(false);
    expect(retryDecision({ status: "denied", attempts: 1, maxRetries: 2 }).retry).toBe(false);
    expect(retryDecision({ status: "ok", attempts: 1, maxRetries: 2 }).reason).toContain("Nothing to retry");
  });
});

describe("projects: redaction", () => {
  it("replaces credential shapes and counts them", () => {
    const result = redactSecrets("Authorization: Bearer abcdefgh12345678 and AKIAIOSFODNN7EXAMPLE");
    expect(result.redacted).toBe(2);
    expect(result.text).not.toContain("abcdefgh12345678");
    expect(result.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.text).toContain("[redacted]");
  });

  it("leaves ordinary prose alone and truncates at the bound", () => {
    const clean = redactSecrets("The pump failed at 03:14 because the seal was rated for fewer cycles.");
    expect(clean.redacted).toBe(0);
    const stored = storedText("x".repeat(300), 100);
    expect(stored.text).toHaveLength(101); // 100 characters plus the ellipsis
    expect(stored.truncated).toBe(true);
    expect(storedText("  several    spaces  ", 100).text).toBe("several spaces");
  });
});
