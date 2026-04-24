/**
 * Agent Activity Feed — M8.4.
 *
 * Live timeline of the 6 agent-facing bus events (`agent_start`/`_end`,
 * `tool_call_started`/`_completed`, `agent_handoff`, `anomaly_detected`).
 * Rows fade after {@link TTL_MS}; filter chips narrow the stream to one
 * agent; clicking a row opens that agent in the Inspector (M8.5).
 *
 * Reads from `useActivityFeedStore`; the socket is opened by
 * `useActivityFeedStream` which the caller mounts once.
 */

import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useState } from "react";
import { Badge, Icons, StatusDot } from "../../components/ui";
import { type ActivityEvent, TTL_MS, useActivityFeedStore } from "./activityFeedStore";
import { useAgentInspectorStore } from "./agentInspectorStore";
import { useActivityFeedStream } from "./useActivityFeedStream";

const KNOWN_AGENTS = ["sentinel", "investigator", "kb_builder", "work_order", "qa"] as const;
type KnownAgent = (typeof KNOWN_AGENTS)[number];

const FILTER_CHIPS: Array<{ id: "all" | KnownAgent; label: string }> = [
    { id: "all", label: "All" },
    { id: "sentinel", label: "Sentinel" },
    { id: "investigator", label: "Investigator" },
    { id: "kb_builder", label: "KB builder" },
    { id: "work_order", label: "Work order" },
    { id: "qa", label: "QA" },
];

function isKnownAgent(id: string): id is KnownAgent {
    return (KNOWN_AGENTS as readonly string[]).includes(id);
}

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB builder";
    if (id === "work_order") return "Work order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function formatRelativeTime(ts: number, now: number): string {
    const diff = Math.max(0, now - ts);
    if (diff < 5_000) return "just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
}

function eventPrimaryAgent(evt: ActivityEvent): string | null {
    if (evt.kind === "agent_handoff") return evt.from_agent;
    if (evt.kind === "anomaly_detected") return "sentinel";
    return evt.agent;
}

function agentColorVar(agent: string): string | null {
    if (!isKnownAgent(agent)) return null;
    return `--ds-agent-${agent === "kb_builder" ? "kb-builder" : agent === "work_order" ? "work-order" : agent}`;
}

