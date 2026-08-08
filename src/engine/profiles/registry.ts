import type { SubjectProfile } from "../types";
import { computerScienceProfile } from "./computer-science";
import { artificialIntelligenceProfile } from "./artificial-intelligence";
import { mathematicsProfile } from "./mathematics";
import { lawProfile } from "./law";
import { businessProfile } from "./business";
import { financeProfile } from "./finance";
import { economicsProfile } from "./economics";
import { historyProfile } from "./history";
import { engineeringProfile } from "./engineering";
import { generalScienceProfile } from "./general-science";
import { writingProfile } from "./writing";
import { generalKnowledgeProfile } from "./general-knowledge";

const ALL_PROFILES: SubjectProfile[] = [
  computerScienceProfile,
  artificialIntelligenceProfile,
  mathematicsProfile,
  lawProfile,
  businessProfile,
  financeProfile,
  economicsProfile,
  historyProfile,
  engineeringProfile,
  generalScienceProfile,
  writingProfile,
  generalKnowledgeProfile,
];

const profileMap = new Map<string, SubjectProfile>();

for (const p of ALL_PROFILES) {
  profileMap.set(p.id, p);
}

export class ProfileRegistry {
  static getAll(): SubjectProfile[] {
    return ALL_PROFILES;
  }

  static get(id: string): SubjectProfile | undefined {
    return profileMap.get(id);
  }

  static getDefault(): SubjectProfile {
    return generalKnowledgeProfile;
  }
}
