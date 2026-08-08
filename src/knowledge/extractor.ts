import type { KnowledgeDerivation, KnowledgeEdgeType, KnowledgeNodeType } from "../types/knowledge";

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "these", "those",
  "from", "into", "over", "under", "between", "about", "which", "what", "when", "where",
  "why", "how", "who", "whom", "whose", "have", "has", "had", "been", "being", "will",
  "would", "could", "should", "shall", "can", "may", "might", "must", "not", "but", "or",
  "as", "at", "by", "in", "of", "on", "to", "per", "via", "such", "than", "then", "there",
  "their", "they", "your", "you", "we", "our", "us", "it", "its", "also", "very", "much",
  "more", "most", "some", "any", "all", "each", "every", "both", "neither", "either",
  "explain", "explain.", "explain?", "please", "can you", "what is", "what are", "what's",
  "whats", "how does", "how do", "how is", "how are", "why does", "why do", "define",
  "difference", "between", "versus", "tell", "me", "about", "known", "known?", "also",
]);

export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function tokenizeText(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z0-9-]{1,40}/g) ?? [];
}

export function extractQueryTerms(query: string): string[] {
  const words = tokenizeText(query);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (STOP_WORDS.has(w) || w.length < 3) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  const camel = query.match(/\b[a-z]+[A-Z][a-zA-Z]*\b/g) ?? [];
  for (const c of camel) {
    const norm = normalizeLabel(c);
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

interface SeedEntry {
  type: KnowledgeNodeType;
  aliases?: string[];
  definition?: string;
}

const SEED_DICTIONARY: Record<string, SeedEntry> = {
  // Programming / web
  "css": { type: "technology", aliases: ["cascading style sheets"], definition: "Stylesheet language used to describe the presentation of documents written in HTML or XML." },
  "selector": { type: "concept", definition: "A pattern used in CSS to select the elements that will be styled." },
  "pseudo class": { type: "concept", aliases: ["pseudo-class", "pseudo classes", "pseudo-classes"], definition: "A CSS keyword added to a selector that targets an element based on its state." },
  "flexbox": { type: "technology", definition: "A one-dimensional CSS layout model for distributing space among items." },
  "grid": { type: "technology", aliases: ["css grid"], definition: "A two-dimensional CSS layout system based on rows and columns." },
  "javascript": { type: "language", aliases: ["js"], definition: "A programming language for the web, capable of client and server execution." },
  "typescript": { type: "language", aliases: ["ts"], definition: "A typed superset of JavaScript that compiles to plain JavaScript." },
  "react": { type: "technology", definition: "A JavaScript library for building user interfaces with declarative components." },
  "hooks": { type: "concept", definition: "Functions that let React components use state and lifecycle features." },
  "usestate": { type: "concept", aliases: ["use state"], definition: "A React hook that adds state to function components." },
  "closure": { type: "concept", definition: "A function bundled with its lexical environment, retaining access to outer scope variables." },
  "promise": { type: "concept", definition: "An object representing the eventual completion or failure of an asynchronous operation." },
  "hoisting": { type: "concept", definition: "JavaScript behavior where declarations are moved to the top of their scope." },
  "virtual dom": { type: "concept", aliases: ["virtualdom"], definition: "An in-memory representation of the UI that is diffed before updating the real DOM." },
  "api": { type: "concept", aliases: ["apis"], definition: "Application Programming Interface: a set of rules for interacting with a system." },
  "http": { type: "technology", aliases: ["https"], definition: "HyperText Transfer Protocol: the foundation of data exchange on the web." },
  "framework": { type: "concept", aliases: ["frameworks"], definition: "A pre-built structure that provides the foundation for building software." },
  "database": { type: "technology", aliases: ["databases", "db"], definition: "An organized collection of structured data, typically stored electronically." },
  "algorithm": { type: "concept", aliases: ["algorithms"], definition: "A finite sequence of steps that solves a problem or computes a result." },
  "recursion": { type: "concept", definition: "A technique where a function calls itself to solve a problem by breaking it down." },
  "neural network": { type: "concept", aliases: ["neural networks", "neural-networks", "ann"], definition: "A computational model inspired by biological neurons, used in machine learning." },
  "machine learning": { type: "concept", aliases: ["ml"], definition: "A discipline in which systems learn patterns from data without explicit programming." },
  "gpu": { type: "technology", definition: "Graphics processing unit; a processor optimized for parallel workloads." },
  "python": { type: "language", definition: "A high-level, interpreted programming language known for readability." },
  "html": { type: "technology", definition: "HyperText Markup Language: the standard markup language for web documents." },
  "sql": { type: "language", definition: "Structured Query Language for managing relational databases." },
  "node": { type: "technology", aliases: ["nodejs", "node.js"], definition: "A JavaScript runtime built on Chrome's V8 engine, enabling server-side JS." },
  // Linear algebra / math
  "linear algebra": { type: "concept", aliases: ["linear-algebra"], definition: "The study of vectors, vector spaces, and linear mappings between them." },
  "calculus": { type: "concept", definition: "The mathematical study of continuous change, encompassing differentiation and integration." },
  "probability": { type: "concept", definition: "The branch of mathematics dealing with the likelihood of events." },
  "matrix": { type: "concept", aliases: ["matrices"], definition: "A rectangular array of numbers arranged in rows and columns." },
  "vector": { type: "concept", aliases: ["vectors"], definition: "An object with magnitude and direction, represented as an array of numbers." },
  "derivative": { type: "formula", definition: "The rate of change of a function with respect to a variable." },
  "integral": { type: "formula", definition: "A mathematical object representing area under a curve, or accumulation." },
  "gradient": { type: "concept", aliases: ["gradient descent"], definition: "A vector of partial derivatives; gradient descent is an optimization algorithm that moves opposite the gradient." },
  "backpropagation": { type: "concept", aliases: ["backprop"], definition: "An algorithm for computing gradients of a loss with respect to network weights." },
  // Law
  "contract": { type: "concept", aliases: ["contracts", "contract law"], definition: "A legally binding agreement between two or more parties." },
  "offer": { type: "concept", definition: "A clear statement of willingness to be bound on specific terms." },
  "acceptance": { type: "concept", definition: "Unconditional agreement to the terms of an offer, forming agreement." },
  "consideration": { type: "concept", definition: "Something of legal value exchanged between parties to a contract." },
  "agreement": { type: "concept", aliases: ["agreements"], definition: "A meeting of the minds between parties on the same terms." },
  "tort": { type: "concept", aliases: ["torts"], definition: "A civil wrong giving rise to a claim for damages." },
  "negligence": { type: "concept", definition: "Failure to exercise reasonable care, causing harm to another." },
  "precedent": { type: "concept", aliases: ["precedents"], definition: "A prior judicial decision that guides later cases with similar facts." },
  "jurisdiction": { type: "concept", definition: "The authority of a court to hear and decide a case." },
  "statute": { type: "law", aliases: ["statutes"], definition: "A written law enacted by a legislature." },
  "common law": { type: "law", definition: "Law developed through judicial decisions rather than statutes." },
  "equity": { type: "concept", definition: "A body of law providing remedies where the common law is inadequate." },
  "breach": { type: "concept", aliases: ["breach of contract"], definition: "Failure to perform an obligation under a contract without lawful excuse." },
  "damages": { type: "concept", definition: "Monetary compensation awarded for loss or injury." },
  "contract law": { type: "topic", definition: "The body of law governing legally binding agreements." },
  "property law": { type: "topic", definition: "The body of law governing ownership and transfer of property." },
  "criminal law": { type: "topic", definition: "The body of law defining offenses against the state." },
  "constitution": { type: "law", aliases: ["constitutional law"], definition: "The fundamental principles or established precedent governing a state." },
  "liability": { type: "concept", definition: "Legal responsibility for one's acts or omissions." },
  "intellectual property": { type: "topic", aliases: ["ip"], definition: "Legal rights over creations of the mind, such as patents, copyrights, and trademarks." },
  "copyright": { type: "law", definition: "A legal right granting creators control over reproduction of their works." },
  "patent": { type: "law", aliases: ["patents"], definition: "An exclusive right granted for an invention." },
  "trademark": { type: "law", definition: "A sign capable of distinguishing goods or services of one enterprise." },
  // Business
  "market": { type: "concept", aliases: ["markets"], definition: "An arena where buyers and sellers transact." },
  "supply": { type: "concept", definition: "The quantity of a good producers are willing to sell at a given price." },
  "demand": { type: "concept", definition: "The quantity of a good consumers are willing to buy at a given price." },
  "monopoly": { type: "concept", aliases: ["monopolies"], definition: "Market structure with a single seller of a good with no close substitutes." },
  "oligopoly": { type: "concept", aliases: ["oligopolies"], definition: "Market structure with a few dominant sellers." },
  "valuation": { type: "concept", definition: "The process of determining the economic worth of an asset or company." },
  "startup": { type: "concept", aliases: ["startups"], definition: "A young company built to grow rapidly, often on venture capital." },
  "strategy": { type: "concept", aliases: ["strategies"], definition: "A plan of action designed to achieve long-term goals." },
  "brand": { type: "concept", aliases: ["brands"], definition: "The identity and perception of a product, service, or company." },
  "revenue": { type: "concept", definition: "Income generated from business activities." },
  "profit": { type: "concept", aliases: ["profits"], definition: "Financial gain after expenses are subtracted from revenue." },
  "investment": { type: "concept", aliases: ["investing", "investments"], definition: "Allocation of capital with the expectation of future returns." },
  "portfolio": { type: "concept", definition: "A collection of investments held by an individual or institution." },
  "risk": { type: "concept", aliases: ["risks"], definition: "The possibility of loss or deviation from expected outcomes." },
  "return": { type: "concept", aliases: ["returns", "return on investment"], definition: "Gain or loss on an investment relative to its cost." },
  // Science / general
  "entropy": { type: "concept", definition: "A measure of disorder or uncertainty in a system." },
  "gravity": { type: "concept", aliases: ["gravitational force"], definition: "The attraction between masses described by general relativity." },
  "gene": { type: "concept", aliases: ["genes", "genetics"], definition: "A unit of heredity encoded in DNA." },
  "evolution": { type: "concept", aliases: ["natural selection"], definition: "Change in heritable traits of populations across generations." },
  "atom": { type: "concept", aliases: ["atoms"], definition: "The basic unit of a chemical element." },
  "catalyst": { type: "concept", aliases: ["catalysts", "catalysis"], definition: "A substance that accelerates a reaction without being consumed." },
  "enzyme": { type: "concept", aliases: ["enzymes"], definition: "A protein that catalyzes biochemical reactions." },
  "photosynthesis": { type: "concept", definition: "The process by which plants convert light into chemical energy." },
  "dna": { type: "concept", aliases: ["deoxyribonucleic acid"], definition: "The molecule carrying genetic instructions in living organisms." },
  "quantum": { type: "concept", aliases: ["quantum mechanics"], definition: "Physics of matter and energy at atomic and subatomic scales." },
  "photon": { type: "concept", definition: "A quantum of light, the elementary particle of electromagnetic radiation." },
  "orbit": { type: "concept", aliases: ["orbits"], definition: "The curved path of an object around a celestial body." },
  // AI
  "transformer": { type: "concept", aliases: ["transformers"], definition: "A neural architecture based on self-attention, foundation of modern LLMs." },
  "attention": { type: "concept", aliases: ["self attention", "attention mechanism"], definition: "A mechanism that weighs the importance of input elements relative to each other." },
  "token": { type: "concept", aliases: ["tokens"], definition: "A basic unit of text processed by a language model." },
  "embedding": { type: "concept", aliases: ["embeddings"], definition: "A dense vector representation of a token, word, or entity." },
  "llm": { type: "technology", aliases: ["large language model", "large language models", "language model"], definition: "A large neural network trained on text to generate and understand language." },
  "rag": { type: "technology", aliases: ["retrieval augmented generation"], definition: "A pattern that grounds model generation in retrieved external knowledge." },
  "fine tuning": { type: "concept", aliases: ["fine-tuning", "finetuning"], definition: "Training a pre-trained model further on a narrower dataset." },
  "inference": { type: "concept", aliases: ["inferences"], definition: "The process of generating outputs from a trained model." },
  // CS / software engineering
  "async": { type: "concept", aliases: ["asynchronous", "asynchrony"], definition: "Execution that proceeds without blocking while waiting for operations to complete." },
  "concurrency": { type: "concept", definition: "The execution of multiple tasks or processes within overlapping time windows." },
  "event loop": { type: "concept", aliases: ["eventloop"], definition: "A runtime mechanism that processes tasks and callbacks on a single thread." },
  "component": { type: "concept", aliases: ["components"], definition: "A reusable, self-contained unit of a user interface." },
  "props": { type: "concept", aliases: ["properties"], definition: "Data passed into a component from its parent to configure behavior." },
  "state management": { type: "topic", aliases: ["state-management", "state"], definition: "The discipline of tracking and updating application state predictably." },
  "data structure": { type: "topic", aliases: ["data structures"], definition: "A way of organizing and storing data for efficient access and modification." },
  "linked list": { type: "concept", aliases: ["linked lists", "linkedlist"], definition: "A linear data structure of nodes, each pointing to the next." },
  "binary search": { type: "concept", aliases: ["binary-search", "binarysearch"], definition: "A divide-and-conquer search that halves the search space each step." },
  "time complexity": { type: "concept", aliases: ["complexity", "big o"], definition: "A measure of how runtime or memory grows with input size." },
  "dom": { type: "concept", aliases: ["document object model"], definition: "The tree-structured representation of an HTML document in memory." },
  // More law
  "fiduciary duty": { type: "concept", aliases: ["fiduciary"], definition: "A legal obligation to act in the best interest of another party." },
  "statute of limitations": { type: "law", aliases: ["limitation period"], definition: "A time limit within which a legal claim must be brought." },
  "fraud": { type: "concept", definition: "Intentional deception resulting in loss or injury to another." },
  "warranty": { type: "concept", aliases: ["warranties"], definition: "A promise about the quality or condition of goods or services." },
  "tort law": { type: "topic", definition: "The body of law addressing civil wrongs and their remedies." },
  "sovereignty": { type: "concept", definition: "Supreme authority of a state over its territory and affairs." },
};

export function lookupSeed(normalized: string): SeedEntry | null {
  return SEED_DICTIONARY[normalized] ?? null;
}

export function seedCount(): number {
  return Object.keys(SEED_DICTIONARY).length;
}

const BOLD_TERM_RE = /\*\*([^*]{2,60})\*\*/g;
const CODE_TERM_RE = /`([^`]{2,40})`/g;

export function extractConceptHits(text: string): Array<{ label: string; contexts: string[] }> {
  const hits = new Map<string, { label: string; contexts: string[] }>();
  const add = (raw: string, context: string) => {
    const label = raw.trim().replace(/^['"]|['"]$/g, "").replace(/[()]+$/g, "").trim();
    if (label.length < 2 || label.length > 60) return;
    if (/^\d+$/.test(label)) return;
    const key = normalizeLabel(label);
    if (!key) return;
    const existing = hits.get(key);
    if (existing) {
      existing.contexts.push(context);
    } else {
      hits.set(key, { label, contexts: [context] });
    }
  };
  const push = (re: RegExp, textIn: string) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(textIn)) !== null) {
      const ctx = textIn.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\n/g, " ").trim();
      add(m[1], ctx);
    }
  };
  push(BOLD_TERM_RE, text);
  push(CODE_TERM_RE, text);
  return Array.from(hits.values());
}

const DEFINITION_PATTERNS = [
  /([A-Z][A-Za-z0-9\s-]{2,50}?)\s+(?:is|are|refers to|means|denotes|constitutes)\s+(?:a|an|the)?\s+([^.;]{8,200})/g,
  /([A-Z][A-Za-z0-9\s-]{2,50}?)\s+is defined as\s+([^.;]{8,200})/g,
  /(?:By|Under)\s+([A-Z][A-Za-z0-9\s-]{2,50}?)\s*,\s*(?:we|one|it|they)\s*(?:mean|refer to)\s+([^.;]{8,200})/g,
];

export function extractDefinitions(text: string): Array<{ term: string; definition: string; context: string }> {
  const out: Array<{ term: string; definition: string; context: string }> = [];
  const seen = new Set<string>();
  for (const re of DEFINITION_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const term = m[1].trim().replace(/^(?:the|a|an)\s+/i, "").trim();
      const definition = m[2].trim().replace(/^(?:the|a|an)\s+/i, "").trim();
      const key = normalizeLabel(term);
      if (term.length < 2 || term.length > 60 || !key || seen.has(key)) continue;
      seen.add(key);
      out.push({ term, definition, context: m[0] });
    }
  }
  return out;
}

const PERSON_RE = /\*\*([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\*\*/g;
const ORG_RE = /\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*(?:\s(?:Inc|Corp|Ltd|LLC|Organization|Institute|University|Company|Group|Committee|Agency|Bureau|Association|Bank|Fund|Council|Commission)))\b/g;
const CASE_RE = /\b([A-Z][a-zA-Z]+)\s+v\.?\s+([A-Z][a-zA-Z]+)\b/g;
const LAW_RE = /\b(?:the\s+|an?\s+)?([A-Z][A-Za-z\s-]{2,50}?(?:\s(?:Act|Law|Code|Regulation|Statute|Constitution|Directive|Treaty|Order)))\b/g;
const YEAR_EVENT_RE = /\b(In|By|During|Founded in)\s+(\d{3,4})\s*,?\s+([A-Z][^.;]{3,70})/g;

export function extractEntities(text: string): Array<{ label: string; type: KnowledgeNodeType; context: string }> {
  const out: Array<{ label: string; type: KnowledgeNodeType; context: string }> = [];
  const seen = new Set<string>();
  const push = (label: string, type: KnowledgeNodeType, context: string) => {
    const clean = label.trim().replace(/\s+/g, " ");
    const key = normalizeLabel(clean);
    if (clean.length < 2 || clean.length > 80 || !key || seen.has(key)) return;
    if (key.startsWith("the ")) return;
    seen.add(key);
    out.push({ label: clean, type, context });
  };
  let m: RegExpExecArray | null;
  const personRe = new RegExp(PERSON_RE.source, "g");
  while ((m = personRe.exec(text)) !== null) {
    push(m[1], "person", text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\n/g, " ").trim());
  }
  const orgRe = new RegExp(ORG_RE.source, "g");
  while ((m = orgRe.exec(text)) !== null) {
    push(m[1], "organization", text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\n/g, " ").trim());
  }
  const caseRe = new RegExp(CASE_RE.source, "g");
  while ((m = caseRe.exec(text)) !== null) {
    push(`${m[1]} v. ${m[2]}`, "case", text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\n/g, " ").trim());
  }
  const lawRe = new RegExp(LAW_RE.source, "g");
  while ((m = lawRe.exec(text)) !== null) {
    push(m[1].replace(/^the\s+/i, ""), "law", text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\n/g, " ").trim());
  }
  const yearRe = new RegExp(YEAR_EVENT_RE.source, "g");
  while ((m = yearRe.exec(text)) !== null) {
    push(`${m[3].split(",")[0].split(".")[0]} (${m[2]})`, "event", m[0]);
  }
  return out;
}

const RELATION_PATTERNS: Array<{ type: KnowledgeEdgeType; re: RegExp }> = [
  { type: "contains", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:includes|contains|comprises|consists of|includes things like|has)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s,{}-]{2,60}?)\s*(?:[,.;]|and|but)/g },
  { type: "depends-on", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:depends on|relies on|is built on|builds on|is based on)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|and|to)/g },
  { type: "requires", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+requires?\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|to|for)/g },
  { type: "related-to", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:relates to|is related to|is closely related to|has to do with)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|and|but)/g },
  { type: "part-of", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+is\s+(?:a part of|part of|a component of|a piece of)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|and)/g },
  { type: "causes", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:leads to|results in|causes|produces|triggers)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|and)/g },
  { type: "contrasts-with", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:differs from|is different from|is distinct from|is unlike)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|and|but)/g },
  { type: "example-of", re: /\b(?:examples? of)\s+([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+(?:are|include|is|includes)\s+([A-Za-z][A-Za-z0-9\s,{}-]{2,70}?)\s*(?:[,.;]|and)/g },
  { type: "defines", re: /\b([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s+defines?\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s-]{2,50}?)\s*(?:[,.;]|to|as)/g },
];

export function extractRelationshipHits(text: string): Array<{ source: string; target: string; type: KnowledgeEdgeType; context: string }> {
  const plain = text.replace(/\*\*/g, "").replace(/`/g, "");
  const out: Array<{ source: string; target: string; type: KnowledgeEdgeType; context: string }> = [];
  const seen = new Set<string>();
  for (const { type, re } of RELATION_PATTERNS) {
    const runner = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = runner.exec(plain)) !== null) {
      const source = m[1].trim();
      const target = m[2].trim().split(",")[0].trim().split(" and ")[0].trim();
      const key = `${normalizeLabel(source)}|${normalizeLabel(target)}|${type}`;
      if (!normalizeLabel(source) || !normalizeLabel(target) || seen.has(key)) continue;
      if (normalizeLabel(source) === normalizeLabel(target)) continue;
      seen.add(key);
      out.push({ source, target, type, context: plain.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\n/g, " ").trim() });
    }
  }
  return out;
}

