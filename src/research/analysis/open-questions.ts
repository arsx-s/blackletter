import type { OpenQuestion } from "../types";
import { SubjectDetector } from "../../engine/detection/detector";
import { ProfileRegistry } from "../../engine/profiles/registry";

let idCounter = 0;
function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class OpenQuestionsEngine {
  private subjectDetector = SubjectDetector;
  private profileRegistry = ProfileRegistry;

  generateFromQuery(
    query: string,
    response: string,
    existingQuestions: OpenQuestion[],
  ): OpenQuestion[] {
    const classification = this.subjectDetector.detect(query);
    const profile = this.profileRegistry.get(classification.primaryId)
      ?? this.profileRegistry.getDefault();
    const now = Date.now();

    const newQuestions: OpenQuestion[] = [];
    const existingLower = existingQuestions.map((q) => q.question.toLowerCase());

    const unknowns = this.extractUnknowns(response, query, profile);
    for (const u of unknowns) {
      if (!existingLower.some((e) => e.includes(u.question.toLowerCase().slice(0, 30)))) {
        newQuestions.push({
          id: genId("oq"),
          question: u.question,
          context: u.context,
          category: u.category,
          linkedConceptIds: u.conceptIds,
          linkedSourceIds: [],
          isResolved: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return newQuestions;
  }

  suggestNextInvestigation(openQuestions: OpenQuestion[]): OpenQuestion | null {
    const unresolved = openQuestions.filter((q) => !q.isResolved);

    if (unresolved.length === 0) return null;

    const sorted = unresolved.sort((a, b) => {
      const categoryOrder: Record<string, number> = {
        "unknown": 0,
        "controversy": 1,
        "assumption": 2,
        "methodology": 3,
        "future-work": 4,
      };
      return (categoryOrder[a.category] ?? 5) - (categoryOrder[b.category] ?? 5);
    });

    return sorted[0];
  }

  categorizeUnanswered(questions: OpenQuestion[]): Record<string, OpenQuestion[]> {
    const categorized: Record<string, OpenQuestion[]> = {
      "What remains unknown?": [],
      "What should be investigated next?": [],
      "What controversies exist?": [],
      "What assumptions remain?": [],
    };

    for (const q of questions) {
      if (q.isResolved) continue;
      switch (q.category) {
        case "unknown":
          categorized["What remains unknown?"].push(q);
          break;
        case "controversy":
          categorized["What controversies exist?"].push(q);
          break;
        case "assumption":
          categorized["What assumptions remain?"].push(q);
          break;
        case "future-work":
          categorized["What should be investigated next?"].push(q);
          break;
        default:
          categorized["What remains unknown?"].push(q);
      }
    }

    for (const key of Object.keys(categorized)) {
      if (categorized[key].length === 0) {
        delete categorized[key];
      }
    }

    return categorized;
  }

  private extractUnknowns(
    response: string,
    query: string,
    profile: { name: string; keywords: string[] },
  ): { question: string; context: string; category: OpenQuestion["category"]; conceptIds: string[] }[] {
    const unknowns: { question: string; context: string; category: OpenQuestion["category"]; conceptIds: string[] }[] = [];
    const lowerResponse = response.toLowerCase();
    const lowerQuery = query.toLowerCase();

    const signalPatterns: { pattern: RegExp; category: OpenQuestion["category"] }[] = [
      { pattern: /remains? unknown|not yet understood|unclear whether/i, category: "unknown" },
      { pattern: /debate|controvers|disagree|opposing|differing views/i, category: "controversy" },
      { pattern: /assum|presume|take for granted|under the assumption/i, category: "assumption" },
      { pattern: /future research|further study|needs investigation|open question/i, category: "future-work" },
      { pattern: /limitation|drawback|caveat|does not address|fails to/i, category: "methodology" },
    ];

    for (const { pattern, category } of signalPatterns) {
      const matches = lowerResponse.match(pattern);
      if (matches) {
        const sentence = this.extractSentence(response, matches[0]);
        if (sentence) {
          unknowns.push({
            question: this.formulateQuestion(sentence, query, category),
            context: sentence,
            category,
            conceptIds: profile.keywords?.slice(0, 3).map((k) => `kw_${k.replace(/\s+/g, "_")}`) ?? [],
          });
        }
      }
    }

    if (unknowns.length === 0) {
      unknowns.push({
        question: `What are the current limitations of ${query}?`,
        context: `Based on the discussion of ${query}, several questions remain about its limitations and boundary conditions.`,
        category: "unknown",
        conceptIds: [],
      });
    }

    return unknowns.slice(0, 4);
  }

  private extractSentence(text: string, fragment: string): string {
    const sentences = text.split(/[.!?]+/);
    for (const sent of sentences) {
      if (sent.toLowerCase().includes(fragment.toLowerCase())) {
        return sent.trim();
      }
    }
    return fragment;
  }

  private formulateQuestion(
    sentence: string,
    query: string,
    category: OpenQuestion["category"],
  ): string {
    const templates: Record<string, string[]> = {
      "unknown": [
        `What remains unknown about this aspect of ${query}?`,
        `How does this uncertainty affect our understanding of ${query}?`,
      ],
      "controversy": [
        `What are the main debates in this area of ${query}?`,
        `Which viewpoints disagree and why?`,
      ],
      "assumption": [
        `What assumptions underlie current understanding of ${query}?`,
        `How would changing these assumptions alter the conclusions?`,
      ],
      "future-work": [
        `What should researchers investigate next in ${query}?`,
        `What are the most promising directions for future work?`,
      ],
      "methodology": [
        `What methodological limitations affect research in ${query}?`,
        `How could different approaches yield new insights?`,
      ],
    };

    const options = templates[category] ?? templates["unknown"];
    return options[0];
  }
}
