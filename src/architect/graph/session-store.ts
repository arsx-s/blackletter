import { KnowledgeGraph } from "./knowledge-graph";
import type { LearningEvent, ProgressionState, ArchitectConfig } from "../types";

const STORAGE_PREFIX = "bl_architect_";

export interface SessionData {
  sessionId: string;
  subjectId: string;
  subjectName: string;
  currentModeId: string;
  currentQuery: string;
  createdAt: number;
  updatedAt: number;
  graphJSON: string;
  events: LearningEvent[];
  progress: Record<string, ProgressionState>;
}

export class SessionStore {
  private sessions = new Map<string, SessionData>();
  private currentSessionId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private generateId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private storageKey(sessionId: string): string {
    return `${STORAGE_PREFIX}${sessionId}`;
  }

  private loadFromStorage(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw) as SessionData;
            this.sessions.set(data.sessionId, data);
          }
        }
      }
    } catch {}
  }

  private saveToStorage(sessionId: string): void {
    try {
      const data = this.sessions.get(sessionId);
      if (data) {
        localStorage.setItem(this.storageKey(sessionId), JSON.stringify(data));
      }
    } catch {}
  }

  createSession(subjectId: string, subjectName: string, modeId: string): string {
    const sessionId = this.generateId();
    const graph = new KnowledgeGraph(subjectId, subjectName);
    const data: SessionData = {
      sessionId,
      subjectId,
      subjectName,
      currentModeId: modeId,
      currentQuery: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      graphJSON: graph.toJSON(),
      events: [],
      progress: {},
    };
    this.sessions.set(sessionId, data);
    this.currentSessionId = sessionId;
    this.saveToStorage(sessionId);
    return sessionId;
  }

  getSession(sessionId?: string): SessionData | null {
    const id = sessionId || this.currentSessionId;
    if (!id) return null;
    return this.sessions.get(id) ?? null;
  }

  getOrCreateSession(
    subjectId: string,
    subjectName: string,
    modeId: string,
    requestedId?: string,
  ): SessionData {
    const existing = requestedId ? this.sessions.get(requestedId) : null;
    if (existing) {
      this.currentSessionId = existing.sessionId;
      return existing;
    }

    const sessionId = this.createSession(subjectId, subjectName, modeId);
    return this.sessions.get(sessionId)!;
  }

  getGraph(sessionId?: string): KnowledgeGraph | null {
    const data = this.getSession(sessionId);
    if (!data) return null;
    try {
      return KnowledgeGraph.fromJSON(data.graphJSON);
    } catch {
      return null;
    }
  }

  saveGraph(graph: KnowledgeGraph, sessionId?: string): void {
    const data = this.getSession(sessionId);
    if (!data) return;
    data.graphJSON = graph.toJSON();
    data.updatedAt = Date.now();
    this.saveToStorage(data.sessionId);
  }

  addEvent(event: LearningEvent, sessionId?: string): void {
    const data = this.getSession(sessionId);
    if (!data) return;
    data.events.push(event);
    data.updatedAt = Date.now();
    data.currentQuery = event.query;
    this.saveToStorage(data.sessionId);
  }

  updateProgress(conceptId: string, update: Partial<ProgressionState>, sessionId?: string): void {
    const data = this.getSession(sessionId);
    if (!data) return;
    const existing = data.progress[conceptId];
    if (existing) {
      Object.assign(existing, update);
      existing.lastEncountered = Date.now();
    } else {
      data.progress[conceptId] = {
        conceptId,
        status: "encountered",
        timesEncountered: 1,
        lastEncountered: Date.now(),
        notes: [],
        ...update,
      };
    }
    data.updatedAt = Date.now();
    this.saveToStorage(data.sessionId);
  }

  getProgress(sessionId?: string): ProgressionState[] {
    const data = this.getSession(sessionId);
    if (!data) return [];
    return Object.values(data.progress);
  }

  updateMode(modeId: string, sessionId?: string): void {
    const data = this.getSession(sessionId);
    if (!data) return;
    data.currentModeId = modeId;
    data.updatedAt = Date.now();
    this.saveToStorage(data.sessionId);
  }

  clearSession(sessionId?: string): void {
    const id = sessionId || this.currentSessionId;
    if (!id) return;
    this.sessions.delete(id);
    try {
      localStorage.removeItem(this.storageKey(id));
    } catch { console.warn("[SessionStore] Operation failed"); }
    if (this.currentSessionId === id) {
      this.currentSessionId = null;
    }
  }

  clearAll(): void {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      this.clearSession(id);
    }
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
