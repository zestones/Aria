/**
 * Agent Inspector — M8.5.
 *
 * Bottom drawer (40vh) that exposes the live internals of an agent turn:
 * thinking stream, tool calls, raw event IO, and a Memory stub derived from
 * read-style tool calls. Mounts inside the app's `<main>` region so it
 * never obstructs the chat drawer on the right.
 *
 * Open/close is driven by `useAgentInspectorStore.agent`; closing the
 * inspector does not interrupt the agent — the underlying WS unsubscribes,
 * the backend run continues independently.
 */

import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useRef } from "react";
import { Badge, Icons, Tabs, TabsContent, TabsList, TabsTrigger } from "../../design-system";
import { useAgentInspectorStore } from "./agentInspectorStore";
import type { HandoffEvent, ToolRun } from "./types";
import type { RawAgentEvent } from "./useAgentStream";
import { useAgentStream } from "./useAgentStream";

const KNOWN_AGENTS = new Set([
    "sentinel",
    "investigator",
    "kb_builder",
    "work_order",
    "qa",
] as const);
type KnownAgent = "sentinel" | "investigator" | "kb_builder" | "work_order" | "qa";

/**
 * MCP read-style tool names that populate the Memory tab. Matches the
 * backend MCP catalog (cf. M2.x) — keep in sync if new read tools land.
 */
const MEMORY_TOOLS = new Set([
    "get_equipment_kb",
    "get_failure_history",
    "get_cell_signals",
    "get_work_order",
    "search_kb",
]);

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB builder";
    if (id === "work_order") return "Work order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function truncateId(id: string | null): string {
    if (!id) return "—";
    if (id.length <= 10) return id;
    return `${id.slice(0, 8)}…`;
}

export function AgentInspector() {
    const agent = useAgentInspectorStore((s) => s.agent);
    const close = useAgentInspectorStore((s) => s.close);

    // Keep AnimatePresence driven by `open` derived from `agent !== null`.
    const open = agent !== null;

    return (
        <AnimatePresence>
            {open && agent && <AgentInspectorDrawer agent={agent} onClose={close} />}
        </AnimatePresence>
    );
}

interface AgentInspectorDrawerProps {
    agent: string;
    onClose: () => void;
}

const AgentInspectorDrawer = memo(function AgentInspectorDrawer({
    agent,
    onClose,
}: AgentInspectorDrawerProps) {
    const { thinking, tools, handoffs, rawEvents, turnId, isStreaming } = useAgentStream(agent);
    const agentKey: KnownAgent | undefined = KNOWN_AGENTS.has(agent as KnownAgent)
        ? (agent as KnownAgent)
        : undefined;

    // Esc to close — mirrors DS Drawer behaviour.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <motion.aside
            role="dialog"
            aria-modal={false}
            aria-labelledby="agent-inspector-heading"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 z-30 flex h-[40vh] min-h-[280px] flex-col overflow-hidden rounded-t-[var(--ds-radius-md)] border-t border-[var(--ds-border)] bg-[var(--ds-bg-surface)]"
            style={{ boxShadow: "var(--ds-shadow-overlay)" }}
        >
            <InspectorHeader
                agent={agent}
                agentKey={agentKey}
                turnId={turnId}
                isStreaming={isStreaming}
                onClose={onClose}
            />
            <Tabs defaultValue="thinking" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="px-4 pt-2">
                    <TabsTrigger value="thinking">
                        <Icons.Cpu className="mr-1.5 size-3.5" aria-hidden />
                        Thinking
                    </TabsTrigger>
                    <TabsTrigger value="tools">
                        <Icons.Wrench className="mr-1.5 size-3.5" aria-hidden />
                        Tools used
                    </TabsTrigger>
                    <TabsTrigger value="io">
                        <Icons.FileText className="mr-1.5 size-3.5" aria-hidden />
                        Inputs & outputs
                    </TabsTrigger>
                    <TabsTrigger value="memory">
                        <Icons.Database className="mr-1.5 size-3.5" aria-hidden />
                        Memory
                    </TabsTrigger>
                </TabsList>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <TabsContent value="thinking" className="h-full">
                        <ThinkingPanel thinking={thinking} isStreaming={isStreaming} />
                    </TabsContent>
                    <TabsContent value="tools" className="h-full">
                        <ToolsPanel tools={tools} handoffs={handoffs} />
                    </TabsContent>
                    <TabsContent value="io" className="h-full">
                        <IoPanel rawEvents={rawEvents} />
                    </TabsContent>
                    <TabsContent value="memory" className="h-full">
                        <MemoryPanel tools={tools} />
                    </TabsContent>
                </div>
            </Tabs>
        </motion.aside>
    );
});

