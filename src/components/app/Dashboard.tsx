import { ArrowUpRight, Clock, FileText, Layers, Layout, Plus, Star, Upload } from "lucide-react";
import { workspaceStore } from "../../stores/workspace-store";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { useGreeting } from "../../lib/use-greeting";

export function Dashboard({ userName, onNewSession }: { userName: string; onNewSession: () => void }) {
  const state = useWorkspaceStore();
  const { greeting, subtitle } = useGreeting();

  const pinned = state.tabs.filter((t) => t.pinned).sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt));
  const recents = [...state.tabs].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)).slice(0, 5);
  const favorites = state.workspaces.filter((w) => w.favorite && !w.archived);
  const recentDocs = [...state.documents].sort((a, b) => b.addedAt - a.addedAt).slice(0, 5);
  const workspaceName = (id: string) => state.workspaces.find((w) => w.id === id)?.name ?? "Workspace";

  const quickActions: Array<{ label: string; desc: string; icon: typeof Plus; onClick: () => void }> = [
    { label: "New Research", desc: "Open a fresh session", icon: Plus, onClick: onNewSession },
    { label: "Research Canvas", desc: "Visual workspace of blocks", icon: Layout, onClick: () => workspaceStore.setPrefs({ canvasViewOpen: true }) },
    { label: "New Workspace", desc: "Start a new area of work", icon: Layers, onClick: () => { const id = workspaceStore.createWorkspace("Untitled Workspace"); workspaceStore.beginRenameWorkspace(id); } },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-3">Workspace · {workspaceName(state.activeWorkspaceId)}</p>
        <h1 className="font-display text-4xl font-black tracking-tighter leading-[0.95] mb-1">
          {greeting.text}, {userName || "Researcher"}.
        </h1>
        <p className="font-sans text-sm text-muted mb-8 max-w-lg">{subtitle}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="group flex items-center gap-3 border border-border bg-surface/40 hover:bg-surface rounded-md px-4 py-3 text-left transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-bone/5 border border-border flex items-center justify-center group-hover:bg-accent group-hover:text-surface transition-colors">
                <action.icon size={14} />
              </div>
              <div className="min-w-0">
                <p className="font-sans text-xs font-medium text-bone/80">{action.label}</p>
                <p className="font-sans text-2xs text-muted">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {pinned.length > 0 && (
          <Section title="Pinned Research" count={pinned.length}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pinned.map((tab) => (
                <HitCard
                  key={tab.id}
                  title={tab.title}
                  detail={`${workspaceName(tab.workspaceId)} · ${new Date(tab.updatedAt).toLocaleDateString()}`}
                  icon={<Star size={12} className="fill-accent text-accent" />}
                  onClick={() => workspaceStore.setActiveTab(tab.id)}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Recent Research" count={recents.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recents.map((tab) => (
              <HitCard
                key={tab.id}
                title={tab.title}
                detail={`${workspaceName(tab.workspaceId)} · ${new Date(tab.updatedAt).toLocaleString()}`}
                icon={<FileText size={12} />}
                onClick={() => workspaceStore.setActiveTab(tab.id)}
              />
            ))}
          </div>
        </Section>

        {favorites.length > 0 && (
          <Section title="Favorite Workspaces" count={favorites.length}>
            <div className="flex flex-wrap gap-2">
              {favorites.map((w) => (
                <button
                  key={w.id}
                  onClick={() => workspaceStore.setActiveWorkspace(w.id)}
                  className="flex items-center gap-2 border border-border bg-bone/[0.03] hover:bg-bone/5 rounded-md px-3 py-2 transition-colors"
                >
                  <Star size={11} className="fill-accent text-accent" />
                  <span className="font-sans text-xs text-bone/80">{w.name}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Recent Documents" count={recentDocs.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recentDocs.map((doc) => (
              <HitCard
                key={doc.id}
                title={doc.name}
                detail={`${workspaceName(doc.workspaceId)} · ${new Date(doc.addedAt).toLocaleString()}`}
                icon={<Upload size={12} />}
                onClick={() => {
                  workspaceStore.setActiveWorkspace(doc.workspaceId);
                  workspaceStore.setPrefs({ documentsViewOpen: true, focusDocumentId: doc.id });
                }}
              />
            ))}
          </div>
        </Section>

        {(recents.length === 0 && recentDocs.length === 0 && pinned.length === 0) && (
          <div className="flex items-center gap-3 border border-dashed border-border rounded-md px-6 py-10 justify-center text-center">
            <div>
              <p className="font-sans text-sm text-muted mb-2 flex items-center justify-center gap-2"><Clock size={13} /> Nothing here yet</p>
              <button
                onClick={onNewSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-surface font-sans text-xs font-medium"
              >
                <Plus size={13} /> Start your first research session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-mono text-2xs uppercase tracking-ultra text-muted">{title}</h2>
        <span className="font-mono text-2xs text-muted/50">{count}</span>
      </div>
      {children}
    </section>
  );
}

function HitCard({ title, detail, icon, onClick }: { title: string; detail: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 border border-border bg-background/40 hover:bg-surface rounded-md px-3.5 py-3 text-left transition-colors"
    >
      <span className="text-muted shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-sans text-sm text-bone/80 truncate">{title}</p>
        <p className="font-sans text-2xs text-muted truncate mt-0.5">{detail}</p>
      </div>
      <ArrowUpRight size={13} className="text-muted/50 shrink-0 group-hover:text-bone transition-colors" />
    </button>
  );
}