import { ProfileRegistry } from "../../engine/profiles/registry";
import type { SubjectProfile } from "../../engine/types";
import type { DisciplineConnection } from "../types";

interface ConnectionPattern {
  targetSubjectId: string;
  relationship: string;
  description: string;
  strength: number;
}

const SUBJECT_CONNECTIONS: Record<string, ConnectionPattern[]> = {
  "computer-science": [
    { targetSubjectId: "mathematics", relationship: "built on", description: "Computer science is built on mathematical foundations — logic, discrete math, and algebra", strength: 0.9 },
    { targetSubjectId: "artificial-intelligence", relationship: "enables", description: "Computer science provides the tools and frameworks that power artificial intelligence", strength: 0.8 },
    { targetSubjectId: "engineering", relationship: "applied in", description: "Software engineering applies computer science principles to build reliable systems", strength: 0.7 },
    { targetSubjectId: "business", relationship: "transforms", description: "Computing transforms business operations through automation, data, and digital products", strength: 0.6 },
  ],
  "artificial-intelligence": [
    { targetSubjectId: "computer-science", relationship: "depends on", description: "AI depends on computer science for implementation, algorithms, and infrastructure", strength: 0.9 },
    { targetSubjectId: "mathematics", relationship: "built on", description: "AI and machine learning are built on statistics, linear algebra, and calculus", strength: 0.9 },
    { targetSubjectId: "economics", relationship: "impacts", description: "AI is transforming economic systems, labor markets, and productivity", strength: 0.5 },
    { targetSubjectId: "general-science", relationship: "applied in", description: "AI accelerates scientific discovery in biology, chemistry, and physics", strength: 0.6 },
  ],
  "mathematics": [
    { targetSubjectId: "computer-science", relationship: "foundation for", description: "Mathematics provides the theoretical foundation for all of computing", strength: 0.9 },
    { targetSubjectId: "artificial-intelligence", relationship: "foundation for", description: "Linear algebra, calculus, and statistics form the mathematical backbone of AI", strength: 0.9 },
    { targetSubjectId: "engineering", relationship: "used in", description: "Mathematics is essential for all engineering disciplines", strength: 0.8 },
    { targetSubjectId: "finance", relationship: "used in", description: "Quantitative finance is applied mathematics", strength: 0.7 },
    { targetSubjectId: "economics", relationship: "used in", description: "Mathematical models underpin modern economic theory", strength: 0.7 },
    { targetSubjectId: "general-science", relationship: "language of", description: "Mathematics is the language of all scientific disciplines", strength: 0.8 },
  ],
  "law": [
    { targetSubjectId: "business", relationship: "governs", description: "Law provides the regulatory framework for all business activities", strength: 0.7 },
    { targetSubjectId: "history", relationship: "shaped by", description: "Legal systems are shaped by historical and cultural context", strength: 0.6 },
    { targetSubjectId: "artificial-intelligence", relationship: "regulates", description: "AI raises novel legal questions around liability, privacy, and rights", strength: 0.5 },
  ],
  "business": [
    { targetSubjectId: "economics", relationship: "informed by", description: "Business strategy is informed by economic principles and market dynamics", strength: 0.8 },
    { targetSubjectId: "finance", relationship: "includes", description: "Financial management is a core function of business", strength: 0.8 },
    { targetSubjectId: "law", relationship: "regulated by", description: "Business operations must comply with legal and regulatory requirements", strength: 0.7 },
    { targetSubjectId: "computer-science", relationship: "transformed by", description: "Digital technology transforms how businesses operate and compete", strength: 0.6 },
  ],
  "finance": [
    { targetSubjectId: "economics", relationship: "grounded in", description: "Financial theory is grounded in economic principles", strength: 0.8 },
    { targetSubjectId: "mathematics", relationship: "uses", description: "Quantitative finance applies advanced mathematics and statistics", strength: 0.8 },
    { targetSubjectId: "business", relationship: "serves", description: "Finance supports business decision-making and strategy", strength: 0.7 },
    { targetSubjectId: "artificial-intelligence", relationship: "transformed by", description: "AI and machine learning are transforming trading, risk, and analysis", strength: 0.6 },
  ],
  "economics": [
    { targetSubjectId: "mathematics", relationship: "uses", description: "Modern economics uses mathematical models and statistical analysis", strength: 0.8 },
    { targetSubjectId: "finance", relationship: "foundation for", description: "Economics provides the theoretical foundation for finance", strength: 0.7 },
    { targetSubjectId: "business", relationship: "informs", description: "Economic analysis informs business strategy and policy decisions", strength: 0.7 },
    { targetSubjectId: "history", relationship: "studies", description: "Economic history reveals patterns that inform current policy", strength: 0.5 },
    { targetSubjectId: "artificial-intelligence", relationship: "impacted by", description: "AI is reshaping labor markets, productivity, and economic structures", strength: 0.5 },
  ],
  "history": [
    { targetSubjectId: "law", relationship: "shapes", description: "Historical events shape legal systems and constitutional frameworks", strength: 0.6 },
    { targetSubjectId: "economics", relationship: "context for", description: "Historical context is essential for understanding economic development", strength: 0.6 },
    { targetSubjectId: "business", relationship: "informs", description: "Business strategy benefits from historical patterns and lessons", strength: 0.4 },
    { targetSubjectId: "general-science", relationship: "includes", description: "History of science reveals how scientific understanding evolved", strength: 0.5 },
  ],
  "engineering": [
    { targetSubjectId: "mathematics", relationship: "built on", description: "All engineering disciplines are built on mathematical principles", strength: 0.9 },
    { targetSubjectId: "computer-science", relationship: "uses", description: "Modern engineering relies on computational tools and software", strength: 0.7 },
    { targetSubjectId: "general-science", relationship: "applies", description: "Engineering applies scientific principles to solve practical problems", strength: 0.8 },
    { targetSubjectId: "business", relationship: "serves", description: "Engineering solutions must meet business requirements and constraints", strength: 0.5 },
  ],
  "general-science": [
    { targetSubjectId: "mathematics", relationship: "uses", description: "All sciences use mathematics as a tool for modeling and analysis", strength: 0.8 },
    { targetSubjectId: "engineering", relationship: "applied as", description: "Scientific discoveries are translated into practical solutions through engineering", strength: 0.7 },
    { targetSubjectId: "history", relationship: "has", description: "The history of science shows how knowledge progresses through inquiry", strength: 0.5 },
    { targetSubjectId: "artificial-intelligence", relationship: "accelerates", description: "AI accelerates scientific research across all disciplines", strength: 0.6 },
  ],
  "writing": [
    { targetSubjectId: "history", relationship: "records", description: "Writing preserves and communicates historical knowledge", strength: 0.5 },
    { targetSubjectId: "business", relationship: "essential for", description: "Effective writing is essential for business communication", strength: 0.6 },
    { targetSubjectId: "law", relationship: "critical for", description: "Legal practice requires precise and persuasive writing", strength: 0.6 },
  ],
};

