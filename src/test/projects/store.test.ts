import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_LIMITS,
  clearProjects,
  createProject,
  droppedProjectCount,
  loadProjects,
  projectById,
  projectsFor,
  removeProject,
  resetProjectStoreForTests,
  saveProject,
  subscribeProjects,
  type Project,
} from "../../projects";

/**
 * A project outlives the session that created it, so the store is tested for the
 * things persistence gets wrong: a payload written by another version, a record
 * that does not validate, a field added after the first release, and the cap.
 * Nothing here is repaired silently — a rejected record is counted.
 */

const KEY = "projects";
const T0 = 1_700_000_000_000;

function makeProject(index: number, workspaceId = "w1"): Project {
  const result = createProject({
    workspaceId,
    title: `Project ${index}`,
    goal: `Reach goal ${index}`,
    at: T0 + index,
    milestones: [{ id: `ms-${index}`, title: "First step" }],
  });
  if (!result.ok) throw new Error(result.reason);
  return result.project;
}

beforeEach(async () => {
  localStorage.clear();
  resetProjectStoreForTests();
  await clearProjects();
  localStorage.clear();
});

describe("project store", () => {
  it("saves a project, replaces it by id, notifies subscribers, and removes it", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjects(listener);
    const project = makeProject(1);

    saveProject(project);
    expect(projectsFor("w1")).toHaveLength(1);
    expect(projectById(project.id)?.title).toBe("Project 1");
    expect(listener).toHaveBeenCalledTimes(1);

    saveProject({ ...project, title: "Renamed" });
    expect(projectsFor("w1")).toHaveLength(1);
    expect(projectById(project.id)?.title).toBe("Renamed");

    removeProject(project.id);
    expect(projectsFor("w1")).toHaveLength(0);
    unsubscribe();
  });

  it("reloads a saved project intact after a restart", async () => {
    const project = makeProject(2);
    const withEvent = saveProject({ ...project, appliedActions: ["k1"] });

    resetProjectStoreForTests();
    const report = await loadProjects();

    expect(report.loaded).toBe(1);
    expect(report.rejected).toBe(0);
    const reloaded = projectById(project.id);
    expect(reloaded?.milestones).toHaveLength(1);
    expect(reloaded?.goal.text).toBe("Reach goal 2");
    expect(reloaded?.appliedActions).toEqual(["k1"]);
    expect(reloaded?.events.length).toBe(withEvent.events.length);
    expect(reloaded?.schedule.enabled).toBe(false);
  });

  it("refuses a payload written by another version instead of guessing at it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, projects: [makeProject(1)] }));
    const report = await loadProjects();
    expect(report.loaded).toBe(0);
    expect(report.rejected).toBe(1);
    expect(projectsFor()).toHaveLength(0);
  });

  it("keeps the valid records and counts the corrupt ones", async () => {
    const good = makeProject(3);
    localStorage.setItem(KEY, JSON.stringify({ version: 1, projects: [good, { id: "no-version" }, 42, null, { version: 1 }] }));
    const report = await loadProjects();
    expect(report.loaded).toBe(1);
    expect(report.rejected).toBe(4);
    expect(projectById(good.id)?.title).toBe("Project 3");
  });

  it("brings a record written before eventsDropped existed up to shape", async () => {
    const legacy = JSON.parse(JSON.stringify(makeProject(4))) as Record<string, unknown>;
    delete legacy.eventsDropped;
    localStorage.setItem(KEY, JSON.stringify({ version: 1, projects: [legacy] }));
    const report = await loadProjects();
    expect(report.rejected).toBe(0);
    expect(projectById(makeProject(4).id)?.eventsDropped).toBe(0);
  });

  it("caps the store at the configured limit, dropping the least recently touched", () => {
    const saved: Project[] = [];
    for (let index = 0; index < PROJECT_LIMITS.projects + 1; index += 1) saved.push(saveProject(makeProject(index)));

    expect(projectsFor()).toHaveLength(PROJECT_LIMITS.projects);
    expect(droppedProjectCount()).toBe(1);
    expect(projectById(saved[0].id)).toBeNull();
    expect(projectById(saved[saved.length - 1].id)).toBeTruthy();
  });

  it("clears one workspace without touching another's projects", async () => {
    const a = saveProject(makeProject(5, "w1"));
    const b = saveProject(makeProject(6, "w2"));
    await clearProjects("w1");
    expect(projectById(a.id)).toBeNull();
    expect(projectById(b.id)?.workspaceId).toBe("w2");

    resetProjectStoreForTests();
    const report = await loadProjects();
    expect(report.loaded).toBe(1);
    expect(projectsFor("w2")).toHaveLength(1);
  });
});
