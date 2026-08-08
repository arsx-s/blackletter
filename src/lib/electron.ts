export function isElectron(): boolean {
  return typeof window !== "undefined" && "electronAPI" in window;
}

export function openExternalUrl(url: string): void {
  if (isElectron()) {
    try {
      window.electronAPI!.openExternal(url);
      return;
    } catch {
      /* fall through to window.open */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
