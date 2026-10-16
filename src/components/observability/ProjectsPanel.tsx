/**
 * Projects panel — long-horizon work, driven by hand.
 *
 * The panel is a dashboard for the five questions the pack asks: what is done,
 * what is waiting, what is blocked, what failed, and what needs an approval.
 * Every state shown comes from `milestoneViews`, which derives it from the linked
 * mission 9 task, so the panel cannot show progress a restart would contradict.
 *
 * Two rules are visible in the interface, not just in the module:
 *
 *   - **Scheduling is opt-in and inert.** There is no timer in this build. The
 *     schedule records an interval and a cap, the panel says when work is due, and
 *     *the operator* presses the button. Enabling it requires ticking the
 *     acknowledgement box.
 *   - **A checkpoint is a real gate.** A milestone marked as a checkpoint cannot
 *     create a task until an operator approves it, the approval carries an expiry,
 *     and the panel shows when that expiry has passed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Layers, Pause, Play, Plus, Shield, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { AUTONOMY_LEVELS, loadTasks, subscribeTasks, taskById, type AutonomyLevel, type TaskRecord } from "../../tasks";
import type { Permission } from "../../tools/types";
import {
  addMilestone,
  approveMilestone,
  cancelProject,
  createProject,
  createTaskForMilestone,
  droppedProjectCount,
  grantPermission,
  loadProjects,
  milestoneViews,
  pauseProject,
  projectProgress,
  projectsFor,
  recordScheduleRun,
  removeProject,
  resumeProject,
  revokeGrant,
  saveProject,
  scheduleDue,
  setNotification,
  setSchedule,
  subscribeProjects,
  updateGoal,
  type MilestoneView,
  type Project,
  type ProjectActionResult,
} from "../../projects";

const LEVEL_CHOICES: AutonomyLevel[] = [0, 1, 2];
const PERMISSIONS: Permission[] = ["workspace:read", "evidence:read", "compute:local"];
const STATE_LABELS: Record<MilestoneView["state"], string> = {
  completed: "completed",
  pending: "pending",
  ready: "ready",
  "in-progress": "in progress",
  blocked: "blocked",
  failed: "failed",
  "approval-needed": "approval needed",
};

function stateClass(state: MilestoneView["state"]): string {
  switch (state) {
    case "completed":
      return "border-accent/30 text-accent";
    case "failed":
    case "blocked":
      return "border-amber-500/40 text-amber-600";
    case "approval-needed":
      return "border-amber-500/40 text-amber-600";
    case "in-progress":
      return "border-accent/30 text-bone";
    default:
      return "border-border/60 text-muted";
  }
}

function timeOf(at: number): string {
  return new Date(at).toLocaleString();
}

/** A per-interaction key; a retry of a refused action is a new key, by design. */
let actionCounter = 0;
function nextKey(prefix: string): string {
  actionCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${actionCounter.toString(36)}`;
}

export function ProjectsPanel() {
  const state = useWorkspaceStore();
  const workspaceId = state.activeWorkspaceId;

  const [projects, setProjects] = useState<readonly Project[]>(() => projectsFor(workspaceId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setTaskRevision] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [maxTasks, setMaxTasks] = useState(6);
  const [maxToolCalls, setMaxToolCalls] = useState(40);
  const [deadline, setDeadline] = useState("");

  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneCheckpoint, setMilestoneCheckpoint] = useState(false);
  const [milestoneDependsOn, setMilestoneDependsOn] = useState<string[]>([]);
  const [level, setLevel] = useState<AutonomyLevel>(1);
  const [goalDraft, setGoalDraft] = useState("");
  const [scheduleAcknowledged, setScheduleAcknowledged] = useState(false);
  const [scheduleMinutes, setScheduleMinutes] = useState(60);
  const [scheduleMaxRuns, setScheduleMaxRuns] = useState(4);

  useEffect(() => {
    void loadProjects();
    void loadTasks();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeProjects(() => setProjects(projectsFor(workspaceId)));
    setProjects(projectsFor(workspaceId));
    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    // Milestone states are derived from tasks, so a task change re-renders the board.
    const unsubscribe = subscribeTasks(() => setTaskRevision((value) => value + 1));
    return unsubscribe;
  }, []);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected && projects.length > 0) setSelectedId(projects[0].id);
    if (selected && !projects.some((project) => project.id === selected.id)) setSelectedId(projects[0]?.id ?? null);
  }, [projects, selected]);

  useEffect(() => {
    setGoalDraft(selected?.goal.text ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const progress = useMemo(
    () => (selected ? projectProgress(selected, taskById, now) : null),
    // `now` changes every render; the task subscription is what makes this recompute.
    [selected, now],
  );
  const views = useMemo(
    () => (selected ? milestoneViews(selected, taskById, now) : []),
    [selected, now],
  );

  const finish = useCallback(
    <T,>(result: ProjectActionResult<T>, success?: (value: T) => string) => {
      if (result.ok) {
        saveProject(result.project);
        setSelectedId(result.project.id);
        setProblem(null);
        setNotice(success ? success(result.value) : null);
      } else {
        // A refusal that recorded itself carries the updated project; persist that.
        if (result.project) saveProject(result.project);
        setProblem(result.reason);
        setNotice(null);
      }
      setProjects(projectsFor(workspaceId));
    },
    [workspaceId],
  );

  const onCreate = useCallback(() => {
    const result = createProject({
      workspaceId,
      title,
      goal,
      budget: {
        maxTasks,
        maxToolCalls,
        deadlineAt: deadline ? new Date(deadline).getTime() : undefined,
      },
    });
    if (result.ok) {
      setTitle("");
      setGoal("");
      setDeadline("");
    }
    finish(result, (project) => `Created "${project.title}".`);
  }, [deadline, finish, goal, maxTasks, maxToolCalls, title, workspaceId]);

  const onAddMilestone = useCallback(() => {
    if (!selected) return;
    finish(
      addMilestone(
        selected,
        { title: milestoneTitle, checkpoint: milestoneCheckpoint, dependsOn: milestoneDependsOn },
        { actionKey: nextKey("ms") },
      ),
      (milestone) => `Added milestone "${milestone.title}".`,
    );
    setMilestoneTitle("");
    setMilestoneCheckpoint(false);
    setMilestoneDependsOn([]);
  }, [finish, milestoneCheckpoint, milestoneDependsOn, milestoneTitle, selected]);

  const onCreateTask = useCallback(
    (milestoneId: string) => {
      if (!selected) return;
      finish(
        createTaskForMilestone(selected, { milestoneId, level, actionKey: nextKey("task") }),
        (value) => `Created task ${value.task.id}. Open the Tasks panel to run it.`,
      );
    },
    [finish, level, selected],
  );

  const onApprove = useCallback(
    (milestoneId: string) => {
      if (!selected) return;
      finish(
        approveMilestone(selected, { milestoneId, note: "approved in the projects panel", actionKey: nextKey("ap") }),
        () => "Checkpoint approved; the approval expires in 24 hours.",
      );
    },
    [finish, selected],
  );

  if (projects.length === 0 && !selected) {
    return (
      <section className="surface-default rounded-md border border-border/60">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-muted" />
            <h3 className="text-body-sm text-bone">Projects</h3>
            <span className="text-micro text-muted">long-horizon work, one checkpoint at a time</span>
          </div>
        </header>
        <div className="space-y-3 px-4 py-4">
          <p className="text-caption text-muted">
            A project holds a goal, milestones with dependencies and acceptance criteria, a task and tool-call budget, a
            deadline, explicit grants and optional checkpoints. Nothing runs on its own: milestones are executed by tasks you
            create and run from the Tasks panel.
          </p>
          {renderCreateForm()}
          {problem && <Problem text={problem} />}
        </div>
      </section>
    );
  }

  function renderCreateForm() {
    return (
      <div className="rounded-xs border border-border/60 px-3 py-3">
        <p className="text-micro text-muted">New project</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="text-micro text-muted">Title</span>
            <input
              aria-label="Project title"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-micro text-muted">Deadline (optional, stops new tasks)</span>
            <input
              aria-label="Project deadline"
              type="datetime-local"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
        </div>
        <label className="mt-2 block">
          <span className="text-micro text-muted">Goal — what the project is for, and to what standard</span>
          <textarea
            aria-label="Project goal"
            rows={2}
            className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="text-micro text-muted">Task budget (hard cap on tasks this project may create)</span>
            <input
              aria-label="Project task budget"
              type="number"
              min={1}
              max={24}
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={maxTasks}
              onChange={(event) => setMaxTasks(Number(event.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-micro text-muted">Tool-call budget across linked tasks</span>
            <input
              aria-label="Project tool-call budget"
              type="number"
              min={0}
              max={200}
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={maxToolCalls}
              onChange={(event) => setMaxToolCalls(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-xs border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-caption text-accent disabled:opacity-50"
          onClick={onCreate}
          disabled={title.trim().length === 0 || goal.trim().length === 0}
        >
          <Plus size={13} /> Create project
        </button>
      </div>
    );
  }

  return (
    <section className="surface-default rounded-md border border-border/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-muted" />
          <h3 className="text-body-sm text-bone">Projects</h3>
          <span className="text-micro text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"} in this workspace · no timers, no background jobs
          </span>
        </div>
        {droppedProjectCount() > 0 && (
          <span className="text-micro text-muted">· {droppedProjectCount()} older project(s) dropped</span>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        {projects.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  "rounded-xs border px-2 py-1 text-micro",
                  project.id === selected?.id ? "border-accent/40 text-accent" : "border-border/60 text-muted hover:text-bone",
                )}
                onClick={() => {
                  setSelectedId(project.id);
                  setGoalDraft(project.goal.text);
                }}
              >
                {project.title}
              </button>
            ))}
          </div>
        )}

        {selected && progress && (
          <>
            <div className="rounded-xs border border-border/60 px-3 py-2">
              <p className="text-caption text-muted">
                <span className="text-bone">{selected.title}. </span>
                {selected.goal.text}
              </p>
              <p className="mt-1 text-micro text-muted">
                Goal version {selected.goal.version}
                {selected.goal.previousText ? ` · previous: ${selected.goal.previousText.slice(0, 100)}` : ""} · created{" "}
                {timeOf(selected.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass(progress.counts.failed > 0 ? "failed" : "completed"))}>
                  completed {progress.counts.completed}
                </span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("pending"))}>pending {progress.counts.pending}</span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("ready"))}>ready {progress.counts.ready}</span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("in-progress"))}>
                  in progress {progress.counts["in-progress"]}
                </span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("blocked"))}>blocked {progress.counts.blocked}</span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("failed"))}>failed {progress.counts.failed}</span>
                <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass("approval-needed"))}>
                  approval needed {progress.counts["approval-needed"]}
                </span>
              </div>
              <p className="mt-2 text-micro text-muted">
                Tasks created {progress.tasksCreated}/{selected.budget.maxTasks} · tool calls {progress.toolCallsSpent}/
                {selected.budget.maxToolCalls} · deadline{" "}
                {selected.budget.deadlineAt ? timeOf(selected.budget.deadlineAt) : "none"}
                {progress.deadlinePassed ? " (passed — new tasks are refused)" : ""} · not enforced:{" "}
                {selected.budget.unmeasured.join(" and ")} budgets, because nothing in this build measures them.
              </p>
              {progress.staleTaskIds.length > 0 && (
                <p className="mt-1 text-micro text-amber-600">
                  {progress.staleTaskIds.length} linked task(s) have not moved for a while: {progress.staleTaskIds.join(", ")}.
                  They are not failed — they are quiet.
                </p>
              )}
              {progress.goalChangedMilestoneIds.length > 0 && (
                <p className="mt-1 text-micro text-amber-600">
                  {progress.goalChangedMilestoneIds.length} milestone task(s) were planned against an older goal and will not
                  resume; cancel them and create a new task to re-plan.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone"
                onClick={() => finish(pauseProject(selected), () => "Paused the project's live tasks.")}
              >
                <Pause size={13} /> Pause
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone"
                onClick={() => finish(resumeProject(selected), (value) => `Resumed ${value.changed.length} task(s).`)}
              >
                <Play size={13} /> Resume
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone"
                onClick={() => finish(cancelProject(selected), (value) => `Cancelled ${value.changed.length} task(s).`)}
              >
                <X size={13} /> Cancel tasks
              </button>
              <label className="ml-auto flex items-center gap-1.5 text-micro text-muted">
                Autonomy for new tasks
                <select
                  aria-label="Project task autonomy level"
                  className="rounded-xs border border-border/60 bg-background px-1.5 py-1 text-micro text-bone"
                  value={level}
                  onChange={(event) => setLevel(Number(event.target.value) as AutonomyLevel)}
                >
                  {LEVEL_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {AUTONOMY_LEVELS.find((entry) => entry.level === choice)?.label ?? `Level ${choice}`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="text-micro text-muted hover:text-bone"
                onClick={() => {
                  removeProject(selected.id);
                  setSelectedId(null);
                  setProjects(projectsFor(workspaceId));
                }}
              >
                Delete project
              </button>
            </div>

            <div>
              <h4 className="text-micro text-muted">Milestones ({views.length})</h4>
              {views.length === 0 ? (
                <p className="mt-1 text-caption text-muted">No milestones yet. Add one below; it starts with no dependencies.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {views.map((view) => {
                    const milestone = selected.milestones.find((entry) => entry.id === view.id);
                    if (!milestone) return null;
                    const linked: TaskRecord | null = view.taskId ? taskById(view.taskId) : null;
                    const canCreate = linked === null || ["COMPLETED", "FAILED", "CANCELLED"].includes(linked.status);
                    return (
                      <li key={view.id} className="rounded-xs border border-border/60 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stateClass(view.state))}>
                            {STATE_LABELS[view.state]}
                          </span>
                          <span className="text-caption text-bone">{view.title}</span>
                          {milestone.checkpoint && (
                            <span className="text-micro text-muted">
                              checkpoint: {view.approval}
                              {view.approval === "expired" ? " (expired — approve again)" : ""}
                            </span>
                          )}
                          {milestone.dependsOn.length > 0 && (
                            <span className="text-micro text-muted">depends on {milestone.dependsOn.join(", ")}</span>
                          )}
                        </div>
                        <p className="mt-1 text-micro text-muted">{view.reason}</p>
                        {milestone.deliverable && <p className="mt-1 text-micro text-muted">Deliverable: {milestone.deliverable}</p>}
                        {milestone.acceptanceCriteria.length > 0 && (
                          <p className="mt-1 text-micro text-muted">Acceptance: {milestone.acceptanceCriteria.join(" · ")}</p>
                        )}
                        {linked && (
                          <p className="mt-1 font-mono text-micro text-muted">
                            task {linked.id} · {linked.status} · level {linked.level} · {linked.spend.toolCalls}/{linked.budget.maxToolCalls} tool
                            calls{view.goalChanged ? " · planned against an older goal" : ""}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded-xs border border-accent/40 px-2 py-1 text-micro text-accent disabled:opacity-50"
                            onClick={() => onCreateTask(view.id)}
                            disabled={!canCreate || view.state === "pending"}
                          >
                            Create task
                          </button>
                          {milestone.checkpoint && view.approval !== "approved" && (
                            <button
                              type="button"
                              className="rounded-xs border border-border/60 px-2 py-1 text-micro text-muted hover:text-bone"
                              onClick={() => onApprove(view.id)}
                            >
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 size={11} /> Approve checkpoint
                              </span>
                            </button>
                          )}
                          {view.state === "approval-needed" && !milestone.checkpoint && (
                            <span className="text-micro text-muted">Waiting on its task's own approval, in the Tasks panel.</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-3 rounded-xs border border-border/60 px-3 py-2">
                <p className="text-micro text-muted">Add a milestone</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input
                    aria-label="Milestone title"
                    placeholder="Milestone title"
                    className="w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                    value={milestoneTitle}
                    onChange={(event) => setMilestoneTitle(event.target.value)}
                  />
                  <label className="flex items-center gap-2 text-micro text-muted">
                    <input
                      type="checkbox"
                      checked={milestoneCheckpoint}
                      onChange={(event) => setMilestoneCheckpoint(event.target.checked)}
                    />
                    Human checkpoint (blocks its dependents until an operator approves, and the approval expires)
                  </label>
                </div>
                {selected.milestones.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.milestones.map((entry) => (
                      <label key={entry.id} className="flex items-center gap-1.5 text-micro text-muted">
                        <input
                          type="checkbox"
                          checked={milestoneDependsOn.includes(entry.id)}
                          onChange={(event) => {
                            setMilestoneDependsOn((current) =>
                              event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id),
                            );
                          }}
                        />
                        depends on {entry.title}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
                  onClick={onAddMilestone}
                  disabled={milestoneTitle.trim().length === 0}
                >
                  <Plus size={13} /> Add milestone
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xs border border-border/60 px-3 py-2">
                <h4 className="text-micro text-muted">Change the goal</h4>
                <p className="mt-1 text-micro text-muted">
                  Changing the goal bumps its version. Tasks planned against an older version will not resume; cancel them and
                  create new ones to re-plan.
                </p>
                <textarea
                  aria-label="New project goal"
                  rows={2}
                  className="mt-2 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                  value={goalDraft || selected.goal.text}
                  onChange={(event) => setGoalDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="mt-2 rounded-xs border border-border/60 px-2 py-1 text-micro text-muted hover:text-bone"
                  onClick={() =>
                    finish(updateGoal(selected, { text: goalDraft || selected.goal.text }, { at: Date.now() }), (value) =>
                      value.changed ? `Goal is now version ${value.version}.` : "The goal text did not change.",
                    )
                  }
                >
                  Save goal
                </button>
              </div>

              <div className="rounded-xs border border-border/60 px-3 py-2">
                <h4 className="text-micro text-muted">Grants</h4>
                <p className="mt-1 text-micro text-muted">
                  A task inherits exactly these. Revoking one pauses the tasks that held it.
                </p>
                <ul className="mt-2 space-y-1">
                  {PERMISSIONS.map((permission) => {
                    const held = selected.grants.some((grant) => grant.permission === permission);
                    return (
                      <li key={permission} className="flex items-center gap-2">
                        <span className="font-mono text-micro text-bone">{permission}</span>
                        <span className="text-micro text-muted">{held ? "granted" : "not granted"}</span>
                        <button
                          type="button"
                          className="ml-auto rounded-xs border border-border/60 px-2 py-0.5 text-micro text-muted hover:text-bone"
                          onClick={() => {
                            if (held) {
                              finish(revokeGrant(selected, { permission }), () => `Revoked ${permission}.`);
                            } else {
                              finish(grantPermission(selected, { permission }, { at: Date.now() }), () => `Granted ${permission}.`);
                            }
                          }}
                        >
                          {held ? "Revoke" : "Grant"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xs border border-border/60 px-3 py-2">
                <h4 className="flex items-center gap-1.5 text-micro text-muted">
                  <Shield size={11} /> Schedule
                </h4>
                <p className="mt-1 text-micro text-muted">
                  This build has no timer, no background worker and no startup entry. A schedule records an interval and a cap;
                  the board shows when work is due and the operator starts it. Enabling requires the acknowledgement.
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="block">
                    <span className="text-micro text-muted">Every (minutes)</span>
                    <input
                      aria-label="Schedule interval"
                      type="number"
                      min={15}
                      max={1440}
                      className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                      value={scheduleMinutes}
                      onChange={(event) => setScheduleMinutes(Number(event.target.value))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-micro text-muted">At most this many recorded runs</span>
                    <input
                      aria-label="Schedule run cap"
                      type="number"
                      min={1}
                      max={20}
                      className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
                      value={scheduleMaxRuns}
                      onChange={(event) => setScheduleMaxRuns(Number(event.target.value))}
                    />
                  </label>
                </div>
                <label className="mt-2 flex items-start gap-2 text-micro text-muted">
                  <input
                    type="checkbox"
                    checked={scheduleAcknowledged}
                    onChange={(event) => setScheduleAcknowledged(event.target.checked)}
                  />
                  I understand nothing runs on its own: the schedule marks work due, and I start it.
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xs border border-border/60 px-2 py-1 text-micro text-muted hover:text-bone disabled:opacity-50"
                    disabled={selected.schedule.enabled || !scheduleAcknowledged}
                    onClick={() =>
                      finish(
                        setSchedule(selected, {
                          enabled: true,
                          everyMinutes: scheduleMinutes,
                          maxRuns: scheduleMaxRuns,
                          acknowledged: scheduleAcknowledged,
                          actionKey: nextKey("sched"),
                        }),
                        (schedule) => `Schedule enabled: every ${schedule.everyMinutes} minutes, at most ${schedule.maxRuns} runs.`,
                      )
                    }
                  >
                    Enable schedule
                  </button>
                  <button
                    type="button"
                    className="rounded-xs border border-border/60 px-2 py-1 text-micro text-muted hover:text-bone disabled:opacity-50"
                    disabled={!selected.schedule.enabled}
                    onClick={() =>
                      finish(setSchedule(selected, { enabled: false, acknowledged: false, actionKey: nextKey("sched") }), () => "Schedule disabled.")
                    }
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    className="rounded-xs border border-accent/40 px-2 py-1 text-micro text-accent disabled:opacity-50"
                    disabled={!scheduleDue(selected, Date.now())}
                    onClick={() =>
                      finish(recordScheduleRun(selected, { actionKey: nextKey("run") }), (value) => `Recorded run ${value.runsDone}.`)
                    }
                  >
                    Record a run now
                  </button>
                  <span className="text-micro text-muted">
                    {selected.schedule.enabled
                      ? `runs ${selected.schedule.runsDone}/${selected.schedule.maxRuns}${scheduleDue(selected, Date.now()) ? " · due" : " · not due"}`
                      : "disabled"}
                  </span>
                </div>
              </div>

              <div className="rounded-xs border border-border/60 px-3 py-2">
                <h4 className="text-micro text-muted">Notifications</h4>
                <p className="mt-1 text-micro text-muted">
                  Only channels this build can actually deliver through can be switched on. The event log below is always
                  recorded, whether a channel is enabled or not.
                </p>
                <ul className="mt-2 space-y-1">
                  {selected.notifications.map((channel) => (
                    <li key={channel.id} className="flex items-center gap-2">
                      <span className="font-mono text-micro text-bone">{channel.id}</span>
                      <span className="text-micro text-muted">
                        {channel.unavailable ? `unavailable: ${channel.unavailable}` : channel.enabled ? "enabled" : "disabled"}
                      </span>
                      <button
                        type="button"
                        className="ml-auto rounded-xs border border-border/60 px-2 py-0.5 text-micro text-muted hover:text-bone disabled:opacity-50"
                        disabled={Boolean(channel.unavailable)}
                        onClick={() =>
                          finish(
                            setNotification(selected, { channelId: channel.id, enabled: !channel.enabled }),
                            () => `${channel.id} notifications ${channel.enabled ? "disabled" : "enabled"}.`,
                          )
                        }
                      >
                        {channel.enabled ? "Disable" : "Enable"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-caption text-muted hover:text-bone"
                onClick={() => setShowEvents((current) => !current)}
              >
                {showEvents ? "Hide" : "Show"} the project's history ({selected.events.length} event(s)
                {selected.eventsDropped > 0 ? `, ${selected.eventsDropped} dropped` : ""})
              </button>
              {showEvents && (
                <ul className="mt-2 space-y-0.5">
                  {[...selected.events].reverse().map((event, index) => (
                    <li key={`${event.at}-${index}`} className="font-mono text-micro text-muted">
                      {timeOf(event.at)} · {event.kind} · {event.by} · {event.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {notice && <p className="text-caption text-accent">{notice}</p>}
        {problem && <Problem text={problem} />}

        <div className="border-t border-border/60 pt-3">{renderCreateForm()}</div>
      </div>
    </section>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xs border border-amber-500/40 px-3 py-2 text-caption text-amber-600">
      <AlertCircle size={14} className="mt-0.5" /> {text}
    </p>
  );
}
