import type { PipelineContext } from "./types";

const SUBJECT_KEYWORDS: Array<{ name: string; keywords: string[] }> = [
  { name: "computer-science", keywords: ["algorithm", "data structure", "programming", "software", "code", "computational", "binary", "recursion", "sorting", "complexity", "byte", "compiler", "os", "operating system", "database", "sql"] },
  { name: "artificial-intelligence", keywords: ["artificial intelligence", "ai", "neural network", "deep learning", "machine learning model", "transformer", "llm", "gpt", "nlp", "attention", "embedding", "token"] },
  { name: "machine-learning", keywords: ["machine learning", "supervised", "unsupervised", "regression", "classification", "clustering", "svm", "random forest", "gradient descent", "overfitting", "feature", "cross-validation"] },
  { name: "cybersecurity", keywords: ["cybersecurity", "cyber", "security", "encryption", "hashing", "firewall", "malware", "phishing", "authentication", "vulnerability", "penetration", "ransomware"] },
  { name: "software-engineering", keywords: ["software engineering", "agile", "scrum", "devops", "ci/cd", "testing", "deployment", "architecture", "microservices", "api design", "refactor", "design pattern"] },
  { name: "law", keywords: ["law", "legal", "statute", "constitution", "contract", "tort", "litigation", "jurisdiction", "precedent", "amendment", "plaintiff", "defendant"] },
  { name: "finance", keywords: ["finance", "investment", "stock", "bond", "portfolio", "asset", "equity", "dividend", "risk", "return", "valuation", "derivative", "option"] },
  { name: "economics", keywords: ["economics", "supply", "demand", "market", "inflation", "gdp", "monetary", "fiscal", "trade", "utility", "marginal", "elasticity"] },
  { name: "accounting", keywords: ["accounting", "ledger", "journal", "balance sheet", "income statement", "audit", "tax", "depreciation", "accrual", "debit", "credit"] },
  { name: "business", keywords: ["business", "management", "strategy", "organization", "leadership", "marketing", "operations", "supply chain", "entrepreneurship", "startup"] },
  { name: "marketing", keywords: ["marketing", "brand", "seo", "content", "campaign", "conversion", "funnel", "audience", "engagement", "advertising"] },
  { name: "medicine", keywords: ["medicine", "clinical", "diagnosis", "treatment", "symptom", "disease", "patient", "pharma", "anatomy", "physiology", "pathology"] },
  { name: "engineering", keywords: ["engineering", "mechanical", "electrical", "civil", "circuit", "structural", "thermodynamics", "fluid", "material"] },
  { name: "physics", keywords: ["physics", "quantum", "mechanics", "thermodynamics", "electromagnetism", "relativity", "force", "energy", "wave", "particle"] },
  { name: "chemistry", keywords: ["chemistry", "reaction", "element", "compound", "molecule", "atom", "bond", "acid", "base", "organic", "periodic"] },
  { name: "biology", keywords: ["biology", "cell", "dna", "evolution", "genetics", "organism", "protein", "enzyme", "ecosystem", "species"] },
  { name: "mathematics", keywords: ["mathematics", "algebra", "calculus", "geometry", "theorem", "proof", "equation", "function", "derivative", "integral"] },
  { name: "history", keywords: ["history", "century", "war", "civilization", "empire", "revolution", "dynasty", "ancient", "medieval", "colonial"] },
  { name: "psychology", keywords: ["psychology", "behavior", "cognition", "personality", "therapy", "mental", "brain", "emotion", "memory", "perception"] },
  { name: "statistics", keywords: ["statistics", "probability", "distribution", "variance", "hypothesis", "correlation", "regression", "bayesian", "p-value"] },
  { name: "philosophy", keywords: ["philosophy", "ethics", "logic", "argument", "existence", "consciousness", "moral", "ontology", "epistemology"] },
];

export interface SubjectResult {
  primary: string;
  confidence: number;
  all: Array<{ name: string; confidence: number }>;
}

export async function executeSubject(ctx: PipelineContext): Promise<SubjectResult> {
  const query = ctx.normalizedPrompt.toLowerCase();
  const docText = (ctx.documentText || "").toLowerCase().slice(0, 2000);
  const combined = query + " " + docText;

  const scores: Array<{ name: string; score: number }> = [];

  for (const subject of SUBJECT_KEYWORDS) {
    let score = 0;
    for (const kw of subject.keywords) {
      const regex = new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const qm = (combined.match(regex) || []).length;
      score += qm;
    }
    if (score > 0) scores.push({ name: subject.name, score });
  }

  if (scores.length === 0) {
    return { primary: "general", confidence: 1, all: [{ name: "general", confidence: 1 }] };
  }

  scores.sort((a, b) => b.score - a.score);
  const total = scores.reduce((s, r) => s + r.score, 0);
  const top = scores[0];

  return {
    primary: top.name,
    confidence: total > 0 ? top.score / total : 0.5,
    all: scores.map((s) => ({ name: s.name, confidence: s.score / total })),
  };
}
