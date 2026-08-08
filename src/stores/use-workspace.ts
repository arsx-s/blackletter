import { useEffect, useSyncExternalStore } from "react";
import { workspaceStore } from "./workspace-store";
import type { AppState } from "../types/workspace";

export function useWorkspaceStore(): AppState {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getState, workspaceStore.getState);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void workspaceStore.hydrate();
  }, []);
  return children;
}

export { workspaceStore };
export type { AppState };
