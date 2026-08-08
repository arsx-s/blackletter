import type { SubjectId, SubjectResult } from "./types";
import { SUBJECT_LABELS } from "./types";

interface SubjectKeywords {
  subject: SubjectId;
  primary: string[];
  secondary: string[];
  terms: Record<string, number>;
}

const SUBJECT_KEYWORDS: SubjectKeywords[] = [
  {
    subject: "computer-science",
    primary: ["algorithm", "data structure", "programming", "code", "software", "computational", "complexity", "recursion", "sorting", "graph", "tree", "binary", "stack", "queue", "hash", "pointer", "compiler", "interpreter", "operating system", "database", "network", "protocol", "TCP/IP", "HTTP", "API", "REST", "object-oriented", "functional programming", "variable", "loop", "function", "class", "inheritance", "polymorphism", "encapsulation"],
    secondary: ["computer", "program", "developer", "coding", "debug", "runtime", "memory", "thread", "process", "cache", "buffer", "stream", "serialization", "parsing", "syntax", "semantic"],
    terms: { recursion: 3, algorithm: 5, complexity: 3, big_o: 3, data_structure: 4, sorting: 2, binary: 2, tree: 1 },
  },
  {
    subject: "software-engineering",
    primary: ["agile", "scrum", "devops", "CI/CD", "testing", "deployment", "version control", "git", "refactoring", "design pattern", "microservice", "architecture", "SDLC", "waterfall", "unit test", "integration test", "code review", "continuous integration", "continuous deployment", "monolith", "API design", "RESTful", "documentation", "technical debt", "software architecture"],
    secondary: ["engineering", "software development", "team", "sprint", "backlog", "pipeline", "release", "staging", "production", "quality assurance", "QA", "bug tracking", "requirements", "specification"],
    terms: { agile: 4, scrum: 4, devops: 4, ci_cd: 4, testing: 2, deployment: 3, design_pattern: 4, microservice: 4 },
  },
  {
    subject: "artificial-intelligence",
    primary: ["artificial intelligence", "AI", "neural network", "deep learning", "natural language processing", "NLP", "computer vision", "reinforcement learning", "agent", "heuristic", "search algorithm", "knowledge representation", "expert system", "reasoning", "planning", "robot", "autonomous", "intelligent system", "cognitive", "perception", "knowledge graph", "ontology", "semantic web", "machine reasoning"],
    secondary: ["intelligence", "learning", "neural", "network", "training", "inference", "model", "prediction", "classification", "regression", "feature", "embedding", "attention", "transformer", "GPT", "BERT"],
    terms: { neural: 3, deep_learning: 5, nlp: 4, transformer: 3, attention: 2, embedding: 2, agent: 2 },
  },
  {
    subject: "machine-learning",
    primary: ["machine learning", "supervised learning", "unsupervised learning", "classification", "regression", "clustering", "decision tree", "random forest", "SVM", "support vector", "k-nearest", "k-means", "dimensionality reduction", "PCA", "feature engineering", "overfitting", "underfitting", "bias-variance", "cross-validation", "hyperparameter", "gradient descent", "loss function", "activation function", "backpropagation", "epoch", "batch", "training set", "test set", "confusion matrix", "precision", "recall", "F1 score", "ROC", "AUC"],
    secondary: ["learning", "model training", "data science", "predictive", "forecast", "pattern", "dataset", "label", "feature", "weight", "bias", "normalization", "regularization", "dropout"],
    terms: { classification: 3, regression: 3, gradient: 3, overfitting: 3, cross_validation: 3, hyperparameter: 3 },
  },
  {
    subject: "cybersecurity",
    primary: ["cybersecurity", "security", "encryption", "decryption", "cryptography", "cipher", "hash", "authentication", "authorization", "firewall", "intrusion detection", "malware", "virus", "ransomware", "phishing", "social engineering", "penetration testing", "vulnerability", "exploit", "zero-day", "patch", "CIA triad", "confidentiality", "integrity", "availability", "risk assessment", "threat modeling", "security policy", "compliance", "GDPR", "access control", "PKI", "SSL", "TLS"],
    secondary: ["secure", "attack", "defense", "breach", "hacker", "cyber", "encrypt", "decrypt", "certificate", "key", "password", "token", "OAuth", "SAM", "permission"],
    terms: { encryption: 4, cryptography: 4, malware: 3, phishing: 3, firewall: 2, vulnerability: 3 },
  },
  {
    subject: "law",
    primary: ["law", "legal", "contract", "tort", "statute", "precedent", "jurisdiction", "liability", "negligence", "breach", "damages", "injunction", "plaintiff", "defendant", "prosecution", "defense", "verdict", "sentence", "appeal", "evidence", "witness", "testimony", "cross-examination", "judicial", "legislation", "regulation", "common law", "civil law", "criminal law", "constitutional", "statutory interpretation", "IRAC", "brief", "memo", "legal analysis", "case law", "binding", "persuasive", "ratio decidendi", "obiter dictum"],
    secondary: ["court", "judge", "lawyer", "attorney", "sue", "lawsuit", "litigation", "arbitration", "mediation", "clause", "agreement", "legal advice", "rights", "obligation"],
    terms: { contract: 4, tort: 4, negligence: 3, precedent: 3, statute: 3, evidence: 2 },
  },
  {
    subject: "business",
    primary: ["business", "management", "strategy", "marketing", "operations", "supply chain", "logistics", "leadership", "entrepreneurship", "startup", "organization", "organizational behavior", "HR", "human resources", "SWOT", "PESTEL", "Porter's five forces", "value chain", "competitive advantage", "core competency", "mission", "vision", "stakeholder", "corporate governance", "business model", "B2B", "B2C", "ROI", "KPI", "balanced scorecard"],
    secondary: ["company", "firm", "industry", "market", "customer", "client", "product", "service", "revenue", "profit", "growth", "scale", "innovation", "disruption"],
    terms: { swot: 3, pestel: 3, strategy: 3, management: 2, marketing: 2, leadership: 2 },
  },
  {
    subject: "finance",
    primary: ["finance", "financial", "investment", "stock", "bond", "portfolio", "asset", "liability", "equity", "derivative", "option", "future", "swap", "risk management", "diversification", "CAPM", "NPV", "IRR", "discounted cash flow", "DCF", "valuation", "dividend", "yield", "interest rate", "inflation", "hedge", "arbitrage", "liquidity", "solvency", "financial statement", "balance sheet", "income statement", "cash flow", "ratio analysis", "EBITDA", "EPS", "P/E ratio"],
    secondary: ["money", "bank", "banking", "capital", "market", "trading", "investor", "fund", "mutual fund", "ETF", "index", "volatility", "return", "risk"],
    terms: { stock: 3, bond: 3, portfolio: 3, npv: 4, irr: 4, dcf: 4, valuation: 3, derivative: 3 },
  },
  {
    subject: "economics",
    primary: ["economics", "economy", "supply", "demand", "market equilibrium", "elasticity", "utility", "marginal", "opportunity cost", "inflation", "unemployment", "GDP", "GNP", "fiscal policy", "monetary policy", "interest rate", "taxation", "subsidy", "tariff", "quota", "trade", "comparative advantage", "absolute advantage", "market structure", "perfect competition", "monopoly", "oligopoly", "monopolistic competition", "game theory", "nash equilibrium", "externalities", "public goods", "keynesian", "classical", "behavioral economics", "microeconomics", "macroeconomics"],
    secondary: ["economic", "price", "cost", "market", "consumer", "producer", "welfare", "efficiency", "scarcity", "choice", "incentive"],
    terms: { supply: 3, demand: 3, elasticity: 3, gdp: 3, inflation: 2, monopoly: 2, game_theory: 3 },
  },
  {
    subject: "accounting",
    primary: ["accounting", "bookkeeping", "journal", "ledger", "trial balance", "income statement", "balance sheet", "cash flow statement", "debit", "credit", "double-entry", "accrual", "prepaid", "depreciation", "amortization", "GAAP", "IFRS", "audit", "tax", "taxation", "cost accounting", "management accounting", "budget", "variance analysis", "break-even", "contribution margin", "overhead", "inventory", "COGS", "accounts receivable", "accounts payable", "goodwill", "intangible asset", "equity", "retained earnings", "dividend"],
    secondary: ["account", "financial", "statement", "report", "fiscal", "year-end", "closing", "reconciliation", "trial", "balance"],
    terms: { debit: 3, credit: 3, double_entry: 4, gaap: 3, ifrs: 3, depreciation: 3, audit: 2 },
  },
  {
    subject: "engineering",
    primary: ["engineering", "mechanical", "electrical", "civil", "chemical", "structural", "thermodynamics", "fluid dynamics", "circuit", "signal", "system", "control", "mechanics", "material", "strength", "load", "stress", "strain", "beam", "truss", "turbine", "motor", "generator", "transformer", "CAD", "FEM", "finite element", "differential equation", "Laplace transform", "Fourier", "transfer function", "feedback", "closed loop", "open loop"],
    secondary: ["engineer", "design", "analysis", "calculation", "simulation", "modeling", "prototype", "manufacturing", "production", "quality control"],
    terms: { circuit: 3, thermodynamics: 4, fluid: 3, mechanics: 3, stress: 2, strain: 2 },
  },
  {
    subject: "physics",
    primary: ["physics", "force", "motion", "energy", "momentum", "velocity", "acceleration", "gravity", "electromagnetism", "electric field", "magnetic field", "quantum", "relativity", "wave", "optics", "thermodynamics", "kinematics", "dynamics", "Newton", "conservation", "angular momentum", "torque", "oscillation", "frequency", "amplitude", "wavelength", "photon", "electron", "nuclear", "particle", "standard model", "string theory", "black hole", "spacetime"],
    secondary: ["physical", "science", "experiment", "measurement", "unit", "dimension", "vector", "scalar", "field", "particle", "wave"],
    terms: { force: 3, energy: 3, quantum: 4, relativity: 4, electromagnetism: 3, newton: 2, wave: 2 },
  },
  {
    subject: "chemistry",
    primary: ["chemistry", "chemical", "element", "compound", "reaction", "molecule", "atom", "orbital", "valence", "electron", "proton", "neutron", "bond", "covalent", "ionic", "metallic", "acid", "base", "pH", "equilibrium", "stoichiometry", "mole", "concentration", "titration", "oxidation", "reduction", "redox", "thermochemistry", "enthalpy", "entropy", "Gibbs free energy", "kinetics", "catalyst", "organic chemistry", "functional group", "polymer", "biochemistry", "periodic table", "electrochemistry"],
    secondary: ["lab", "experiment", "solution", "mixture", "pure", "synthesis", "decomposition", "precipitation", "distillation", "chromatography"],
    terms: { reaction: 3, bond: 3, acid: 2, base: 2, organic: 3, stoichiometry: 3, equilibrium: 2 },
  },
  {
    subject: "biology",
    primary: ["biology", "cell", "DNA", "RNA", "gene", "genetics", "evolution", "natural selection", "protein", "enzyme", "metabolism", "photosynthesis", "respiration", "mitosis", "meiosis", "chromosome", "mutation", "ecosystem", "population", "species", "taxonomy", "anatomy", "physiology", "organ", "tissue", "neuron", "synapse", "hormone", "immune system", "antibody", "vaccine", "virus", "bacteria", "microbiology", "molecular biology", "genomics", "proteomics", "homeostasis", "osmosis", "diffusion"],
    secondary: ["life", "living", "organism", "plant", "animal", "human", "cell division", "reproduction", "development", "ecology", "environment"],
    terms: { cell: 3, dna: 4, genetics: 4, evolution: 3, protein: 3, enzyme: 2, photosynthesis: 3 },
  },
  {
    subject: "mathematics",
    primary: ["mathematics", "math", "algebra", "calculus", "geometry", "trigonometry", "differential", "integral", "limit", "derivative", "function", "equation", "inequality", "matrix", "vector", "linear algebra", "theorem", "proof", "axiom", "set", "number theory", "probability", "statistics", "topology", "analysis", "group theory", "ring", "field", "complex number", "real number", "sequence", "series", "convergence", "divergence", "polynomial", "rational function", "exponential", "logarithm", "combinatorics", "graph theory"],
    secondary: ["number", "calculation", "solve", "formula", "expression", "variable", "constant", "parameter", "dimension", "space"],
    terms: { calculus: 4, derivative: 3, integral: 3, algebra: 3, matrix: 3, theorem: 3, proof: 3 },
  },
  {
    subject: "medicine",
    primary: ["medicine", "medical", "disease", "diagnosis", "treatment", "symptom", "syndrome", "pathology", "pharmacology", "drug", "therapy", "surgery", "anatomy", "physiology", "pathophysiology", "epidemiology", "public health", "clinical", "patient", "doctor", "physician", "nurse", "hospital", "clinic", "prescription", "dosage", "side effect", "contraindication", "chronic", "acute", "diagnostic", "prognosis", "screening", "prevention", "vaccination", "immunization", "cardiology", "neurology", "oncology", "pediatrics"],
    secondary: ["health", "care", "healing", "body", "organ", "cell", "infection", "inflammation", "fracture", "wound", "emergency", "chronic"],
    terms: { disease: 3, diagnosis: 3, treatment: 3, symptom: 2, pharmacology: 3, surgery: 2, anatomy: 2 },
  },
  {
    subject: "psychology",
    primary: ["psychology", "behavior", "cognition", "perception", "memory", "learning", "personality", "emotion", "motivation", "consciousness", "unconscious", "developmental", "social psychology", "cognitive psychology", "clinical psychology", "abnormal", "disorder", "depression", "anxiety", "schizophrenia", "therapy", "counseling", "CBT", "psychoanalysis", "conditioning", "classical conditioning", "operant conditioning", "attachment", "intelligence", "IQ", "traits", "big five", "Freud", "Piaget", "Erikson", "Maslow", "self-actualization", "neuropsychology", "experiment", "correlation"],
    secondary: ["mind", "mental", "thought", "feeling", "brain", "nervous system", "behavioral", "cognitive", "emotional", "social interaction"],
    terms: { behavior: 3, cognition: 3, memory: 2, personality: 3, conditioning: 3, freud: 2, piaget: 2 },
  },
  {
    subject: "political-science",
    primary: ["political science", "politics", "government", "democracy", "authoritarianism", "totalitarianism", "constitution", "legislature", "executive", "judiciary", "separation of powers", "checks and balances", "electoral", "voting", "campaign", "party", "ideology", "conservatism", "liberalism", "socialism", "communism", "fascism", "sovereignty", "state", "nation", "international relations", "foreign policy", "diplomacy", "treaty", "UN", "NATO", "European Union", "public policy", "bureaucracy", "political theory", "power", "authority", "legitimacy", "citizenship", "human rights"],
    secondary: ["political", "policy", "election", "vote", "representative", "parliament", "congress", "senate", "president", "prime minister", "law", "regulation"],
    terms: { democracy: 4, constitution: 3, government: 3, sovereignty: 2, international_relations: 3, ideology: 2 },
  },
  {
    subject: "history",
    primary: ["history", "historical", "century", "decade", "era", "period", "civilization", "empire", "kingdom", "dynasty", "revolution", "war", "battle", "treaty", "ancient", "medieval", "modern", "renaissance", "enlightenment", "colonial", "imperial", "world war", "cold war", "industrial revolution", "french revolution", "american revolution", "roman empire", "greek", "egyptian", "mesopotamian", "historiography", "primary source", "secondary source", "archaeology", "chronology", "timeline", "artifact", "manuscript"],
    secondary: ["past", "event", "age", "old", "ancient", "civilization", "culture", "society", "economy", "political", "social", "cultural"],
    terms: { revolution: 3, empire: 3, war: 2, ancient: 2, medieval: 2, renaissance: 3, enlightenment: 2 },
  },
  {
    subject: "marketing",
    primary: ["marketing", "advertising", "brand", "branding", "SEO", "SEM", "social media marketing", "content marketing", "email marketing", "digital marketing", "market research", "segment", "target", "positioning", "4Ps", "marketing mix", "product", "price", "place", "promotion", "customer journey", "funnel", "awareness", "consideration", "conversion", "retention", "loyalty", "NPS", "customer acquisition", "CAC", "LTV", "ROI", "campaign", "audience", "demographics", "psychographics", "influencer", "viral", "growth hacking"],
    secondary: ["market", "consumer", "customer", "sell", "sales", "promotion", "advertise", "media", "digital", "online", "content", "social"],
    terms: { seo: 3, branding: 3, funnel: 2, positioning: 2, campaign: 2, conversion: 2 },
  },
  {
    subject: "statistics",
    primary: ["statistics", "probability", "distribution", "normal distribution", "binomial", "poisson", "hypothesis testing", "p-value", "confidence interval", "mean", "median", "mode", "variance", "standard deviation", "correlation", "causation", "regression", "ANOVA", "chi-square", "t-test", "z-test", "bayesian", "frequentist", "likelihood", "maximum likelihood", "MLE", "sampling", "population", "sample", "bias", "outlier", "descriptive statistics", "inferential statistics", "time series", "forecasting"],
    secondary: ["statistical", "data", "analysis", "quantitative", "variable", "measure", "significance", "power", "effect size", "error", "margin of error"],
    terms: { probability: 3, distribution: 3, hypothesis_testing: 4, p_value: 3, regression: 3, variance: 2, bayesian: 3 },
  },
];

