/**
 * WorkspacePage — the full-screen "Agent workspace".
 *
 * Two-pane layout (Claude-style):
 *
 *   ┌─ Header ─────────────────────────────────────────────────────┐
 *   ├─ Sessions ─┬─ WorkspaceChat (messages + inline artifacts) ───┤
 *   │ rail       │ centered content, composer pinned at bottom      │
 *   └────────────┴──────────────────────────────────────────────────┘
 *
 * Artifacts are rendered inline in the conversation flow rather than on a
 * separate canvas, so the full screen width is used for the chat.
 */

import { Link } from "react-router-dom";
import { AriaMark, Icons } from "../components/ui";
import { AgentInspector } from "../features/agents";
import { useAgentTurnsIngest } from "../features/agents/useAgentTurnsIngest";
import { SessionsPanel } from "../features/workspace/SessionsPanel";
import { WorkspaceChat } from "../features/workspace/WorkspaceChat";

export default function WorkspacePage() {
    useAgentTurnsIngest();

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <WorkspaceHeader />
            <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
                <SessionsPanel />
                <main className="relative min-h-0 overflow-hidden">
                    <WorkspaceChat />
                </main>
            </div>
            <AgentInspector />
        </div>
    );
}

function WorkspaceHeader() {
    return (
        <header className="flex h-16 flex-none items-center gap-3 border-b border-border bg-sidebar px-5">
            <AriaMark className="text-foreground" size={24} />
            <span aria-hidden className="h-6 w-px bg-sidebar-border/60" />
            <div className="flex items-baseline gap-2.5">
                <h1 className="text-base font-semibold tracking-[-0.015em] text-foreground">
                    Agent workspace
                </h1>
                <span className="text-xs text-text-tertiary">
                    full-canvas conversation with ARIA
                </span>
            </div>
            <div className="ml-auto">
                <Link
                    to="/control-room"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    aria-label="Back to Dashboard"
                >
                    <Icons.ArrowLeft className="size-4" aria-hidden />
                    Back to Dashboard
                </Link>
            </div>
        </header>
    );
}