export class MultiDisciplineConnector {
  getAllConnections(subjectId: string): DisciplineConnection[] {
    const subjectConnections = SUBJECT_CONNECTIONS[subjectId];
    if (!subjectConnections) return [];

    const connections: DisciplineConnection[] = [];

    for (const conn of subjectConnections) {
      const targetProfile = ProfileRegistry.get(conn.targetSubjectId);
      if (!targetProfile) continue;

      connections.push({
        sourceSubjectId: subjectId,
        sourceConcept: ProfileRegistry.get(subjectId)?.name ?? subjectId,
        targetSubjectId: conn.targetSubjectId,
        targetConcept: targetProfile.name,
        relationship: conn.relationship,
        description: conn.description,
        strength: conn.strength,
      });
    }

    return connections.sort((a, b) => b.strength - a.strength);
  }

  getStrongestConnections(subjectId: string, limit: number = 3): DisciplineConnection[] {
    return this.getAllConnections(subjectId).slice(0, limit);
  }

  findConnectionPath(sourceSubjectId: string, targetSubjectId: string): DisciplineConnection[] {
    const direct = this.getAllConnections(sourceSubjectId)
      .filter((c) => c.targetSubjectId === targetSubjectId);
    if (direct.length > 0) return direct;

    const intermediate: DisciplineConnection[] = [];
    const sourceConnections = this.getAllConnections(sourceSubjectId);
    for (const conn of sourceConnections) {
      const deeper = this.getAllConnections(conn.targetSubjectId)
        .filter((c) => c.targetSubjectId === targetSubjectId);
      intermediate.push(...deeper);
    }

    return intermediate;
  }

  getAllRelatedSubjects(subjectId: string): { subjectId: string; name: string; relationship: string; strength: number }[] {
    const connections = this.getAllConnections(subjectId);
    return connections.map((c) => ({
      subjectId: c.targetSubjectId,
      name: c.targetConcept,
      relationship: c.relationship,
      strength: c.strength,
    }));
  }
}
