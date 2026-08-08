import type { UserIntent, IntentResult } from "./types";
import { INTENT_LABELS } from "./types";

const INTENT_PATTERNS: { intent: UserIntent; patterns: RegExp[]; weight: number }[] = [
  {
    intent: "learn",
    weight: 1.0,
    patterns: [
      /teach\s+me/i, /i\s+want\s+to\s+learn/i, /learn\s+(about|how|what|why|when)/i,
      /explain\s+(this|that|how|what|why|the\s+concept)/i, /what\s+is\s+(a|an|the)\s+/i,
      /how\s+(does|do|can|would|should)\s+/i, /beginner\s+guide/i, /introduction\s+to/i,
      /understand\s+(how|what|why)/i, /concept\s+of/i, /fundamentals\s+of/i,
      /basics\s+of/i, /overview\s+of/i, /guide\s+to/i, /tutorial\s+(on|for|about)/i,
    ],
  },
  {
    intent: "revise",
    weight: 1.0,
    patterns: [
      /revise/i, /refresher/i, /quick\s+(recap|review|summary)/i, /recap/i,
      /remind\s+me/i, /i\s+forgot/i, /refresh\s+my\s+(memory|knowledge)/i,
      /key\s+points?\s+of/i, /main\s+ideas?\s+(of|behind|in)/i, /brief\s+overview/i,
      /summarize\s+(what|the|key)/i, /revision\s+(notes|guide|help)/i,
    ],
  },
  {
    intent: "summarize",
    weight: 1.0,
    patterns: [
      /summarize/i, /summary\s+of/i, /tl;?dr/i, /in\s+a\s+nutshell/i,
      /give\s+me\s+(the\s+)?(gist|main\s+points?|key\s+takeaways)/i,
      /condense/i, /shorter\s+version/i, /brief\s+(explanation|description|summary)/i,
      /executive\s+summary/i, /abstract\s+of/i,
    ],
  },
  {
    intent: "research",
    weight: 1.0,
    patterns: [
      /research/i, /deep\s+dive/i, /in[- ]depth\s+(analysis|look|study)/i,
      /literature\s+review/i, /state\s+of\s+the\s+art/i, /current\s+(research|findings)/i,
      /latest\s+(research|studies?|findings|developments)/i, /paper\s+(on|about|regarding)/i,
      /academic\s+(research|analysis|perspective)/i, /study\s+(on|of|about)/i,
      /comprehensive\s+(analysis|guide|overview|report)/i, /detailed\s+(analysis|report|study)/i,
      /investigate/i, /explore\s+(the\s+)?(concept|topic|idea|subject)/i,
    ],
  },
  {
    intent: "exam-prep",
    weight: 1.0,
    patterns: [
      /exam\s+(prep|preparation|ready|guide|tips?|strategy|practice)/i,
      /test\s+(prep|preparation|ready|guide|tips?)/i, /pass\s+(the\s+)?(exam|test)/i,
      /study\s+(guide|plan|material|notes|tips?)/i, /what\s+to\s+expect\s+(on|in|for)\s+(the\s+)?(exam|test)/i,
      /common\s+(exam|test)\s+questions/i, /model\s+answers?/i, /marking\s+(scheme|criteria)/i,
      /ace\s+(the\s+)?(exam|test)/i, /last[- ]minute\s+(revision|prep|tips?)/i,
      /cram\s+(for|session|guide)/i, /board\s+exam/i, /final\s+(exam|test|assessment)/i,
      /midterm/i, /exam\s+favou?rite/i,
    ],
  },
  {
    intent: "interview-prep",
    weight: 1.0,
    patterns: [
      /interview\s+(prep|preparation|ready|guide|tips?|question|practice|coding)/i,
      /job\s+interview/i, /technical\s+interview/i, /behavioural?\s+interview/i,
      /hr\s+round/i, /what\s+(do|will|might)\s+(they\s+)?ask/i,
      /crack\s+(the\s+)?interview/i, /interviewer\s+(looks?\s+for|expects?|wants?)/i,
      /STAR\s+(method|technique|approach)/i, /resume?\s+question/i,
      /coding\s+round/i, /system\s+design\s+interview/i,
    ],
  },
  {
    intent: "solve-assignment",
    weight: 1.0,
    patterns: [
      /assignment/i, /homework/i, /solve\s+(this|the|my|a)/i,
      /how\s+do\s+I\s+(solve|complete|do|write|implement|code)/i,
      /help\s+me\s+(with|solve|complete|do|write|implement|code)/i,
      /problem\s+set/i, /due\s+(date|tomorrow|soon)/i, /i\s+need\s+(help|to\s+finish|to\s+complete)/i,
      /coursework/i, /project\s+(help|assistance|guide)/i,
    ],
  },
  {
    intent: "understand-concept",
    weight: 1.0,
    patterns: [
      /i\s+don'?t\s+understand/i, /confused\s+(about|by|with)/i,
      /clarify/i, /can\s+you\s+(explain\s+again|rephrase|clarify)/i,
      /what\s+(exactly|precisely)\s+is/i, /in\s+simple\s+terms/i,
      /explain\s+(like\s+I'?m\s+5|in\s+plain\s+english|simply)/i,
      /i'?m\s+(struggling|having\s+trouble)\s+(with|to\s+understand|grasping)/i,
      /break\s+(it\s+)?down/i, /elaborate\s+(on|about)/i,
      /give\s+me\s+(a\s+)?(clearer|better|simpler)\s+explanation/i,
    ],
  },
  {
    intent: "practice",
    weight: 1.0,
    patterns: [
      /practice\s+(questions?|problems?|exercises?|test)/i,
      /quiz\s+me/i, /test\s+me/i, /challenge\s+me/i,
      /give\s+me\s+(a|some|an)\s+(question|problem|exercise|task|challenge|example)/i,
      /i\s+want\s+to\s+(practice|try|test|apply)\s+(my|what|the)/i,
      /drill\s+(me|questions?|problems?)/i, /exercises?\s+(for|on|about)/i,
      /sample\s+(questions?|problems?|exercises?)/i, /mock\s+(test|exam|questions?)/i,
      /coding\s+(challenge|problem|exercise)/i, /leetcode/i, /hackerrank/i,
    ],
  },
  {
    intent: "roadmap",
    weight: 1.0,
    patterns: [
      /roadmap/i, /learning\s+(path|journey|plan|route|track)/i,
      /curriculum/i, /syllabus/i, /course\s+(plan|outline|structure|map)/i,
      /where\s+(should|do)\s+I\s+(start|begin|go\s+next)/i,
      /path\s+to\s+(learn|become|master|understand)/i,
      /step[- ]by[- ]step\s+(guide|plan|path)/i, /progression/i,
      /from\s+(scratch|zero|beginner)\s+to/i, /what\s+(to|should\s+I)\s+learn/i,
      /how\s+(to\s+)?become\s+(a|an)\s+/i, /career\s+path/i,
    ],
  },
  {
    intent: "flashcards",
    weight: 1.0,
    patterns: [
      /flashcard/i, /flash\s+card/i, /anki/i, /spaced\s+repetition/i,
      /memory\s+card/i, /digital\s+card/i, /study\s+card/i,
      /create\s+(some|a\s+set\s+of)\s+(flashcards?|cards?)/i,
      /revision\s+cards?/i,
    ],
  },
  {
    intent: "explain-mistakes",
    weight: 1.0,
    patterns: [
      /mistake/i, /error/i, /bug/i, /wrong/i, /incorrect/i, /why\s+(is|was|did)\s+(this|that|it)\s+/i,
      /what'?s\s+wrong\s+(with|here|in)/i, /debug/i, /fix\s+(this|my|the)/i,
      /issue\s+(with|in|on)/i, /not\s+working/i, /broken/i, /failing/i,
      /common\s+(mistakes?|errors?|pitfalls?)/i, /pitfall/i,
      /what\s+did\s+I\s+do\s+wrong/i, /why\s+(doesn'?t|isn'?t|won'?t)/i,
    ],
  },
  {
    intent: "compare",
    weight: 1.0,
    patterns: [
      /compare/i, /difference\s+(between|among)/i, /vs\.?/i, /versus/i,
      /similarities?\s+(and|&|between)/i, /pros?\s+and\s+cons?/i,
      /which\s+(is\s+better|should\s+I\s+(choose|use|pick))/i,
      /distinguish/i, /differentiate/i, /contrast/i,
      /comparison\s+(between|of|table)/i,
    ],
  },
  {
    intent: "analyze",
    weight: 1.0,
    patterns: [
      /analyze/i, /analysis\s+of/i, /break\s+down/i,
      /deconstruct/i, /examine/i, /evaluate/i, /assess/i,
      /critical\s+(analysis|examination|evaluation)/i,
      /in\s+detail/i, /scrutinize/i, /dissect/i,
    ],
  },
  {
    intent: "create",
    weight: 1.0,
    patterns: [
      /create\s+(a|an|some|this)/i, /write\s+(a|an|this|the)/i,
      /generate/i, /build\s+(a|an|this|the|me)/i, /design\s+(a|an|the)/i,
      /develop\s+(a|an|the)/i, /draft/i, /compose/i,
      /make\s+(a|an|me|this)/i, /produce\s+(a|an|the)/i,
      /code\s+(a|an|this|the|me)/i, /implement\s+(a|an|the)/i,
    ],
  },
  {
    intent: "debate",
    weight: 1.0,
    patterns: [
      /debate/i, /argue\s+(for|against)/i, /both\s+sides/i,
      /counterargument/i, /rebuttal/i, /opposing\s+view/i,
      /discuss\s+(the\s+)?(pros|merits|arguments)/i,
      /critical\s+perspective/i, /challenge\s+(the\s+)?(idea|notion|claim|assumption)/i,
      /controversy/i, /contentious/i, /disputed/i,
    ],
  },
  {
    intent: "review",
    weight: 1.0,
    patterns: [
      /review\s+(this|the|my|a)/i, /feedback\s+(on|for|about)/i,
      /critique/i, /what\s+do\s+you\s+(think|reckon)\s+(about|of)/i,
      /evaluate\s+(this|the|my)/i, /assess\s+(this|the|my)/i,
      /check\s+(my|this|the)/i, /proofread/i, /grade/i,
      /rate\s+(my|this|the)/i,
    ],
  },
  {
    intent: "plan",
    weight: 1.0,
    patterns: [
      /plan\s+(a|an|the|my|this|for)/i, /project\s+(plan|outline|proposal|roadmap)/i,
      /strategy\s+(for|to|on)/i, /blueprint/i, /framework/i,
      /how\s+(should|can|do)\s+I\s+(plan|approach|structure|organize)/i,
      /action\s+plan/i, /steps?\s+to\s+(achieve|build|create|implement)/i,
      /timeline\s+(for|of)/i, /milestones?\s+(for|of)/i,
    ],
  },
];

export class IntentEngine {
  detect(query: string): IntentResult {
    const lower = query.toLowerCase();
    let bestMatch: { intent: UserIntent; score: number } | null = null;

    for (const entry of INTENT_PATTERNS) {
      let matchCount = 0;
      for (const pattern of entry.patterns) {
        if (pattern.test(lower)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        const score = (matchCount / entry.patterns.length) * entry.weight;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { intent: entry.intent, score };
        }
      }
    }

    if (!bestMatch) {
      const wordCount = query.split(/\s+/).length;
      const hasQuestion = /\?$/.test(query.trim());
      const isHowWhat = /^(how|what|why|when|where|which)\b/i.test(query.trim());

      if (isHowWhat || hasQuestion) {
        bestMatch = { intent: "understand-concept", score: 0.3 };
      } else if (wordCount > 15) {
        bestMatch = { intent: "research", score: 0.3 };
      } else {
        bestMatch = { intent: "learn", score: 0.4 };
      }
    }

    let subIntent: string | undefined;
    const topicMatch = query.match(/(?:about|on|of|regarding|concerning)\s+([A-Z][a-zA-Z0-9\s]{2,40})/);
    if (topicMatch) {
      subIntent = topicMatch[1].trim();
    }

    return {
      intent: bestMatch.intent,
      confidence: Math.min(bestMatch.score, 1.0),
      subIntent,
    };
  }

  getIntentLabel(intent: UserIntent): string {
    return INTENT_LABELS[intent] || "General Query";
  }
}

export const intentEngine = new IntentEngine();
