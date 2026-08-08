import type { Bookmark, BookmarkType, ResearchProject } from "../types";

let idCounter = 0;

function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class BookmarkEngine {
  addBookmark(
    project: ResearchProject,
    type: BookmarkType,
    title: string,
    description: string,
    targetId: string,
    targetContext: string,
    tags: string[] = [],
  ): Bookmark {
    const bookmark: Bookmark = {
      id: genId("bm"),
      type,
      title,
      description,
      targetId,
      targetContext,
      tags,
      createdAt: Date.now(),
    };

    project.bookmarks.push(bookmark);
    project.updatedAt = Date.now();
    return bookmark;
  }

  removeBookmark(project: ResearchProject, bookmarkId: string): boolean {
    const index = project.bookmarks.findIndex((b) => b.id === bookmarkId);
    if (index === -1) return false;
    project.bookmarks.splice(index, 1);
    project.updatedAt = Date.now();
    return true;
  }

  getBookmarks(
    project: ResearchProject,
    options?: {
      types?: BookmarkType[];
      tags?: string[];
      search?: string;
    },
  ): Bookmark[] {
    let bookmarks = [...project.bookmarks];

    if (options?.types && options.types.length > 0) {
      bookmarks = bookmarks.filter((b) => options.types!.includes(b.type));
    }

    if (options?.tags && options.tags.length > 0) {
      bookmarks = bookmarks.filter((b) =>
        options.tags!.some((t) => b.tags.includes(t)),
      );
    }

    if (options?.search) {
      const lower = options.search.toLowerCase();
      bookmarks = bookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(lower) ||
          b.description.toLowerCase().includes(lower),
      );
    }

    return bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  }

  getBookmarksByType(project: ResearchProject): Record<BookmarkType, Bookmark[]> {
    const grouped: Record<string, Bookmark[]> = {};

    for (const b of project.bookmarks) {
      const arr = grouped[b.type] ?? [];
      arr.push(b);
      grouped[b.type] = arr;
    }

    return grouped as Record<BookmarkType, Bookmark[]>;
  }

  searchBookmarks(project: ResearchProject, query: string): Bookmark[] {
    return this.getBookmarks(project, { search: query });
  }

  getRecentBookmarks(project: ResearchProject, limit: number = 10): Bookmark[] {
    return [...project.bookmarks]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getBookmarkCount(project: ResearchProject): number {
    return project.bookmarks.length;
  }
}
