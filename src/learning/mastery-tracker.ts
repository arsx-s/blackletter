export type ConfidenceLevel = "introduced" | "learning" | "comfortable" | "confident" | "mastered";

export interface ConceptState {
  concept: string;
  confidence: ConfidenceLevel;
  firstIntroduced: number;
  lastReviewed: number;
  reviewCount: number;
  exercisesCompleted: number;
  correctAttempts: number;
  totalAttempts: number;
}

export interface LearningPath {
  subject: string;
  concepts: ConceptState[];
  unlockedAt: number;
  lastAccessed: number;
  isExpertUnlocked: boolean;
}

export class MasteryTracker {
  private readonly STORAGE_KEY = "blackletter_mastery";

  private getPaths(): Record<string, LearningPath> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private savePaths(paths: Record<string, LearningPath>): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(paths));
    } catch {
      /* localStorage may be full */
    }
  }

  getPath(subject: string): LearningPath | null {
    const paths = this.getPaths();
    return paths[subject] ?? null;
  }

  ensurePath(subject: string): LearningPath {
    const paths = this.getPaths();
    if (!paths[subject]) {
      paths[subject] = {
        subject,
        concepts: [],
        unlockedAt: Date.now(),
        lastAccessed: Date.now(),
        isExpertUnlocked: false,
      };
      this.savePaths(paths);
    }
    return paths[subject];
  }

  introduceConcept(subject: string, concept: string): void {
    const path = this.ensurePath(subject);
    const existing = path.concepts.find((c) => c.concept === concept);
    if (!existing) {
      path.concepts.push({
        concept,
        confidence: "introduced",
        firstIntroduced: Date.now(),
        lastReviewed: Date.now(),
        reviewCount: 0,
        exercisesCompleted: 0,
        correctAttempts: 0,
        totalAttempts: 0,
      });
      this.savePaths(this.getPaths());
    }
  }

  recordAttempt(subject: string, concept: string, correct: boolean): void {
    const path = this.ensurePath(subject);
    const existing = path.concepts.find((c) => c.concept === concept);
    if (!existing) {
      this.introduceConcept(subject, concept);
      return this.recordAttempt(subject, concept, correct);
    }

    existing.totalAttempts++;
    existing.lastReviewed = Date.now();
    existing.reviewCount++;

    if (correct) {
      existing.correctAttempts++;
    }

    const accuracy = existing.correctAttempts / Math.max(existing.totalAttempts, 1);

    if (accuracy >= 0.9 && existing.totalAttempts >= 5) {
      existing.confidence = "mastered";
      path.isExpertUnlocked = this.checkExpertUnlock(path);
    } else if (accuracy >= 0.8 && existing.totalAttempts >= 3) {
      existing.confidence = "confident";
    } else if (accuracy >= 0.6 && existing.totalAttempts >= 2) {
      existing.confidence = "comfortable";
    } else if (existing.totalAttempts >= 1) {
      existing.confidence = "learning";
    }

    this.savePaths(this.getPaths());
  }

  getConceptConfidence(subject: string, concept: string): ConfidenceLevel {
    const path = this.getPaths()[subject];
    if (!path) return "introduced";
    const existing = path.concepts.find((c) => c.concept === concept);
    return existing?.confidence ?? "introduced";
  }

  getMasteryPercentage(subject: string): number {
    const path = this.getPaths()[subject];
    if (!path || path.concepts.length === 0) return 0;
    const weights: Record<ConfidenceLevel, number> = {
      introduced: 0,
      learning: 0.25,
      comfortable: 0.5,
      confident: 0.75,
      mastered: 1,
    };
    const total = path.concepts.reduce((sum, c) => sum + weights[c.confidence], 0);
    return Math.round((total / path.concepts.length) * 100);
  }

  getRevisedConcepts(subject: string, limit: number = 5): ConceptState[] {
    const path = this.getPaths()[subject];
    if (!path) return [];
    return [...path.concepts]
      .filter((c) => c.confidence !== "mastered")
      .sort((a, b) => a.lastReviewed - b.lastReviewed)
      .slice(0, limit);
  }

  getMasteredConcepts(subject: string): ConceptState[] {
    const path = this.getPaths()[subject];
    if (!path) return [];
    return path.concepts.filter((c) => c.confidence === "mastered");
  }

  getAllSubjects(): string[] {
    return Object.keys(this.getPaths());
  }

  getTotalConceptsLearned(): number {
    const paths = this.getPaths();
    return Object.values(paths).reduce((sum, p) => sum + p.concepts.length, 0);
  }

  getTotalMastered(): number {
    const paths = this.getPaths();
    return Object.values(paths).reduce((sum, p) => sum + p.concepts.filter((c) => c.confidence === "mastered").length, 0);
  }

  private checkExpertUnlock(path: LearningPath): boolean {
    const masteredCount = path.concepts.filter((c) => c.confidence === "mastered").length;
    const total = path.concepts.length;
    return total > 0 && masteredCount >= Math.max(3, Math.ceil(total * 0.5));
  }

  isExpertModeAvailable(subject: string): boolean {
    const path = this.getPaths()[subject];
    return path?.isExpertUnlocked ?? false;
  }

  getLearningPathStatus(subject: string): {
    totalConcepts: number;
    masteredCount: number;
    learningCount: number;
    introducedCount: number;
    masteryPercentage: number;
    expertUnlocked: boolean;
    revisedNext: ConceptState[];
  } {
    const path = this.ensurePath(subject);
    return {
      totalConcepts: path.concepts.length,
      masteredCount: path.concepts.filter((c) => c.confidence === "mastered").length,
      learningCount: path.concepts.filter((c) => c.confidence === "learning" || c.confidence === "comfortable" || c.confidence === "confident").length,
      introducedCount: path.concepts.filter((c) => c.confidence === "introduced").length,
      masteryPercentage: this.getMasteryPercentage(subject),
      expertUnlocked: path.isExpertUnlocked,
      revisedNext: this.getRevisedConcepts(subject),
    };
  }
}

export const masteryTracker = new MasteryTracker();
