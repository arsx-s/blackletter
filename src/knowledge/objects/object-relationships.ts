import type { KnowledgeObject, RelationshipType, ObjectRelationship } from "../types";
import { KnowledgeObjectStore } from "./object-store";

export class ObjectRelationshipEngine {
  private store: KnowledgeObjectStore;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
  }

  autoConnect(object: KnowledgeObject): ObjectRelationship[] {
    const newRelationships: ObjectRelationship[] = [];
    const allOthers = this.store.getAll().filter((o) => o.id !== object.id);

    for (const other of allOthers) {
      if (object.relationships.some((r) => r.targetId === other.id)) continue;

      const rel = this.inferRelationship(object, other);
      if (rel) {
        object.relationships.push(rel);
        newRelationships.push(rel);

        const reciprocal = this.inferRelationship(other, object);
        if (reciprocal && !other.relationships.some((r) => r.targetId === object.id)) {
          other.relationships.push(reciprocal);
          this.store.update(other.id, { relationships: other.relationships });
        }
      }
    }

    if (newRelationships.length > 0) {
      this.store.update(object.id, { relationships: object.relationships });
    }

    return newRelationships;
  }

  connectBySubject(object: KnowledgeObject): ObjectRelationship[] {
    const connections: ObjectRelationship[] = [];
    const sameSubject = this.store.getAll().filter(
      (o) => o.subjectId === object.subjectId && o.id !== object.id && !object.relationships.some((r) => r.targetId === o.id),
    );

    for (const other of sameSubject.slice(0, 10)) {
      const rel: ObjectRelationship = {
        targetId: other.id,
        type: "related",
        strength: 0.4,
        label: `Related ${other.type} in ${other.subjectName}`,
      };
      object.relationships.push(rel);
      connections.push(rel);
    }

    if (connections.length > 0) {
      this.store.update(object.id, { relationships: object.relationships });
    }

    return connections;
  }

  connectByTag(object: KnowledgeObject, tag: string): ObjectRelationship[] {
    const connections: ObjectRelationship[] = [];
    const tagged = this.store.getByTag(tag).filter(
      (o) => o.id !== object.id && !object.relationships.some((r) => r.targetId === o.id),
    );

    for (const other of tagged) {
      const rel: ObjectRelationship = {
        targetId: other.id,
        type: "related",
        strength: 0.5,
        label: `Shares tag "${tag}"`,
      };
      object.relationships.push(rel);
      connections.push(rel);
    }

    if (connections.length > 0) {
      this.store.update(object.id, { relationships: object.relationships });
    }

    return connections;
  }

  connectPrerequisites(object: KnowledgeObject): ObjectRelationship[] {
    if (!object.content.prerequisiteIds || object.content.prerequisiteIds.length === 0) return [];

    const connections: ObjectRelationship[] = [];
    for (const prereqId of object.content.prerequisiteIds) {
      if (object.relationships.some((r) => r.targetId === prereqId)) continue;

      const prereq = this.store.get(prereqId);
      if (!prereq) continue;

      const rel: ObjectRelationship = {
        targetId: prereqId,
        type: "prerequisite",
        strength: 0.8,
        label: `Requires understanding of ${prereq.title}`,
      };
      object.relationships.push(rel);
      connections.push(rel);

      if (!prereq.relationships.some((r) => r.targetId === object.id)) {
        prereq.relationships.push({
          targetId: object.id,
          type: "builds-on",
          strength: 0.7,
          label: `${object.title} builds on this`,
        });
        this.store.update(prereq.id, { relationships: prereq.relationships });
      }
    }

    if (connections.length > 0) {
      this.store.update(object.id, { relationships: object.relationships });
    }

    return connections;
  }

  getRelated(objectId: string, minStrength: number = 0.3): { object: KnowledgeObject; relationship: ObjectRelationship }[] {
    const obj = this.store.get(objectId);
    if (!obj) return [];

    return obj.relationships
      .filter((r) => r.strength >= minStrength)
      .map((r) => {
        const target = this.store.get(r.targetId);
        return target ? { object: target, relationship: r } : null;
      })
      .filter(Boolean) as { object: KnowledgeObject; relationship: ObjectRelationship }[];
  }

  getByRelationshipType(objectId: string, type: RelationshipType): KnowledgeObject[] {
    const obj = this.store.get(objectId);
    if (!obj) return [];

    return obj.relationships
      .filter((r) => r.type === type)
      .map((r) => this.store.get(r.targetId))
      .filter(Boolean) as KnowledgeObject[];
  }

  findPath(sourceId: string, targetId: string, maxDepth: number = 4): string[] | null {
    if (sourceId === targetId) return [sourceId];

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: sourceId, path: [sourceId] }];
    visited.add(sourceId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth) continue;

      const obj = this.store.get(current.id);
      if (!obj) continue;

      for (const rel of obj.relationships) {
        if (rel.targetId === targetId) {
          return [...current.path, targetId];
        }
        if (!visited.has(rel.targetId)) {
          visited.add(rel.targetId);
          queue.push({ id: rel.targetId, path: [...current.path, rel.targetId] });
        }
      }
    }

    return null;
  }

  getConnectedSubjects(objectId: string): { subjectId: string; subjectName: string; strength: number }[] {
    const obj = this.store.get(objectId);
    if (!obj) return [];

    const subjects = new Map<string, { subjectId: string; subjectName: string; strength: number }>();

    for (const rel of obj.relationships) {
      const target = this.store.get(rel.targetId);
      if (target && target.subjectId !== obj.subjectId) {
        const existing = subjects.get(target.subjectId);
        if (existing) {
          existing.strength = Math.max(existing.strength, rel.strength);
        } else {
          subjects.set(target.subjectId, {
            subjectId: target.subjectId,
            subjectName: target.subjectName,
            strength: rel.strength,
          });
        }
      }
    }

    return Array.from(subjects.values()).sort((a, b) => b.strength - a.strength);
  }

  getGraphData(): { nodes: { id: string; label: string; type: string; subject: string }[]; edges: { source: string; target: string; type: string; strength: number }[] } {
    const objects = this.store.getAll();
    const nodes = objects.map((o) => ({
      id: o.id,
      label: o.title,
      type: o.type,
      subject: o.subjectName,
    }));

    const edges: { source: string; target: string; type: string; strength: number }[] = [];
    const seen = new Set<string>();

    for (const obj of objects) {
      for (const rel of obj.relationships) {
        const key = `${obj.id}-${rel.targetId}-${rel.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            source: obj.id,
            target: rel.targetId,
            type: rel.type,
            strength: rel.strength,
          });
        }
      }
    }

    return { nodes, edges };
  }

  private inferRelationship(a: KnowledgeObject, b: KnowledgeObject): ObjectRelationship | null {
    if (a.subjectId === b.subjectId && a.type === b.type) {
      return { targetId: b.id, type: "related", strength: 0.5, label: `Related ${a.type}` };
    }

    if (a.subjectId === b.subjectId) {
      return { targetId: b.id, type: "related", strength: 0.4, label: `Related in ${a.subjectName}` };
    }

    const aWords = new Set(a.title.toLowerCase().split(/\s+/));
    const bWords = new Set(b.title.toLowerCase().split(/\s+/));
    const shared = [...aWords].filter((w) => bWords.has(w) && w.length > 3);

    if (shared.length > 0) {
      return { targetId: b.id, type: "cross-discipline", strength: 0.3 + shared.length * 0.1, label: `Shared concept: ${shared[0]}` };
    }

    const aTags = new Set(a.tags.map((t) => t.toLowerCase()));
    const bTags = new Set(b.tags.map((t) => t.toLowerCase()));
    const sharedTags = [...aTags].filter((t) => bTags.has(t));

    if (sharedTags.length > 0) {
      return { targetId: b.id, type: "related", strength: 0.3, label: `Shared tag: ${sharedTags[0]}` };
    }

    return null;
  }
}
