import type { SubjectClassification } from "../types";
import { ProfileRegistry } from "../profiles/registry";

export class SubjectDetector {
  private static termWeight(query: string, term: string): number {
    const lower = query.toLowerCase();
    const search = term.toLowerCase();
    let score = 0;

    if (lower.includes(search)) {
      score += search.length / lower.length * 10;
    }

    const words = lower.split(/\s+/);
    const termWords = search.split(/\s+/);
    const matchCount = termWords.filter((tw) => words.includes(tw)).length;
    if (matchCount > 0) {
      score += (matchCount / termWords.length) * 15;
    }

    if (lower.startsWith(search) || lower.endsWith(search)) {
      score += 5;
    }

    return score;
  }

  private static scoreProfile(query: string, profile: { keywords: string[]; subdisciplines: string[]; id: string }): number {
    let score = 0;

    for (const keyword of profile.keywords) {
      score += this.termWeight(query, keyword);
    }

    for (const sub of profile.subdisciplines) {
      score += this.termWeight(query, sub) * 1.5;
    }

    if (profile.id === "general-knowledge") {
      score -= 5;
    }

    return score;
  }

  static detect(query: string): SubjectClassification {
    if (!query || !query.trim()) {
      return { primary: "General Knowledge", primaryId: "general-knowledge", confidence: 1.0 };
    }

    const profiles = ProfileRegistry.getAll();
    const scored: { profile: typeof profiles[number]; score: number }[] = [];

    for (const profile of profiles) {
      const score = this.scoreProfile(query, profile);
      if (score > 0) {
        scored.push({ profile, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { primary: "General Knowledge", primaryId: "general-knowledge", confidence: 0.3 };
    }

    const top = scored[0];
    const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
    const confidence = totalScore > 0 ? top.score / totalScore : 0.3;

    let subdiscipline: string | undefined;
    if (scored.length > 1 && scored[1].score > top.score * 0.6) {
      subdiscipline = scored[1].profile.name;
    }

    const foundSub = top.profile.subdisciplines.find(
      (s) => this.termWeight(query, s) > 3,
    );

    return {
      primary: top.profile.name,
      primaryId: top.profile.id,
      confidence: Math.min(1, Math.max(0.1, confidence)),
      subdiscipline: subdiscipline || foundSub || undefined,
    };
  }
}
