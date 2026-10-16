/**
 * Project persistence.
 *
 * Same shape as the task store, for the same reason: a project outlives a
 * session, so what is written has a version, what is read is validated, and what
 * is refused is counted instead of guessed at. Two rules are specific to this
 * store:
 *
 *   - **A project is not recovered into a different one.** A task that was
 *     mid-flight is paused by the task store; a project has no in-flight state of
 *     its own — its milestones' states are derived from tasks — so nothing here
 *     is ever "fixed up" on load. A record that does not validate is rejected and
 *     counted, not repaired.
 *   - **The cap drops the least recently touched project, and says so.** There is
 *     no "live" concept to protect, so the rule is simply recency, with the loss
 *     counted in `droppedProjectCount()` and surfaced by the panel.
 */

import { kvDelete, kvGet, kvPut } from "../lib/db";
import { PROJECT_LIMITS, PROJECTS_VERSION, type Project } from "./types";

const KEY = "projects";

let projects: Project[] = [];
let dropped = 0;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeProjects(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Most recently updated first, optionally filtered to one workspace. */
export function projectsFor(workspaceId?: string): readonly Project[] {
  return workspaceId ? projects.filter((project) => project.workspaceId === workspaceId) : projects;
}

export function projectById(id: string): Project | null {
  return projects.find((project) => project.id === id) ?? null;
}

export function droppedProjectCount(): number {
  return dropped;
}

function persist(): void {
  void kvPut(KEY, { version: PROJECTS_VERSION, projects }).catch(() => undefined);
}

/**
 * Bring a stored record up to the current shape.
 *
 * The only field added after the first write is `eventsDropped`; a record that
 * predates it has dropped nothing. Nothing else is inferred: a field that is
 * present but wrong is left for `isProjectRecord` to refuse.
 */
function normalizeProject(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const project = value as Record<string, unknown>;
  if (project.version !== PROJECTS_VERSION) return value;
  if (project.eventsDropped === undefined) return { ...project, eventsDropped: 0 };
  return value;
}

function isProjectRecord(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  if (project.version !== PROJECTS_VERSION) return false;
  if (typeof project.id !== "string" || typeof project.workspaceId !== "string" || typeof project.title !== "string") return false;
  if (!project.goal || typeof project.goal !== "object" || typeof project.goal.text !== "string") return false;
  if (typeof project.goal.version !== "number") return false;
  if (!Array.isArray(project.milestones) || !Array.isArray(project.grants) || !Array.isArray(project.approvals)) return false;
  if (!project.budget || typeof project.budget !== "object" || typeof project.budget.maxTasks !== "number") return false;
  if (typeof project.budget.maxToolCalls !== "number") return false;
  if (!project.schedule || typeof project.schedule !== "object" || typeof project.schedule.enabled !== "boolean") return false;
  if (!Array.isArray(project.notifications) || !Array.isArray(project.appliedActions) || !Array.isArray(project.events)) return false;
  if (typeof project.eventsDropped !== "number") return false;
  if (typeof project.createdAt !== "number" || typeof project.updatedAt !== "number") return false;
  return true;
}

function sortProjects(): void {
  projects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/**
 * Upsert a project, enforcing the cap. The record is frozen on the way in: the
 * event log is history, and history that can be edited is not history.
 */
export function saveProject(project: Project): Project {
  const frozen = Object.freeze({
    ...project,
    milestones: Object.freeze(project.milestones.map((entry) => Object.freeze({ ...entry, dependsOn: Object.freeze([...entry.dependsOn]) }))),
    grants: Object.freeze([...project.grants]),
    approvals: Object.freeze([...project.approvals]),
    notifications: Object.freeze([...project.notifications]),
    appliedActions: Object.freeze([...project.appliedActions]),
    events: Object.freeze([...project.events]),
  }) as Project;

  const existing = projects.findIndex((candidate) => candidate.id === frozen.id);
  projects = existing >= 0 ? projects.map((candidate, index) => (index === existing ? frozen : candidate)) : [frozen, ...projects];
  sortProjects();

  if (projects.length > PROJECT_LIMITS.projects) {
    dropped += projects.length - PROJECT_LIMITS.projects;
    projects = projects.slice(0, PROJECT_LIMITS.projects);
  }

  persist();
  notify();
  return frozen;
}

export function removeProject(id: string): void {
  const before = projects.length;
  projects = projects.filter((project) => project.id !== id);
  if (projects.length !== before) {
    persist();
    notify();
  }
}

export interface LoadProjectsResult {
  loaded: number;
  rejected: number;
}

/** Load persisted projects. Nothing is repaired here; see the module comment. */
export async function loadProjects(): Promise<LoadProjectsResult> {
  if (loaded) return { loaded: projects.length, rejected: 0 };
  loaded = true;

  const stored = await kvGet<unknown>(KEY);
  if (!stored || typeof stored !== "object") return { loaded: 0, rejected: 0 };

  const record = stored as { version?: unknown; projects?: unknown };
  if (record.version !== PROJECTS_VERSION || !Array.isArray(record.projects)) {
    // A payload from another version is left alone rather than half-read.
    return { loaded: 0, rejected: Array.isArray(record.projects) ? record.projects.length : 0 };
  }

  const accepted = record.projects.map(normalizeProject).filter(isProjectRecord);
  projects = accepted;
  sortProjects();
  notify();
  return { loaded: projects.length, rejected: record.projects.length - accepted.length };
}

/**
 * Clear projects, all of them or one workspace's. An idempotency key that was
 * consumed by a deleted project is deleted with it — a resumed project cannot
 * replay it.
 */
export async function clearProjects(workspaceId?: string): Promise<void> {
  if (!workspaceId) {
    projects = [];
    dropped = 0;
    await kvDelete(KEY);
    notify();
    return;
  }
  const before = projects.length;
  projects = projects.filter((project) => project.workspaceId !== workspaceId);
  if (projects.length !== before) {
    persist();
    notify();
  }
}

/** Test seam: forget in-memory state without touching persisted state. */
export function resetProjectStoreForTests(): void {
  projects = [];
  dropped = 0;
  loaded = false;
}
