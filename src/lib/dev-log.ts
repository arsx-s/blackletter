import { workspaceStore } from "../stores/workspace-store";

export function devLog(message?: unknown, ...args: unknown[]): void {
  if (!workspaceStore.getState().prefs.developerMode) return;
  console.log(message, ...args);
}
