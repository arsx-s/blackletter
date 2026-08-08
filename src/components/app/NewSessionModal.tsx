import { useEffect, useState } from "react";
import { Layers, FileText, Folder } from "lucide-react";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import { workspaceStore } from "../../stores/workspace-store";

export function NewSessionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const state = workspaceStore.getState();
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(state.activeWorkspaceId);
  const [folderId, setFolderId] = useState<string | "">("");

  useEffect(() => {
    if (!isOpen) return;
    const fresh = workspaceStore.getState();
    setName("");
    setWorkspaceId(fresh.activeWorkspaceId);
    setFolderId("");
  }, [isOpen]);

  const workspaces = state.workspaces.filter((w) => !w.archived);
  const folders = state.folders.filter((f) => f.workspaceId === workspaceId);

  const handleCreate = () => {
    workspaceStore.createSession({
      workspaceId,
      name: name.trim() || "Untitled Research",
      folderId: folderId || null,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-md bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-accent" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-bone">New Research Session</p>
            <p className="font-sans text-xs text-muted">Give it a name and choose where it lives.</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted mb-1.5 block">Session name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Untitled Research"
            className="w-full bg-bone/[0.04] border border-border px-3 py-2 font-sans text-sm outline-none focus:border-accent/50 rounded-md placeholder:text-muted/40"
          />
        </label>

        <label className="block mb-4">
          <span className="font-mono text-xs uppercase tracking-ultra text-muted mb-1.5 block">Workspace</span>
          <div className="relative">
            <Layers size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={workspaceId}
              onChange={(e) => { setWorkspaceId(e.target.value); setFolderId(""); }}
              className="w-full appearance-none bg-bone/[0.03] border border-border rounded-md pl-8 pr-3 py-2 font-sans text-sm text-bone/80 outline-none focus:border-accent/50"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </label>

        <label className="block mb-5">
          <span className="font-mono text-[10px] uppercase tracking-ultra text-muted/70 mb-1.5 block">Folder (optional)</span>
          <div className="relative">
            <Folder size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-bone/[0.03] border border-border rounded-md pl-8 pr-3 py-2 font-sans text-sm text-bone/80 outline-none focus:border-accent/50 appearance-none"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </label>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate}>Create session</Button>
        </div>
      </div>
    </Modal>
  );
}