/**
 * AgentConstellation — full-screen live ops view of the ARIA agent graph.
 *
 * Five agents arranged orbitally around the Sentinel core. Subscribes to
 * the global activity feed (no extra WS connection) to deliver an
 * operational X-ray:
 *
 *  - **Stats strip**: total handoffs, total tool calls, in-flight turns,
 *    live anomalies in the last 10 minutes.
 *  - **Constellation**: pulsing nodes for active agents, particles for
 *    handoffs in flight, per-node "current activity" caption (idle /
 *    thinking / running tool X / last finish reason).
 *  - **Click a node** → opens the existing `AgentInspector` drawer for a
 *    deep-dive into reasoning + tool history (closes the overlay).
 *  - **Right rail**: latest 6 handoffs with the *reason* string and the
 *    latest 6 completed tool calls with their durations.
 *  - **Bottom**: live thinking trail for the focus agent.
 *
 * Toggled via the hotkey `A` and a TopBar button. Closed with `Esc`.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Badge, Icons } from "../../components/ui";
import { type ActivityEvent, useActivityFeedStore } from "./activityFeedStore";
import { useAgentInspectorStore } from "./agentInspectorStore";
import { useAgentStream } from "./useAgentStream";

// ─────────────────────────────────────────────────────────────────────────────
// Layout

type AgentKey = "sentinel" | "investigator" | "kb_builder" | "work_order" | "qa";

interface AgentDef {
    key: AgentKey;
    label: string;
    role: string;
    angleDeg: number; // 0 means the orbit start; sentinel sits at the centre.
    radius: number; // 0 for centre.
    cssVar: string;
}

const ORBIT_RADIUS = 220;

// 4 corners around Sentinel: Investigator top-left, KB Builder top-right,
// Work Order bottom-right, QA bottom-left. Sentinel anchors the centre.
const AGENTS: AgentDef[] = [
    {
        key: "sentinel",
        label: "Sentinel",
        role: "Watchdog",
        angleDeg: 0,
        radius: 0,
        cssVar: "--agent-sentinel",
    },
    {
        key: "investigator",
        label: "Investigator",
        role: "Root cause",
        angleDeg: -135,
        radius: ORBIT_RADIUS,
        cssVar: "--agent-investigator",
    },
    {
        key: "kb_builder",
        label: "KB Builder",
        role: "Knowledge",
        angleDeg: -45,
        radius: ORBIT_RADIUS,
        cssVar: "--agent-kb-builder",
    },
    {
        key: "work_order",
        label: "Work Order",
        role: "Action",
        angleDeg: 45,
        radius: ORBIT_RADIUS,
        cssVar: "--agent-work-order",
    },
    {
        key: "qa",
        label: "QA",
        role: "Verification",
        angleDeg: 135,
        radius: ORBIT_RADIUS,
        cssVar: "--agent-qa",
    },
];

const POSITIONS: Record<AgentKey, { x: number; y: number }> = AGENTS.reduce(
    (acc, a) => {
        const rad = (a.angleDeg * Math.PI) / 180;
        acc[a.key] = {
            x: Math.round(a.radius * Math.cos(rad)),
            y: Math.round(a.radius * Math.sin(rad)),
        };
        return acc;
    },
    {} as Record<AgentKey, { x: number; y: number }>,
);

// Backend agent names → our keys (handles `kb-builder`, `work-order`, etc.)
function normaliseAgentKey(name: string): AgentKey | null {
    const slug = name.toLowerCase().replace(/[\s-]+/g, "_");
    if (slug.includes("sentinel")) return "sentinel";
    if (slug.includes("investigator")) return "investigator";
    if (slug.includes("kb")) return "kb_builder";
    if (slug.includes("work")) return "work_order";
    if (slug.includes("qa")) return "qa";
    return null;
}

const AGENT_LABEL: Record<AgentKey, string> = {
    sentinel: "Sentinel",
    investigator: "Investigator",
    kb_builder: "KB Builder",
    work_order: "Work Order",
    qa: "QA",
};

// Map our normalised key back to the canonical name used by `useAgentStream`
// (matches how the backend emits `agent_start.agent`).
const AGENT_STREAM_NAME: Record<AgentKey, string> = {
    sentinel: "sentinel",
    investigator: "investigator",
    kb_builder: "kb_builder",
    work_order: "work_order",
    qa: "qa",
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API

export interface AgentConstellationProps {
    open: boolean;
    onClose: () => void;
}

export function AgentConstellation({ open, onClose }: AgentConstellationProps) {
    // Esc closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Agent constellation"
                >
                    <ConstellationHeader onClose={onClose} />
                    <ConstellationBody onClose={onClose} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header

function ConstellationHeader({ onClose }: { onClose: () => void }) {
    return (
        <header className="flex items-center justify-between border-b border-border-muted px-6 py-4">
            <div className="flex items-center gap-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    · ARIA agent constellation
                </div>
                <Badge variant="default" size="sm">
                    {AGENTS.length} agents
                </Badge>
                <span className="hidden text-xs text-muted-foreground md:inline">
                    Click any agent to open its inspector. Press{" "}
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                        A
                    </kbd>{" "}
                    to toggle,{" "}
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                        Esc
                    </kbd>{" "}
                    to close.
                </span>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Close constellation (Esc)"
                title="Close (Esc)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Icons.X className="size-4" aria-hidden />
            </button>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived state from the activity feed

interface AgentActivity {
    isActive: boolean;
    /** Current tool name in flight (started but not completed). */
    runningTool: string | null;
    /** Last completed tool call (for idle caption). */
    lastTool: string | null;
    /** Latest agent_end finish_reason (for idle caption). */
    lastFinishReason: string | null;
}

