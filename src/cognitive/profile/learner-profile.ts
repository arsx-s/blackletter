import type { LearnerProfile } from "../types";
import { createLearnerProfile } from "../types";

const STORAGE_KEY = "bl_cognitive_profile";

export class LearnerProfileManager {
  private profile: LearnerProfile;
  private sessionStart: number = Date.now();

  constructor() {
    this.profile = this.load();
  }

  getProfile(): LearnerProfile {
    return this.profile;
  }

  getPreferences() {
    return this.profile.preferences;
  }

  getPatterns() {
    return this.profile.patterns;
  }

  getProgress() {
    return this.profile.progress;
  }

  getKnowledgeState() {
    return this.profile.knowledgeState;
  }

  save(): void {
    this.profile.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch { console.warn("[LearnerProfile] Operation failed"); }
  }

  reset(): void {
    this.profile = createLearnerProfile();
    this.save();
  }

  endSession(): void {
    const sessionMinutes = (Date.now() - this.sessionStart) / 60000;
    this.profile.patterns.totalSessions++;

    const prevTotal = this.profile.progress.totalStudyMinutes;
    this.profile.progress.totalStudyMinutes = prevTotal + Math.round(sessionMinutes);

    const prevAvg = this.profile.patterns.averageSessionLength;
    const total = this.profile.patterns.totalSessions;
    this.profile.patterns.averageSessionLength = Math.round(
      (prevAvg * (total - 1) + sessionMinutes) / total,
    );

    this.updateStreak();
    this.updateConsistency();
    this.save();
    this.sessionStart = Date.now();
  }

  private load(): LearnerProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LearnerProfile;
        return parsed;
      }
    } catch {}

    const fresh = createLearnerProfile();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch { console.warn("[LearnerProfile] Operation failed"); }
    return fresh;
  }

  private updateStreak(): void {
    const now = Date.now();
    const oneDay = 86_400_000;

    const profile = this.profile;
    const lastActive = profile.updatedAt;

    if (now - lastActive < oneDay * 2) {
      profile.progress.studyStreak++;
    } else if (now - lastActive > oneDay * 3) {
      profile.progress.studyStreak = 0;
    }

    if (profile.progress.studyStreak > profile.progress.longestStreak) {
      profile.progress.longestStreak = profile.progress.studyStreak;
    }
  }

  private updateConsistency(): void {
    const profile = this.profile;
    const totalDays = Math.max(1, Math.ceil((Date.now() - profile.createdAt) / 86_400_000));
    const activeDays = profile.progress.studyStreak;
    profile.progress.consistencyScore = Math.min(1, activeDays / totalDays);
    profile.patterns.studyConsistency = profile.progress.consistencyScore;
  }
}