export function ActivityFeed() {
    useActivityFeedStream();
    const events = useActivityFeedStore((s) => s.events);
    const openForAgent = useAgentInspectorStore((s) => s.openForAgent);
    const [filter, setFilter] = useState<"all" | KnownAgent>("all");
    const [now, setNow] = useState(() => Date.now());

    // Tick so relative timestamps refresh, AND so events past TTL fade out.
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(id);
    }, []);

    const visible = useMemo(() => {
        return events.filter((e) => {
            const age = now - e.receivedAt;
            // Keep rendering for a short buffer past TTL so the fade-out can run.
            if (age > TTL_MS + 2_000) return false;
            if (filter === "all") return true;
            return eventPrimaryAgent(e) === filter;
        });
    }, [events, filter, now]);

    return (
        <section
            aria-label="Agent activity feed"
            className="flex h-full min-h-0 flex-col bg-[var(--ds-bg-surface)]"
        >
            <header className="flex flex-none flex-col gap-2 border-b border-[var(--ds-border)] px-3 py-2">
                <div className="flex items-center gap-2">
                    <Icons.Activity className="size-3.5 text-[var(--ds-fg-muted)]" aria-hidden />
                    <h3 className="text-[var(--ds-text-sm)] font-semibold text-[var(--ds-fg-primary)]">
                        Activity
                    </h3>
                    <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                        {visible.length} recent
                    </span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {FILTER_CHIPS.map((chip) => (
                        <FilterChip
                            key={chip.id}
                            active={filter === chip.id}
                            onClick={() => setFilter(chip.id)}
                        >
                            {chip.label}
                        </FilterChip>
                    ))}
                </div>
            </header>
            <ul
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2"
            >
                {visible.length === 0 ? (
                    <li className="px-2 py-3 text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                        No agent activity yet.
                    </li>
                ) : (
                    <AnimatePresence initial={false}>
                        {visible.map((evt) => (
                            <ActivityRow
                                key={evt.id}
                                evt={evt}
                                now={now}
                                onOpenInspector={openForAgent}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </ul>
        </section>
    );
}

interface FilterChipProps {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}

function FilterChip({ active, onClick, children }: FilterChipProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex h-6 items-center rounded-[var(--ds-radius-sm)] px-2 text-[11px] font-medium transition-colors duration-[var(--ds-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] ${
                active
                    ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"
                    : "text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)]"
            }`}
        >
            {children}
        </button>
    );
}

interface ActivityRowProps {
    evt: ActivityEvent;
    now: number;
    onOpenInspector: (agent: string) => void;
}

const ActivityRow = memo(function ActivityRow({ evt, now, onOpenInspector }: ActivityRowProps) {
    const age = now - evt.receivedAt;
    // Fade the row linearly over the last 30s of its TTL.
    const fadeThreshold = TTL_MS - 30_000;
    const opacity = age <= fadeThreshold ? 1 : Math.max(0, 1 - (age - fadeThreshold) / 30_000);

    const primaryAgent = eventPrimaryAgent(evt);
    const agentLabel = primaryAgent ? formatAgentLabel(primaryAgent) : "—";
    const clickable = primaryAgent != null;

    const body = (
        <>
            <AgentDot agent={primaryAgent} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {isKnownAgent(primaryAgent ?? "") ? (
                    <Badge
                        variant="agent"
                        agent={
                            primaryAgent as
                                | "sentinel"
                                | "investigator"
                                | "kb_builder"
                                | "work_order"
                                | "qa"
                        }
                    >
                        {agentLabel}
                    </Badge>
                ) : (
                    <span className="text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)]">
                        {agentLabel}
                    </span>
                )}
                <ActivityDescription evt={evt} />
            </span>
            <span className="ml-auto flex-none text-[10px] text-[var(--ds-fg-subtle)]">
                {formatRelativeTime(evt.receivedAt, now)}
            </span>
        </>
    );

    return (
        <motion.li
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="list-none"
        >
            {clickable ? (
                <button
                    type="button"
                    onClick={() => primaryAgent && onOpenInspector(primaryAgent)}
                    className="flex w-full items-center gap-2 rounded-[var(--ds-radius-sm)] px-2 py-1.5 text-left text-[11px] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                >
                    {body}
                </button>
            ) : (
                <div className="flex w-full items-center gap-2 rounded-[var(--ds-radius-sm)] px-2 py-1.5 text-[11px]">
                    {body}
                </div>
            )}
            {evt.kind === "agent_handoff" && <HandoffSweep />}
        </motion.li>
    );
});

function AgentDot({ agent }: { agent: string | null }) {
    const colorVar = agent ? agentColorVar(agent) : null;
    if (!colorVar) {
        return <StatusDot status="unknown" size={6} aria-hidden />;
    }
    return (
        <span
            aria-hidden
            className="inline-block size-[6px] flex-none rounded-full"
            style={{ backgroundColor: `var(${colorVar})` }}
        />
    );
}

function ActivityDescription({ evt }: { evt: ActivityEvent }) {
    const muted = "text-[var(--ds-fg-muted)]";
    const primary = "text-[var(--ds-fg-primary)]";
    switch (evt.kind) {
        case "agent_start":
            return <span className={muted}>thinking…</span>;
        case "agent_end":
            return (
                <span className={muted}>
                    done · <span className="font-mono">{evt.finish_reason}</span>
                </span>
            );
        case "tool_call_started":
            return (
                <span className={muted}>
                    calls <span className={`${primary} font-mono`}>{evt.tool_name}</span>
                </span>
            );
        case "tool_call_completed":
            return (
                <span className={muted}>
                    returned <span className={`${primary} font-mono`}>{evt.tool_name}</span>{" "}
                    <span className="text-[var(--ds-fg-subtle)]">· {evt.duration_ms} ms</span>
                </span>
            );
        case "agent_handoff":
            return (
                <span className={`${muted} flex min-w-0 items-center gap-1`}>
                    <Icons.ArrowRight
                        className="size-3 flex-none text-[var(--ds-fg-subtle)]"
                        aria-hidden
                    />
                    <span className={`${primary} font-mono`}>{formatAgentLabel(evt.to_agent)}</span>
                    <span className="truncate text-[var(--ds-fg-subtle)]">· {evt.reason}</span>
                </span>
            );
        case "anomaly_detected":
            return (
                <span className={muted}>
                    anomaly on <span className={`${primary} font-mono`}>Cell {evt.cell_id}</span>
                </span>
            );
    }
}

/**
 * Thin accent bar that sweeps left-to-right under a handoff row — a subtle
 * visual cue (no neon, no glow) marking the hand-off moment per §9.
 * Respects `prefers-reduced-motion` via design-system defaults (framer
 * motion honors it when the parent AnimatePresence is reduced).
 */
function HandoffSweep() {
    return (
        <motion.span
            aria-hidden
            className="mx-2 mb-0.5 block h-[1px] origin-left"
            style={{ backgroundColor: "var(--ds-accent)" }}
            initial={{ scaleX: 0, opacity: 0.6 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        />
    );
}