interface InspectorHeaderProps {
    agent: string;
    agentKey: KnownAgent | undefined;
    turnId: string | null;
    isStreaming: boolean;
    onClose: () => void;
}

function InspectorHeader({ agent, agentKey, turnId, isStreaming, onClose }: InspectorHeaderProps) {
    return (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
                <h2
                    id="agent-inspector-heading"
                    className="flex items-center gap-2 text-[var(--ds-text-lg)] font-semibold text-[var(--ds-fg-primary)]"
                >
                    {agentKey ? (
                        <Badge variant="agent" agent={agentKey} size="md">
                            {formatAgentLabel(agent)}
                        </Badge>
                    ) : (
                        <Badge variant="default" size="md">
                            {formatAgentLabel(agent)}
                        </Badge>
                    )}
                    <span>Agent inspector</span>
                </h2>
                <span className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                    Turn <span className="font-mono">{truncateId(turnId)}</span>
                    {" · "}
                    {isStreaming ? "Streaming" : "Idle"}
                </span>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Close agent inspector"
                className="inline-flex size-8 items-center justify-center rounded-[var(--ds-radius-sm)] text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
            >
                <Icons.X className="size-4" aria-hidden />
            </button>
        </header>
    );
}

interface ThinkingPanelProps {
    thinking: string;
    isStreaming: boolean;
}

function ThinkingPanel({ thinking, isStreaming }: ThinkingPanelProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to bottom on every thinking delta. `thinking` itself is not
    // read in the callback (we only touch the DOM ref), so Biome's
    // `useExhaustiveDependencies` flags it as "unnecessary" — but without it
    // the effect never re-runs and the stream stops scrolling. Intentional.
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-run per thinking delta
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [thinking]);

    const hasContent = thinking.length > 0;

    return (
        <section
            ref={scrollRef}
            className="h-full overflow-y-auto px-4 py-3"
            aria-live="polite"
            aria-busy={isStreaming}
            aria-label="Agent extended thinking stream"
        >
            {hasContent ? (
                <pre
                    className="whitespace-pre-wrap break-words font-mono text-[var(--ds-text-sm)] leading-[1.55]"
                    style={{
                        color: "color-mix(in oklab, var(--ds-agent-investigator), var(--ds-fg-muted) 45%)",
                    }}
                >
                    {thinking}
                    {isStreaming && (
                        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[var(--ds-accent)] align-middle" />
                    )}
                </pre>
            ) : isStreaming ? (
                <p className="flex items-center gap-2 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                    <Icons.Activity className="size-3.5 animate-pulse" aria-hidden />
                    <span>Thinking…</span>
                </p>
            ) : (
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                    No extended thinking captured for this turn yet.
                </p>
            )}
        </section>
    );
}

interface ToolsPanelProps {
    tools: ToolRun[];
    handoffs: HandoffEvent[];
}