export class SubjectEngine {
  detect(query: string): SubjectResult {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/);
    const scores: Record<string, number> = {};

    for (const entry of SUBJECT_KEYWORDS) {
      let score = 0;

      for (const keyword of entry.primary) {
        const regex = new RegExp(keyword.replace(/[-\s]/g, "[\\s-]?"), "i");
        if (regex.test(lower)) {
          score += 3;
        }
      }

      for (const keyword of entry.secondary) {
        const regex = new RegExp(keyword.replace(/[-\s]/g, "[\\s-]?"), "i");
        if (regex.test(lower)) {
          score += 1;
        }
      }

      for (const [term, weight] of Object.entries(entry.terms)) {
        const regex = new RegExp(term.replace(/_/g, "[\\s-]?"), "i");
        if (regex.test(lower)) {
          score += weight;
        }
      }

      if (score > 0) {
        scores[entry.subject] = score;
      }
    }

    let bestSubject: SubjectId = "general";
    let bestScore = 0;

    for (const [subject, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestSubject = subject as SubjectId;
      }
    }

    const maxPossibleScore = 100;
    const confidence = Math.min(bestScore / 15, 1.0);

    const allScores: Record<string, number> = {};
    for (const entry of SUBJECT_KEYWORDS) {
      allScores[entry.subject] = scores[entry.subject] || 0;
    }

    return {
      subject: bestSubject,
      subjectName: SUBJECT_LABELS[bestSubject],
      confidence: Math.round(confidence * 100) / 100,
      allScores,
    };
  }

  getSubjectLabel(subject: SubjectId): string {
    return SUBJECT_LABELS[subject] || "General";
  }
}

export const subjectEngine = new SubjectEngine();
