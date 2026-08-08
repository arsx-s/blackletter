import type { PersonalLibrary, KnowledgeObject, KnowledgeCollection } from "../types";
import { createPersonalLibrary } from "../types";
import { KnowledgeObjectStore } from "../objects/object-store";

const STORAGE_KEY = "bl_kos_library";

export class PersonalLibraryManager {
  private store: KnowledgeObjectStore;
  private library: PersonalLibrary;

  constructor(store: KnowledgeObjectStore) {
    this.store = store;
    this.library = this.load();
  }

  getLibrary(): PersonalLibrary {
    return this.library;
  }

  getCollection(name: keyof PersonalLibrary): KnowledgeCollection {
    return this.library[name];
  }

  refresh(objectId?: string): void {
    const all = this.store.getAll();
    const sortedByRecent = [...all].sort((a, b) => b.createdAt - a.createdAt);
    const sortedByAccess = [...all].sort((a, b) => b.accessCount - a.accessCount);
    const sortedByConfidence = [...all].sort((a, b) => b.confidence - a.confidence);
    const now = Date.now();
    const oneDay = 86_400_000;

    this.library.recentlyLearned.objectIds = sortedByRecent.slice(0, 20).map((o) => o.id);
    this.library.recentlyLearned.updatedAt = now;

    this.library.mostUsed.objectIds = sortedByAccess.slice(0, 20).map((o) => o.id);
    this.library.mostUsed.updatedAt = now;

    this.library.frequentlyReferenced.objectIds = all
      .filter((o) => o.sources.length > 1 || o.relationships.length > 3)
      .sort((a, b) => (b.relationships.length + b.sources.length) - (a.relationships.length + a.sources.length))
      .slice(0, 15)
      .map((o) => o.id);
    this.library.frequentlyReferenced.updatedAt = now;

    this.library.currentlyStudying.objectIds = sortedByRecent
      .filter((o) => o.confidence < 0.7)
      .slice(0, 10)
      .map((o) => o.id);
    this.library.currentlyStudying.updatedAt = now;

    this.library.mastered.objectIds = all
      .filter((o) => o.confidence >= 0.8)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20)
      .map((o) => o.id);
    this.library.mastered.updatedAt = now;

    this.library.needsRevision.objectIds = all
      .filter((o) => {
        const daysSinceUpdate = (now - o.updatedAt) / oneDay;
        return (o.confidence < 0.4 && daysSinceUpdate > 3) || (o.confidence < 0.6 && daysSinceUpdate > 14);
      })
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 15)
      .map((o) => o.id);
    this.library.needsRevision.updatedAt = now;

    if (objectId) {
      this.addToCollection("recentlyLearned", objectId);
      const obj = this.store.get(objectId);
      if (obj && obj.confidence >= 0.8) {
        this.addToCollection("mastered", objectId);
      }
    }

    this.save();
  }

  addToCollection(collectionName: keyof PersonalLibrary, objectId: string): void {
    const collection = this.library[collectionName];
    if (!collection.objectIds.includes(objectId)) {
      collection.objectIds.unshift(objectId);
      if (collection.objectIds.length > 50) {
        collection.objectIds.pop();
      }
      collection.updatedAt = Date.now();
    }
  }

  removeFromCollection(collectionName: keyof PersonalLibrary, objectId: string): void {
    const collection = this.library[collectionName];
    collection.objectIds = collection.objectIds.filter((id) => id !== objectId);
    collection.updatedAt = Date.now();
  }

  toggleBookmark(objectId: string): boolean {
    const bookmarks = this.library.bookmarked.objectIds;
    const index = bookmarks.indexOf(objectId);
    if (index >= 0) {
      bookmarks.splice(index, 1);
      this.library.bookmarked.updatedAt = Date.now();
      this.save();
      return false;
    } else {
      bookmarks.unshift(objectId);
      this.library.bookmarked.updatedAt = Date.now();
      this.save();
      return true;
    }
  }

  isBookmarked(objectId: string): boolean {
    return this.library.bookmarked.objectIds.includes(objectId);
  }

  private load(): PersonalLibrary {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as PersonalLibrary;
    } catch { console.warn("[PersonalLibrary] Operation failed"); }
    return createPersonalLibrary();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.library));
    } catch { console.warn("[PersonalLibrary] Operation failed"); }
  }
}