interface DerivedState {
    activeAgents: Set<AgentKey>;
    perAgent: Record<AgentKey, AgentActivity>;
    handoffsOut: Record<AgentKey, number>;
    toolCount: Record<AgentKey, number>;
    inFlightTurns: number;
    anomaliesLast10m: number;
    /** Newest-first, decoded handoff timeline (max 6). */
    recentHandoffs: Array<{
        id: string;
        from: AgentKey;
        to: AgentKey;
        reason: string;
        receivedAt: number;
    }>;
    /** Newest-first, completed tools (max 6). */
    recentTools: Array<{
        id: string;
        agent: AgentKey;
        tool: string;
        durationMs: number;
        receivedAt: number;
    }>;
    focusAgent: AgentKey | null;
}

const EMPTY_ACTIVITY: AgentActivity = {
    isActive: false,
    runningTool: null,
    lastTool: null,
    lastFinishReason: null,
};

function emptyAgentRecord<T>(value: T): Record<AgentKey, T> {
    return {
        sentinel: value,
        investigator: value,
        kb_builder: value,
        work_order: value,
        qa: value,
    };
}

function deriveState(events: readonly ActivityEvent[]): DerivedState {
    // Build per-agent activity walking events oldest→newest (events array is
    // newest-first; we iterate in reverse to apply chronologically).
    const perAgent: Record<AgentKey, AgentActivity> = {
        sentinel: { ...EMPTY_ACTIVITY },
        investigator: { ...EMPTY_ACTIVITY },
        kb_builder: { ...EMPTY_ACTIVITY },
        work_order: { ...EMPTY_ACTIVITY },
        qa: { ...EMPTY_ACTIVITY },
    };
    const handoffsOut = emptyAgentRecord(0);
    const toolCount = emptyAgentRecord(0);
    const turnsByAgent = new Map<AgentKey, Set<string>>(); // turn_id active per agent
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    let anomaliesLast10m = 0;

    for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        switch (ev.kind) {
            case "agent_start": {
                const k = normaliseAgentKey(ev.agent);
                if (!k) break;
                perAgent[k].isActive = true;
                let turns = turnsByAgent.get(k);
                if (!turns) {
                    turns = new Set();
                    turnsByAgent.set(k, turns);
                }
                turns.add(ev.turn_id);
                break;
            }
            case "agent_end": {
                const k = normaliseAgentKey(ev.agent);
                if (!k) break;
                perAgent[k].lastFinishReason = ev.finish_reason;
                const turns = turnsByAgent.get(k);
                if (turns) {
                    turns.delete(ev.turn_id);
                    if (turns.size === 0) perAgent[k].isActive = false;
                }
                break;
            }
            case "tool_call_started": {
                const k = normaliseAgentKey(ev.agent);
                if (!k) break;
                perAgent[k].runningTool = ev.tool_name;
                break;
            }
            case "tool_call_completed": {
                const k = normaliseAgentKey(ev.agent);
                if (!k) break;
                perAgent[k].runningTool = null;
                perAgent[k].lastTool = ev.tool_name;
                toolCount[k]++;
                break;
            }
            case "agent_handoff": {
                const k = normaliseAgentKey(ev.from_agent);
                if (k) handoffsOut[k]++;
                break;
            }
            case "anomaly_detected": {
                if (ev.receivedAt >= tenMinutesAgo) anomaliesLast10m++;
                break;
            }
        }
    }

    // Active set
    const activeAgents = new Set<AgentKey>();
    for (const k of Object.keys(perAgent) as AgentKey[]) {
        if (perAgent[k].isActive) activeAgents.add(k);
    }

    // Recent handoffs (events list is newest-first → just filter + slice).
    const recentHandoffs: DerivedState["recentHandoffs"] = [];
    const recentTools: DerivedState["recentTools"] = [];
    for (const ev of events) {
        if (ev.kind === "agent_handoff" && recentHandoffs.length < 6) {
            const from = normaliseAgentKey(ev.from_agent);
            const to = normaliseAgentKey(ev.to_agent);
            if (from && to) {
                recentHandoffs.push({
                    id: ev.id,
                    from,
                    to,
                    reason: ev.reason,
                    receivedAt: ev.receivedAt,
                });
            }
        } else if (ev.kind === "tool_call_completed" && recentTools.length < 6) {
            const agent = normaliseAgentKey(ev.agent);
            if (agent) {
                recentTools.push({
                    id: ev.id,
                    agent,
                    tool: ev.tool_name,
                    durationMs: ev.duration_ms,
                    receivedAt: ev.receivedAt,
                });
            }
        }
        if (recentHandoffs.length >= 6 && recentTools.length >= 6) break;
    }

    // In-flight turns (sum of unique turn_ids still open across all agents)
    let inFlightTurns = 0;
    for (const turns of turnsByAgent.values()) inFlightTurns += turns.size;

    // Focus agent for thinking trail: most recent agent_start whose agent is
    // still active.
    let focusAgent: AgentKey | null = null;
    for (const ev of events) {
        if (ev.kind === "agent_start") {
            const k = normaliseAgentKey(ev.agent);
            if (k && activeAgents.has(k)) {
                focusAgent = k;
                break;
            }
        }
    }

    return {
        activeAgents,
        perAgent,
        handoffsOut,
        toolCount,
        inFlightTurns,
        anomaliesLast10m,
        recentHandoffs,
        recentTools,
        focusAgent,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Body

interface Particle {
    id: string;
    from: AgentKey;
    to: AgentKey;
}

function ConstellationBody({ onClose }: { onClose: () => void }) {
    const events = useActivityFeedStore((s) => s.events);
    const state = useMemo(() => deriveState(events), [events]);
    const openInspector = useAgentInspectorStore((s) => s.openForAgent);

    // Particle queue — derived from handoff events. Each particle lives 1.0s.
    const [particles, setParticles] = useState<Particle[]>([]);
    const [lastSeenHandoffId, setLastSeenHandoffId] = useState<string | null>(null);

    useEffect(() => {
        const newest = events.find((e) => e.kind === "agent_handoff");
        if (!newest || newest.kind !== "agent_handoff") return;
        if (newest.id === lastSeenHandoffId) return;
        setLastSeenHandoffId(newest.id);
        const from = normaliseAgentKey(newest.from_agent);
        const to = normaliseAgentKey(newest.to_agent);
        if (!from || !to || from === to) return;
        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `p-${Date.now()}-${Math.random()}`;
        setParticles((prev) => [...prev, { id, from, to }]);
        const timeout = window.setTimeout(() => {
            setParticles((prev) => prev.filter((p) => p.id !== id));
        }, 1000);
        return () => window.clearTimeout(timeout);
    }, [events, lastSeenHandoffId]);

    const handleNodeClick = (k: AgentKey) => {
        openInspector(AGENT_STREAM_NAME[k]);
        onClose();
    };

    const totalHandoffs = Object.values(state.handoffsOut).reduce((a, b) => a + b, 0);
    const totalTools = Object.values(state.toolCount).reduce((a, b) => a + b, 0);

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <StatsStrip
                handoffs={totalHandoffs}
                tools={totalTools}
                inFlight={state.inFlightTurns}
                anomalies={state.anomaliesLast10m}
                activeCount={state.activeAgents.size}
            />
            <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
                <div className="relative overflow-hidden">
                    {/* Accessible button list — visually hidden, screen-reader-only,
                        because SVG <g> nodes cannot themselves be buttons. */}
                    <ul className="sr-only">
                        {AGENTS.map((a) => (
                            <li key={a.key}>
                                <button type="button" onClick={() => handleNodeClick(a.key)}>
                                    Open {a.label} inspector
                                </button>
                            </li>
                        ))}
                    </ul>
                    <ConstellationStage
                        activeAgents={state.activeAgents}
                        perAgent={state.perAgent}
                        handoffsOut={state.handoffsOut}
                        toolCount={state.toolCount}
                        particles={particles}
                        onNodeClick={handleNodeClick}
                    />
                </div>
                <aside className="hidden flex-col gap-4 overflow-y-auto border-l border-border-muted bg-card/40 p-4 lg:flex">
                    <RecentHandoffs items={state.recentHandoffs} />
                    <RecentTools items={state.recentTools} />
                </aside>
            </div>
            <ThinkingTrail focusAgent={state.focusAgent} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats strip

interface StatsStripProps {
    handoffs: number;
    tools: number;
    inFlight: number;
    anomalies: number;
    activeCount: number;
}

function StatsStrip({ handoffs, tools, inFlight, anomalies, activeCount }: StatsStripProps) {
    return (
        <div className="grid grid-cols-2 gap-px border-b border-border-muted bg-border-muted text-foreground sm:grid-cols-5">
            <Stat label="Active agents" value={activeCount} accent={activeCount > 0} />
            <Stat label="In-flight turns" value={inFlight} />
            <Stat label="Handoffs (session)" value={handoffs} />
            <Stat label="Tool calls (session)" value={tools} />
            <Stat label="Anomalies (10 min)" value={anomalies} accent={anomalies > 0} />
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
    return (
        <div className="flex flex-col items-start justify-center gap-1 bg-card px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {label}
            </span>
            <span
                className="text-2xl font-semibold tabular-nums"
                style={{ color: accent ? "var(--primary)" : undefined }}
            >
                {value}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage (SVG canvas)

interface ConstellationStageProps {
    activeAgents: Set<AgentKey>;
    perAgent: Record<AgentKey, AgentActivity>;
    handoffsOut: Record<AgentKey, number>;
    toolCount: Record<AgentKey, number>;
    particles: Particle[];
    onNodeClick: (k: AgentKey) => void;
}

function ConstellationStage({
    activeAgents,
    perAgent,
    handoffsOut,
    toolCount,
    particles,
    onNodeClick,
}: ConstellationStageProps) {
    return (
        <svg
            viewBox="-360 -300 720 600"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Agent constellation diagram"
        >
            <title>Agent constellation</title>

            {/* Connecting arcs (orbit nodes ↔ Sentinel) */}
            {AGENTS.filter((a) => a.key !== "sentinel").map((a) => {
                const p = POSITIONS[a.key];
                const isActive = activeAgents.has(a.key) || activeAgents.has("sentinel");
                return (
                    <line
                        key={`arc-${a.key}`}
                        x1={0}
                        y1={0}
                        x2={p.x}
                        y2={p.y}
                        stroke="var(--accent-arc)"
                        strokeWidth={isActive ? 1.5 : 0.75}
                        opacity={isActive ? 0.55 : 0.2}
                    />
                );
            })}

            {/* Particles */}
            <AnimatePresence>
                {particles.map((p) => (
                    <ParticleDot key={p.id} from={POSITIONS[p.from]} to={POSITIONS[p.to]} />
                ))}
            </AnimatePresence>

            {/* Nodes — rendered on top */}
            {AGENTS.map((a) => (
                <AgentNode
                    key={a.key}
                    def={a}
                    position={POSITIONS[a.key]}
                    isActive={activeAgents.has(a.key)}
                    activity={perAgent[a.key]}
                    handoffsOut={handoffsOut[a.key]}
                    toolCalls={toolCount[a.key]}
                    onClick={() => onNodeClick(a.key)}
                />
            ))}
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Particle (SVG)

function ParticleDot({
    from,
    to,
}: {
    from: { x: number; y: number };
    to: { x: number; y: number };
}) {
    return (
        <motion.circle
            r={6}
            fill="var(--primary)"
            initial={{ cx: from.x, cy: from.y, opacity: 0 }}
            animate={{ cx: to.x, cy: to.y, opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], times: [0, 0.15, 0.85, 1] }}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent node (SVG, clickable)

interface AgentNodeProps {
    def: AgentDef;
    position: { x: number; y: number };
    isActive: boolean;
    activity: AgentActivity;
    handoffsOut: number;
    toolCalls: number;
    onClick: () => void;
}

function shortFinishReason(reason: string | null): string | null {
    if (!reason) return null;
    if (reason === "stop" || reason === "end_turn") return "Idle · last turn ended";
    if (reason === "tool_use") return "Idle · awaiting tool result";
    if (reason === "max_tokens") return "Idle · turn capped";
    return `Idle · ${reason}`;
}

function nodeCaption(activity: AgentActivity): string {
    if (activity.runningTool) return `Running: ${activity.runningTool}`;
    if (activity.isActive) return "Thinking…";
    const finish = shortFinishReason(activity.lastFinishReason);
    if (finish) return finish;
    if (activity.lastTool) return `Idle · last tool ${activity.lastTool}`;
    return "Idle";
}

function AgentNode({
    def,
    position,
    isActive,
    activity,
    handoffsOut,
    toolCalls,
    onClick,
}: AgentNodeProps) {
    const colour = `var(${def.cssVar})`;
    const radius = def.key === "sentinel" ? 56 : 44;
    const caption = nodeCaption(activity);

    return (
        <g
            transform={`translate(${position.x}, ${position.y})`}
            onClick={onClick}
            style={{ cursor: "pointer", outline: "none" }}
            className="agent-node"
            aria-hidden
        >
            {/* Pulsing outer ring when active */}
            {isActive && (
                <motion.circle
                    r={radius + 8}
                    fill="none"
                    stroke={colour}
                    strokeWidth={1.5}
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.1, 0.6] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
            )}

            {/* Disc */}
            <circle
                r={radius}
                fill={colour}
                fillOpacity={0.18}
                stroke={colour}
                strokeWidth={isActive ? 2 : 1.25}
            />

            {/* Centre role */}
            <text
                x={0}
                y={-2}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={colour}
                style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}
            >
                {def.role}
            </text>
            <text
                x={0}
                y={radius / 2 + 2}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-tertiary)"
                style={{ fontVariantNumeric: "tabular-nums" }}
            >
                {handoffsOut}↗ · {toolCalls}⚙
            </text>

            {/* Below-the-disc label + live caption */}
            <text
                x={0}
                y={radius + 18}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--foreground)"
            >
                {def.label}
            </text>
            <text
                x={0}
                y={radius + 34}
                textAnchor="middle"
                fontSize={11}
                fill={isActive ? colour : "var(--text-tertiary)"}
            >
                {caption}
            </text>
        </g>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right rail — recent handoffs + recent tools

function formatRelativeTime(receivedAt: number): string {
    const seconds = Math.floor((Date.now() - receivedAt) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

function RecentHandoffs({ items }: { items: DerivedState["recentHandoffs"] }) {
    return (
        <section>
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Recent handoffs
            </h3>
            {items.length === 0 ? (
                <EmptyHint text="No handoffs yet. Trigger an investigation to see agents collaborate." />
            ) : (
                <ul className="space-y-2">
                    {items.map((h) => (
                        <li
                            key={h.id}
                            className="rounded-lg border border-border-muted bg-card p-2.5"
                        >
                            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                                <AgentChip k={h.from} />
                                <Icons.ChevronRight
                                    className="size-3 text-text-tertiary"
                                    aria-hidden
                                />
                                <AgentChip k={h.to} />
                                <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                                    {formatRelativeTime(h.receivedAt)}
                                </span>
                            </div>
                            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                                {h.reason || "—"}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function RecentTools({ items }: { items: DerivedState["recentTools"] }) {
    return (
        <section>
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Recent tool calls
            </h3>
            {items.length === 0 ? (
                <EmptyHint text="No tool calls yet." />
            ) : (
                <ul className="space-y-1.5">
                    {items.map((t) => (
                        <li
                            key={t.id}
                            className="flex items-center gap-2 rounded-md border border-border-muted bg-card px-2.5 py-1.5 text-xs"
                        >
                            <AgentChip k={t.agent} />
                            <code className="truncate font-mono text-[11px] text-foreground">
                                {t.tool}
                            </code>
                            <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                                {t.durationMs}ms
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function AgentChip({ k }: { k: AgentKey }) {
    const cssVar = `--agent-${k.replace("_", "-")}`;
    return (
        <span
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: `var(${cssVar})` }}
        >
            <span
                className="inline-block size-1.5 rounded-full"
                style={{ backgroundColor: `var(${cssVar})` }}
                aria-hidden
            />
            {AGENT_LABEL[k]}
        </span>
    );
}

function EmptyHint({ text }: { text: string }) {
    return (
        <p className="rounded-md border border-dashed border-border-muted bg-muted/30 px-2.5 py-3 text-[11px] leading-snug text-muted-foreground">
            {text}
        </p>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thinking trail (bottom panel)

function ThinkingTrail({ focusAgent }: { focusAgent: AgentKey | null }) {
    const stream = useAgentStream(focusAgent ? AGENT_STREAM_NAME[focusAgent] : null);
    const text = stream.thinking?.trim() ?? "";

    return (
        <div className="border-t border-border-muted bg-card/80 px-6 py-4 backdrop-blur-sm">
            {focusAgent ? (
                <>
                    <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <span
                            className="inline-block size-1.5 rounded-full"
                            style={{
                                backgroundColor: `var(--agent-${focusAgent.replace("_", "-")})`,
                            }}
                        />
                        <span>{AGENT_LABEL[focusAgent]} thinking…</span>
                    </div>
                    <p className="line-clamp-4 text-sm leading-snug text-foreground">
                        {text || "Reasoning in progress…"}
                    </p>
                </>
            ) : (
                <p className="text-center text-xs text-muted-foreground">
                    All agents idle. Trigger an investigation in chat to see them collaborate.
                </p>
            )}
        </div>
    );
}