function ToolsPanel({ tools, handoffs }: ToolsPanelProps) {
    const empty = tools.length === 0 && handoffs.length === 0;
    return (
        <div className="h-full overflow-y-auto px-4 py-3">
            {empty ? (
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                    No tool activity yet.
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {tools.map((run) => (
                        <ToolRow key={run.id} run={run} />
                    ))}
                    {handoffs.map((h) => (
                        <HandoffRow key={h.id} handoff={h} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function ToolRow({ run }: { run: ToolRun }) {
    const argsPreview = useMemo(() => {
        try {
            const raw = JSON.stringify(run.args);
            return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
        } catch {
            return "{…}";
        }
    }, [run.args]);

    return (
        <li>
            <details className="group rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[var(--ds-text-xs)]">
                    {run.status === "running" ? (
                        <Icons.Activity
                            className="size-3.5 flex-none animate-pulse text-[var(--ds-fg-subtle)]"
                            aria-hidden
                        />
                    ) : (
                        <Icons.Check
                            className="size-3.5 flex-none text-[var(--ds-status-nominal)]"
                            aria-hidden
                        />
                    )}
                    <span className="font-mono text-[var(--ds-fg-primary)]">{run.toolName}</span>
                    <span className="truncate font-mono text-[var(--ds-fg-subtle)]">
                        {argsPreview}
                    </span>
                    <span className="ml-auto flex-none text-[var(--ds-fg-muted)]">
                        {run.durationMs != null ? `${run.durationMs} ms` : "—"}
                    </span>
                </summary>
                <pre className="whitespace-pre-wrap break-words border-t border-[var(--ds-border)] px-3 py-2 font-mono text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                    {safeStringify(run.args)}
                </pre>
            </details>
        </li>
    );
}

function HandoffRow({ handoff }: { handoff: HandoffEvent }) {
    return (
        <li className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-dashed border-[var(--ds-border)] px-3 py-2 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
            <Icons.ArrowRight className="size-3.5 flex-none" aria-hidden />
            <span>Handoff</span>
            <span className="font-mono text-[var(--ds-fg-primary)]">{handoff.from_agent}</span>
            <Icons.ChevronRight
                className="size-3 flex-none text-[var(--ds-fg-subtle)]"
                aria-hidden
            />
            <span className="font-mono text-[var(--ds-fg-primary)]">{handoff.to_agent}</span>
            <span className="ml-1 truncate text-[var(--ds-fg-subtle)]">· {handoff.reason}</span>
        </li>
    );
}

function IoPanel({ rawEvents }: { rawEvents: RawAgentEvent[] }) {
    if (rawEvents.length === 0) {
        return (
            <div className="h-full overflow-y-auto px-4 py-3">
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                    No events received yet for this turn.
                </p>
            </div>
        );
    }
    return (
        <div className="h-full overflow-y-auto px-4 py-3">
            <ol className="flex flex-col gap-2">
                {rawEvents.map((evt) => (
                    <li
                        key={evt.id}
                        className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)]"
                    >
                        <div className="flex items-center gap-2 border-b border-[var(--ds-border)] px-3 py-1.5 text-[var(--ds-text-xs)]">
                            <span className="font-mono text-[var(--ds-accent)]">{evt.type}</span>
                            <span className="ml-auto text-[var(--ds-fg-subtle)]">
                                {new Date(evt.at).toLocaleTimeString()}
                            </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                            {safeStringify(evt.payload)}
                        </pre>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function MemoryPanel({ tools }: { tools: ToolRun[] }) {
    const memoryHits = useMemo(() => tools.filter((t) => MEMORY_TOOLS.has(t.toolName)), [tools]);
    if (memoryHits.length === 0) {
        return (
            <div className="h-full overflow-y-auto px-4 py-3">
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                    No KB or failure-history entries touched yet.
                </p>
                <p className="mt-2 text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                    Inferred from read-style MCP tools: {Array.from(MEMORY_TOOLS).join(", ")}.
                </p>
            </div>
        );
    }
    return (
        <div className="h-full overflow-y-auto px-4 py-3">
            <ul className="flex flex-col gap-1.5">
                {memoryHits.map((hit) => (
                    <li
                        key={hit.id}
                        className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-[var(--ds-text-xs)]"
                    >
                        <Icons.Database
                            className="size-3.5 flex-none text-[var(--ds-fg-muted)]"
                            aria-hidden
                        />
                        <span className="font-mono text-[var(--ds-fg-primary)]">
                            {hit.toolName}
                        </span>
                        <span className="truncate font-mono text-[var(--ds-fg-subtle)]">
                            {safeStringify(hit.args)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
