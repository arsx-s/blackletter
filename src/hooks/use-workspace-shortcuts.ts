import { useEffect } from "react";
import { workspaceStore } from "../stores/workspace-store";

export function useWorkspaceShortcuts(onSearch: () => void, onNewSession?: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (e.altKey && key === "arrowleft") {
        e.preventDefault();
        workspaceStore.navBack();
        return;
      }
      if (e.altKey && key === "arrowright") {
        e.preventDefault();
        workspaceStore.navForward();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (key === "n" && e.shiftKey) {
        e.preventDefault();
        workspaceStore.createWorkspace("Untitled Workspace");
        return;
      }
      if (key === "n") {
        e.preventDefault();
        if (onNewSession) {
          onNewSession();
        } else {
          workspaceStore.createTab(workspaceStore.getState().activeWorkspaceId);
        }
        return;
      }
      if (key === "w") {
        e.preventDefault();
        const active = workspaceStore.getState().activeTabId;
        if (active) workspaceStore.closeTab(active);
        return;
      }
      if (key === "s") {
        e.preventDefault();
        void workspaceStore.saveNow();
        return;
      }
      if (key === "k" || key === "p") {
        e.preventDefault();
        onSearch();
        return;
      }
      if (key === "b") {
        e.preventDefault();
        workspaceStore.toggleSidebar();
        return;
      }
      if (key === "1" || key === "2" || key === "3" || key === "4" || key === "5" || key === "6" || key === "7" || key === "8" || key === "9") {
        const state = workspaceStore.getState();
        const index = parseInt(key, 10) - 1;
        const tab = state.tabs
          .filter((t) => t.workspaceId === state.activeWorkspaceId)
          .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))[index];
        if (tab) {
          e.preventDefault();
          workspaceStore.setActiveTab(tab.id);
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearch, onNewSession]);
}