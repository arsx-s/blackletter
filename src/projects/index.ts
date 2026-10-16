/**
 * Long-horizon projects: the public surface of `src/projects`.
 *
 * A project owns goals, milestones, deliverables, dependencies, deadlines,
 * acceptance criteria, budgets, grants, checkpoints and a schedule that is off
 * until an operator turns it on. It does not own execution: a milestone is
 * executed by a Mission 9 task, created on request and still bound by the
 * Mission 7 policy gateway for every step. Nothing in this module runs in the
 * background, and nothing here starts by itself.
 */
export * from "./types";
export * from "./redact";
export * from "./retry";
export * from "./derive";
export * from "./actions";
export * from "./store";
