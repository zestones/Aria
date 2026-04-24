/**
 * WorkspacePage — the full-screen "Agent workspace".
 *
 * Three-pane layout:
 *
 *   ┌─ Header (slim, brand + title + close) ───────────────────────┐
 *   ├─ Timeline ─┬─ Artifact canvas ─────────────┬─ Conversation ──┤
 *   │ rail       │ (full-width, 12-col grid)     │ + composer      │
 *   └────────────┴───────────────────────────────┴─────────────────┘
 *
 * Lives outside the AppShell so the canvas can claim the entire viewport;
 * judges entering this surface from the demo see ARIA as a *workspace*,
 * not a sidebar bolted onto a dashboard. Reuses the singleton chat store
 * so the conversation here is the same conversation as the side drawer —
 * the user can roam between surfaces without losing context.
 *
 * Two entry vectors:
 *   - sidebar nav item ("Agent workspace")
 *   - "open in workspace" affordances surfaced from anomaly + chat panels
 */

import { Link } from "react-router-dom";
import { AriaMark, Icons } from "../components/ui";
import { AgentInspector } from "../features/agents";
import { useAgentTurnsIngest } from "../features/agents/useAgentTurnsIngest";
import { useThrottledMessages } from "../features/chat";
import { ArtifactCanvas } from "../features/workspace/ArtifactCanvas";
import { ConversationStream } from "../features/workspace/ConversationStream";
import { SessionsPanel } from "../features/workspace/SessionsPanel";
import { useWorkspaceArtifacts } from "../features/workspace/useWorkspaceArtifacts";

export default function WorkspacePage() {
    // Keep the singleton agent-turn buffer fed even if the user lands here
    // directly via deep link (AppShell isn't mounted on this route).
    useAgentTurnsIngest();

    const messages = useThrottledMessages();
    const artifacts = useWorkspaceArtifacts(messages);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <WorkspaceHeader artifactCount={artifacts.length} />
            <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_minmax(360px,420px)]">
                <SessionsPanel />
                <main className="relative min-h-0 overflow-hidden bg-background">
                    <ArtifactCanvas artifacts={artifacts} />
                </main>
                <aside aria-label="Conversation" className="min-h-0 border-l border-border">
                    <ConversationStream />
                </aside>
            </div>
            {/* Inspector drawer for the per-agent deep-dive — same component
                used inside AppShell so click-an-agent in the timeline opens
                a familiar surface. */}
            <AgentInspector />
        </div>
    );
}

function WorkspaceHeader({ artifactCount }: { artifactCount: number }) {
    return (
        <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-sidebar px-4">
            <AriaMark className="text-foreground" size={20} />
            <span aria-hidden className="h-5 w-px bg-sidebar-border/60" />
            <div className="flex items-baseline gap-2">
                <h1 className="text-sm font-medium tracking-[-0.01em] text-foreground">
                    Agent workspace
                </h1>
                <span className="text-[11px] text-text-tertiary">
                    full-canvas conversation with ARIA
                </span>
            </div>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-text-tertiary">
                <span className="inline-flex items-center gap-1.5">
                    <Icons.Sparkles className="size-3" aria-hidden />
                    <span className="tabular-nums">{artifactCount}</span>
                    <span>artifact{artifactCount === 1 ? "" : "s"} on canvas</span>
                </span>
                <Link
                    to="/control-room"
                    className="inline-flex h-8 items-center gap-1.5 rounded-cta border border-sidebar-border bg-sidebar-accent px-3 text-xs font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    aria-label="Back to control room"
                >
                    <Icons.ArrowLeft className="size-3.5" aria-hidden />
                    Back to control room
                </Link>
            </div>
        </header>
    );
}