export interface DocHeading {
  level: number;
  title: string;
}

const HEADING_RE = /^(#{1,4})\s+(.+)$/gm;

export function extractHeadings(text: string): DocHeading[] {
  const out: DocHeading[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(text)) !== null) {
    const title = m[2].trim().replace(/\*\*/g, "").replace(/[#*]+$/, "").trim();
    if (title.length > 1 && title.length <= 80) {
      out.push({ level: m[1].length, title });
    }
  }
  return out;
}

export function extractDerivations(text: string): KnowledgeDerivation {
  const conceptHits = extractConceptHits(text);
  const definitions = extractDefinitions(text);
  const entities = extractEntities(text);
  const relationships = extractRelationshipHits(text);
  const headings = extractHeadings(text);

  const nodes: KnowledgeDerivation["nodes"] = [];
  const edges: KnowledgeDerivation["edges"] = [];
  const nodeByKey = new Map<string, string>();

  const register = (label: string, type: KnowledgeNodeType, extra: Partial<KnowledgeDerivation["nodes"][0]> = {}): string => {
    const key = normalizeLabel(label);
    const existing = nodeByKey.get(key);
    if (existing) return existing;
    const entry: KnowledgeDerivation["nodes"][0] = {
      type,
      label,
      ...extra,
    };
    nodes.push(entry);
    nodeByKey.set(key, label);
    return label;
  };

  for (const hit of conceptHits) {
    const seed = lookupSeed(normalizeLabel(hit.label));
    register(hit.label, seed?.type ?? "concept", {
      aliases: seed?.aliases,
      definition: seed?.definition,
      description: hit.contexts[0],
    });
  }
  for (const def of definitions) {
    if (nodeByKey.has(normalizeLabel(def.term))) continue;
    const seed = lookupSeed(normalizeLabel(def.term));
    register(def.term, seed?.type ?? "definition", {
      definition: seed?.definition ?? def.definition,
      description: seed?.definition ? def.definition : undefined,
    });
  }
  for (const ent of entities) {
    register(ent.label, ent.type, { description: ent.context });
  }
  for (const h of headings) {
    const seed = lookupSeed(normalizeLabel(h.title));
    register(h.title, seed?.type ?? "subtopic", { definition: seed?.definition });
  }
  for (const rel of relationships) {
    const s = nodeByKey.get(normalizeLabel(rel.source)) ?? register(rel.source, "concept", { description: rel.context });
    const t = nodeByKey.get(normalizeLabel(rel.target)) ?? register(rel.target, "concept", { description: rel.context });
    edges.push({ source: s, target: t, type: rel.type });
  }

  return { nodes, edges };
}

export function extractNodeKeysForQuery(query: string, knownKeys: Set<string>): string[] {
  const terms = extractQueryTerms(query);
  const out: string[] = [];
  for (const t of terms) {
    if (knownKeys.has(t)) out.push(t);
  }
  const words = query.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const pair = normalizeLabel(`${words[i]} ${words[i + 1]}`);
    if (knownKeys.has(pair) && !out.includes(pair)) out.push(pair);
  }
  return out;
}