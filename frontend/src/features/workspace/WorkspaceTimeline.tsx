/**
 * WorkspaceTimeline — left rail showing agent turns chronologically.
 *
 * Each turn is a clickable row with: agent badge, finish reason / running
 * indicator, tool count, handoff arrows. Clicking a row opens the existing
 * `AgentInspector` drawer scoped to that agent.
 *
 * Pulls from the singleton `useAgentTurnsStore` so it stays accurate
 * across navigation; no extra WS subscription needed.
 */

import { Badge, Icons, StatusDot } from "../../components/ui";
import { useAgentInspectorStore } from "../agents/agentInspectorStore";
import { useAgentTurnsStore } from "../agents/agentTurnsStore";

const KNOWN_AGENTS = new Set(["sentinel", "investigator", "kb_builder", "work_order", "qa"]);

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB Builder";
    if (id === "work_order") return "Work Order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function WorkspaceTimeline() {
    const turns = useAgentTurnsStore((s) => s.turns);
    const openInspector = useAgentInspectorStore((s) => s.openForAgent);

    const ordered = Object.values(turns).sort((a, b) => a.startedAt - b.startedAt);

    return (
        <aside
            aria-label="Agent turn timeline"
            className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar/40"
        >
            <header className="flex h-12 flex-none items-center gap-2 border-b border-border px-4">
                <Icons.Activity className="size-3.5 text-text-tertiary" aria-hidden />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
                    Agent timeline
                </h2>
                <span className="ml-auto text-[11px] text-text-tertiary tabular-nums">
                    {ordered.length}
                </span>
            </header>
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {ordered.length === 0 ? (
                    <p className="px-1 py-6 text-xs text-text-tertiary">
                        No agent activity yet. Send a message to see the orchestration light up.
                    </p>
                ) : (
                    <ol className="flex flex-col gap-1.5">
                        {ordered.map((turn) => {
                            const running = turn.endedAt === null;
                            const agentKey = KNOWN_AGENTS.has(turn.agent)
                                ? (turn.agent as never)
                                : undefined;
                            return (
                                <li key={turn.turnId}>
                                    <button
                                        type="button"
                                        onClick={() => openInspector(turn.agent)}
                                        className="group flex w-full flex-col gap-1.5 rounded-md border border-transparent px-2 py-2 text-left transition-colors duration-150 hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <div className="flex items-center gap-2">
                                            {agentKey ? (
                                                <Badge variant="agent" agent={agentKey}>
                                                    {formatAgentLabel(turn.agent)}
                                                </Badge>
                                            ) : (
                                                <Badge variant="default">
                                                    {formatAgentLabel(turn.agent)}
                                                </Badge>
                                            )}
                                            {running && (
                                                <StatusDot
                                                    status="warning"
                                                    size={6}
                                                    pulse
                                                    aria-label="running"
                                                />
                                            )}
                                            <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                                                {formatClock(turn.startedAt)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 px-0.5 text-[11px] text-text-tertiary">
                                            <span className="inline-flex items-center gap-1">
                                                <Icons.Wrench className="size-3" aria-hidden />
                                                {turn.tools.length}
                                            </span>
                                            {turn.handoffs.length > 0 && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Icons.ArrowRight
                                                        className="size-3"
                                                        aria-hidden
                                                    />
                                                    {turn.handoffs.length}
                                                </span>
                                            )}
                                            {!running && turn.finishReason && (
                                                <span className="ml-auto truncate text-[10px] text-text-tertiary">
                                                    {turn.finishReason}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </aside>
    );
}
