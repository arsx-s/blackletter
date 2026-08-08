import type { KnowledgeObject, SearchResult, SearchQuery, KnowledgeObjectType } from "../types";
import { KnowledgeObjectStore } from "../objects/object-store";

export class IntelligentSearch {
  private store: KnowledgeObjectStore;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
  }

  search(query: SearchQuery): SearchResult[] {
    const all = this.store.getAll();
    const lower = query.text.toLowerCase().trim();
    const results: SearchResult[] = [];

    let filtered = all;

    if (query.types && query.types.length > 0) {
      filtered = filtered.filter((o) => query.types!.includes(o.type));
    }
    if (query.subjects && query.subjects.length > 0) {
      filtered = filtered.filter((o) => query.subjects!.includes(o.subjectId));
    }
    if (query.tags && query.tags.length > 0) {
      const lowerTags = query.tags.map((t) => t.toLowerCase());
      filtered = filtered.filter((o) =>
        o.tags.some((t) => lowerTags.includes(t.toLowerCase())),
      );
    }
    if (query.difficultyMin !== undefined) {
      filtered = filtered.filter((o) => o.difficulty >= query.difficultyMin!);
    }
    if (query.difficultyMax !== undefined) {
      filtered = filtered.filter((o) => o.difficulty <= query.difficultyMax!);
    }
    if (query.confidenceMin !== undefined) {
      filtered = filtered.filter((o) => o.confidence >= query.confidenceMin!);
    }

    if (lower.length === 0) {
      return this.sortResults(filtered.map((o) => this.toResult(o, 0.5, "title", "")), query.sortBy);
    }

    for (const obj of filtered) {
      const score = this.scoreObject(obj, lower);
      if (score > 0) {
        const match = this.findBestMatch(obj, lower);
        results.push({
          object: obj,
          score,
          matchedField: match.field,
          matchContext: match.context,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return this.sortResults(results, query.sortBy).slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 20));
  }

  quickSearch(text: string, limit: number = 10): SearchResult[] {
    return this.search({ text, limit });
  }

  searchByType(type: KnowledgeObjectType, text: string): SearchResult[] {
    return this.search({ text, types: [type] });
  }

  searchBySubject(subjectId: string, text: string): SearchResult[] {
    return this.search({ text, subjects: [subjectId] });
  }

  private scoreObject(obj: KnowledgeObject, lower: string): number {
    let score = 0;

    const titleLower = obj.title.toLowerCase();
    if (titleLower === lower) score += 50;
    else if (titleLower.includes(lower)) score += 30 + (lower.length / titleLower.length) * 10;

    const summaryLower = (obj.content.summary || "").toLowerCase();
    if (summaryLower.includes(lower)) score += 15;

    const defLower = (obj.content.definition || "").toLowerCase();
    if (defLower.includes(lower)) score += 10;

    if (obj.content.keyPoints) {
      for (const kp of obj.content.keyPoints) {
        if (kp.toLowerCase().includes(lower)) score += 5;
      }
    }

    if (obj.content.examples) {
      for (const ex of obj.content.examples) {
        if (ex.toLowerCase().includes(lower)) score += 4;
      }
    }

    for (const tag of obj.tags) {
      if (tag.toLowerCase().includes(lower)) score += 3;
    }

    return score;
  }

  private findBestMatch(obj: KnowledgeObject, lower: string): { field: string; context: string } {
    const titleLower = obj.title.toLowerCase();
    if (titleLower === lower || titleLower.includes(lower)) {
      return { field: "title", context: obj.title };
    }

    const summary = obj.content.summary || "";
    if (summary.toLowerCase().includes(lower)) {
      const idx = summary.toLowerCase().indexOf(lower);
      const start = Math.max(0, idx - 40);
      const end = Math.min(summary.length, idx + lower.length + 40);
      return { field: "summary", context: (start > 0 ? "..." : "") + summary.slice(start, end) + (end < summary.length ? "..." : "") };
    }

    const def = obj.content.definition || "";
    if (def.toLowerCase().includes(lower)) {
      return { field: "definition", context: def.slice(0, 150) };
    }

    return { field: "title", context: obj.title };
  }

  private toResult(obj: KnowledgeObject, baseScore: number, field: string, context: string): SearchResult {
    return { object: obj, score: baseScore, matchedField: field, matchContext: context };
  }

  private sortResults(results: SearchResult[], sortBy?: string): SearchResult[] {
    switch (sortBy) {
      case "freshness":
        return results.sort((a, b) => b.object.createdAt - a.object.createdAt);
      case "confidence":
        return results.sort((a, b) => b.object.confidence - a.object.confidence);
      case "access-count":
        return results.sort((a, b) => b.object.accessCount - a.object.accessCount);
      default:
        return results.sort((a, b) => b.score - a.score);
    }
  }
}
