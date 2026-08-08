import type {
  ResearchProject,
  ResearchMessage,
  ResearchDocument,
  ResearchNote,
  ResearchSource,
  ResearchReport,
  Bookmark,
  TimelineEvent,
  ResearchTask,
  OpenQuestion,
  Insight,
  ResearchPlannerOutput,
} from "../types";
import type { TeachingModeId } from "../../teaching/types";

const STORAGE_PREFIX = "bl_research_";

let idCounter = 0;
function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class ResearchProjectManager {
  private projects = new Map<string, ResearchProject>();
  private currentProjectId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private storageKey(id: string): string {
    return `${STORAGE_PREFIX}${id}`;
  }

  private loadFromStorage(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw) as ResearchProject;
            this.projects.set(data.id, data);
          }
        }
      }
    } catch {}
  }

  private saveToStorage(id: string): void {
    try {
      const data = this.projects.get(id);
      if (data) {
        localStorage.setItem(this.storageKey(id), JSON.stringify(data));
      }
    } catch {}
  }

  createProject(
    title: string,
    subjectId: string,
    subjectName: string,
    modeId: TeachingModeId,
  ): ResearchProject {
    const id = genId("proj");
    const now = Date.now();

    const project: ResearchProject = {
      id,
      title,
      subjectId,
      subjectName,
      goal: "",
      createdAt: now,
      updatedAt: now,
      messages: [],
      documents: [],
      notes: [],
      sources: [],
      reports: [],
      bookmarks: [],
      timeline: [],
      tasks: [],
      openQuestions: [],
      insights: [],
      plannerOutput: {
        researchGoal: "",
        learningObjectives: [],
        researchQuestions: [],
        keyConcepts: [],
        areasToInvestigate: [],
        potentialChallenges: [],
        futureTopics: [],
        generatedAt: now,
      },
      activeModeId: modeId,
    };

    this.projects.set(id, project);
    this.currentProjectId = id;
    this.saveToStorage(id);
    return project;
  }

  getProject(projectId?: string): ResearchProject | null {
    return this.projects.get(projectId ?? this.currentProjectId ?? "") ?? null;
  }

  getOrCreateProject(
    title: string,
    subjectId: string,
    subjectName: string,
    modeId: TeachingModeId,
    requestedId?: string,
  ): ResearchProject {
    if (requestedId) {
      const existing = this.projects.get(requestedId);
      if (existing) {
        this.currentProjectId = existing.id;
        return existing;
      }
    }
    return this.createProject(title, subjectId, subjectName, modeId);
  }

  updateProject(id: string, updates: Partial<ResearchProject>): void {
    const project = this.projects.get(id);
    if (!project) return;
    Object.assign(project, updates, { updatedAt: Date.now() });
    this.saveToStorage(id);
  }

  addMessage(
    message: Omit<ResearchMessage, "id" | "timestamp">,
    projectId?: string,
  ): ResearchMessage | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const msg: ResearchMessage = { ...message, id: genId("msg"), timestamp: Date.now() };
    project.messages.push(msg);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return msg;
  }

  addDocument(
    doc: Omit<ResearchDocument, "id" | "addedAt">,
    projectId?: string,
  ): ResearchDocument | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const document: ResearchDocument = { ...doc, id: genId("doc"), addedAt: Date.now() };
    project.documents.push(document);
    project.sources.push(document.source);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return document;
  }

  addNote(note: Omit<ResearchNote, "id" | "createdAt" | "updatedAt">, projectId?: string): ResearchNote | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const now = Date.now();
    const n: ResearchNote = { ...note, id: genId("note"), createdAt: now, updatedAt: now };
    project.notes.push(n);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return n;
  }

  updateNote(noteId: string, updates: Partial<ResearchNote>, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    const note = project.notes.find((n) => n.id === noteId);
    if (!note) return;
    Object.assign(note, updates, { updatedAt: Date.now() });
    this.saveToStorage(project.id);
  }

  addReport(report: ResearchReport, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    project.reports.push(report);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  addBookmark(bookmark: Omit<Bookmark, "id" | "createdAt">, projectId?: string): Bookmark | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const b: Bookmark = { ...bookmark, id: genId("bm"), createdAt: Date.now() };
    project.bookmarks.push(b);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return b;
  }

  removeBookmark(bookmarkId: string, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    project.bookmarks = project.bookmarks.filter((b) => b.id !== bookmarkId);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  addTimelineEvent(event: Omit<TimelineEvent, "id">, projectId?: string): TimelineEvent | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const e: TimelineEvent = { ...event, id: genId("tl") };
    project.timeline.push(e);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return e;
  }

  addTask(task: Omit<ResearchTask, "id" | "createdAt" | "completedAt">, projectId?: string): ResearchTask | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const t: ResearchTask = { ...task, id: genId("task"), createdAt: Date.now() };
    project.tasks.push(t);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return t;
  }

  updateTask(taskId: string, updates: Partial<ResearchTask>, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) return;
    Object.assign(task, updates);
    if (updates.status === "completed") task.completedAt = Date.now();
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  addOpenQuestion(q: Omit<OpenQuestion, "id" | "createdAt" | "updatedAt">, projectId?: string): OpenQuestion | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const now = Date.now();
    const oq: OpenQuestion = { ...q, id: genId("oq"), createdAt: now, updatedAt: now };
    project.openQuestions.push(oq);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return oq;
  }

  resolveOpenQuestion(questionId: string, resolution: string, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    const q = project.openQuestions.find((oq) => oq.id === questionId);
    if (!q) return;
    q.isResolved = true;
    q.resolution = resolution;
    q.updatedAt = Date.now();
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  addInsight(insight: Omit<Insight, "id" | "createdAt">, projectId?: string): Insight | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const ins: Insight = { ...insight, id: genId("ins"), createdAt: Date.now() };
    project.insights.push(ins);
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
    return ins;
  }

  setPlannerOutput(output: ResearchPlannerOutput, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    project.plannerOutput = output;
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  setGoal(goal: string, projectId?: string): void {
    const project = this.getProject(projectId);
    if (!project) return;
    project.goal = goal;
    project.updatedAt = Date.now();
    this.saveToStorage(project.id);
  }

  deleteProject(projectId?: string): void {
    const id = projectId ?? this.currentProjectId;
    if (!id) return;
    this.projects.delete(id);
    try { localStorage.removeItem(this.storageKey(id)); } catch { console.warn("[ProjectManager] Operation failed"); }
    if (this.currentProjectId === id) this.currentProjectId = null;
  }

  getAllProjects(): ResearchProject[] {
    return Array.from(this.projects.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  searchDocuments(query: string, projectId?: string): ResearchDocument[] {
    const project = this.getProject(projectId);
    if (!project) return [];
    const lower = query.toLowerCase();
    return project.documents.filter(
      (d) =>
        d.fileName.toLowerCase().includes(lower) ||
        d.content.toLowerCase().includes(lower) ||
        d.extractedConcepts.some((c) => c.toLowerCase().includes(lower)),
    );
  }

  searchMessages(query: string, projectId?: string): ResearchMessage[] {
    const project = this.getProject(projectId);
    if (!project) return [];
    const lower = query.toLowerCase();
    return project.messages.filter((m) => m.content.toLowerCase().includes(lower));
  }

  getUnresolvedQuestions(projectId?: string): OpenQuestion[] {
    const project = this.getProject(projectId);
    if (!project) return [];
    return project.openQuestions.filter((q) => !q.isResolved);
  }
}
