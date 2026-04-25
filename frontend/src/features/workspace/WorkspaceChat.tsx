/**
 * WorkspaceChat — full-width Claude-style chat that inlines artifacts
 * directly into the conversation flow.
 *
 * Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  scroll area  (centered content, max-w-3xl)                 │
 *   │  ┌─ user bubble ─────────────────────────────────────────┐  │
 *   │  │ "What's the anomaly on Bottle Filler?"                │  │
 *   │  └────────────────────────────────────────────────────────┘  │
 *   │  ┌─ agent turn ──────────────────────────────────────────┐  │
 *   │  │ [Sentinel] Analysing sensor data…                     │  │
 *   │  │  ─── tool call pill ──────────────────────────────    │  │
 *   │  │  ─── artifact card (full width) ──────────────────    │  │
 *   │  │  ─── artifact card (full width) ──────────────────    │  │
 *   │  └────────────────────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ composer bar (full-width, centered content) ───────────────┐
 *   └─────────────────────────────────────────────────────────────┘
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArtifactRenderer } from "../../components/artifacts";
import { Badge, Icons, StatusDot } from "../../components/ui";
import { useAgentInspectorStore } from "../agents";
import { ChatInput, type ChatInputHandle } from "../chat/ChatInput";
import {
    type AgentMessage,
    type AgentPart,
    type ArtifactPart,
    type UserMessage,
    useChatStore,
} from "../chat/chatStore";
import { Markdown } from "../chat/Markdown";
import { useThrottledMessages } from "../chat/useThrottledMessages";

// ─── Helpers ────────────────────────────────────────────────────────────────

const KNOWN_AGENTS = new Set(["sentinel", "investigator", "kb_builder", "work_order", "qa"]);

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB Builder";
    if (id === "work_order") return "Work Order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function renderArgs(args: Record<string, unknown>): string {
    try {
        const json = JSON.stringify(args);
        return json.length > 120 ? `${json.slice(0, 117)}…` : json;
    } catch {
        return "{…}";
    }
}

function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function humanComponent(name: string): string {
    return name.replace(/_/g, " ");
}

// Parts rendered in-order; all four kinds handled inline in AgentTurn

// ─── Root component ──────────────────────────────────────────────────────────

export function WorkspaceChat() {
    const messages = useThrottledMessages();
    const { sendMessage, connect, focusRequestId, status } = useChatStore(
        useShallow((s) => ({
            sendMessage: s.sendMessage,
            connect: s.connect,
            focusRequestId: s.focusRequestId,
            status: s.status,
        })),
    );
    const inputRef = useRef<ChatInputHandle>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const observerRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        connect();
    }, [connect]);

    useEffect(() => {
        if (focusRequestId > 0) inputRef.current?.focus();
    }, [focusRequestId]);

    // Track whether the user is parked at the bottom; if so, follow streaming output.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
            stickToBottomRef.current = distance < 80;
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // Ref callback: attach a ResizeObserver to the content node so we can pin
    // the scroll to the bottom while tokens stream in.
    const contentRefCallback = (node: HTMLDivElement | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (!node) return;
        const ro = new ResizeObserver(() => {
            const scroller = scrollRef.current;
            if (scroller && stickToBottomRef.current) {
                scroller.scrollTop = scroller.scrollHeight;
            }
        });
        ro.observe(node);
        observerRef.current = ro;
    };

    // When a brand-new message appears, force-scroll regardless of position.
    const lenRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > lenRef.current && scrollRef.current) {
            stickToBottomRef.current = true;
            const el = scrollRef.current;
            requestAnimationFrame(() => {
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            });
        }
        lenRef.current = messages.length;
    }, [messages.length]);

    const disabled = status === "error";

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            {/* Scrollable message area */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                    <EmptyState onPrompt={sendMessage} />
                ) : (
                    <div
                        ref={contentRefCallback}
                        className="mx-auto flex max-w-[820px] flex-col gap-10 px-6 py-10"
                    >
                        <AnimatePresence initial={false}>
                            {messages.map((m) =>
                                m.role === "user" ? (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    >
                                        <UserTurn message={m} />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    >
                                        <AgentTurn message={m} />
                                    </motion.div>
                                ),
                            )}
                        </AnimatePresence>
                        {/* Bottom spacer so the last message isn't flush against the composer */}
                        <div aria-hidden className="h-8" />
                    </div>
                )}
            </div>

            {/* Pinned composer — floats centered with gradient fade like Claude */}
            <div className="relative flex-none">
                {/* Gradient fade that bleeds up into the scroll area */}
                <div
                    className="pointer-events-none absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background to-transparent"
                    aria-hidden
                />
                <div className="mx-auto max-w-[700px] px-4 pb-5 pt-2">
                    <ChatInput ref={inputRef} onSubmit={sendMessage} disabled={disabled} />
                    <p className="mt-2 text-center text-xs text-text-tertiary">
                        ARIA is an AI and may make mistakes. Always verify critical information.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── User turn ───────────────────────────────────────────────────────────────

function UserTurn({ message }: { message: UserMessage }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-5 py-3.5 text-[17px] leading-[1.6] text-primary-foreground whitespace-pre-wrap wrap-break-word shadow-sm">
                {message.content}
            </div>
        </div>
    );
}

// ─── Agent turn ──────────────────────────────────────────────────────────────

function AgentTurn({ message }: { message: AgentMessage }) {
    const agentKey = KNOWN_AGENTS.has(message.agent) ? (message.agent as never) : undefined;
    const openInspector = useAgentInspectorStore((s) => s.openForAgent);

    return (
        <div className="flex gap-4">
            {/* Avatar column */}
            <div className="flex-none pt-0.5">
                <div
                    className="flex size-8 items-center justify-center rounded-full bg-primary/8 ring-1 ring-border"
                    aria-hidden
                >
                    <Icons.Sparkles className="size-4 text-primary" />
                </div>
            </div>

            {/* Content column */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
                {/* Agent badge + timestamp */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openInspector(message.agent)}
                        aria-label={`Open agent inspector for ${formatAgentLabel(message.agent)}`}
                        className="inline-flex items-center gap-2 rounded-md py-0.5 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {agentKey ? (
                            <Badge variant="agent" agent={agentKey}>
                                {formatAgentLabel(message.agent)}
                            </Badge>
                        ) : (
                            <Badge variant="default">{formatAgentLabel(message.agent)}</Badge>
                        )}
                    </button>
                    {message.streaming && <StatusDot status="warning" size={6} pulse />}
                    <span className="ml-auto text-xs text-text-tertiary tabular-nums">
                        {formatClock(message.createdAt)}
                    </span>
                </div>

                {/* Streaming placeholder */}
                {message.parts.length === 0 && message.streaming && (
                    <p className="text-[17px] italic text-text-tertiary">Thinking…</p>
                )}

                {/* Parts rendered IN ORDER — tool calls, handoffs, text, artifacts interleaved */}
                <div className="flex flex-col gap-4">
                    {message.parts.map((part) => {
                        if (part.kind === "tool_call") {
                            return <ToolCallRow key={part.id} part={part} />;
                        }
                        if (part.kind === "handoff") {
                            const toAgent = KNOWN_AGENTS.has(String(part.to))
                                ? (part.to as never)
                                : undefined;
                            return (
                                <div
                                    key={part.id}
                                    className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs w-fit"
                                >
                                    <Icons.ArrowRight
                                        className="size-3 flex-none text-text-tertiary"
                                        aria-hidden
                                    />
                                    <span className="text-text-secondary">Routing to</span>
                                    {toAgent ? (
                                        <Badge variant="agent" agent={toAgent}>
                                            {formatAgentLabel(part.to)}
                                        </Badge>
                                    ) : (
                                        <Badge variant="default">{formatAgentLabel(part.to)}</Badge>
                                    )}
                                    {part.reason && (
                                        <span className="text-text-tertiary">— {part.reason}</span>
                                    )}
                                </div>
                            );
                        }
                        if (part.kind === "artifact") {
                            return (
                                <InlineArtifact key={part.id} part={part} agent={message.agent} />
                            );
                        }
                        // text
                        return (
                            <div
                                key={part.id}
                                className="text-[17px] leading-[1.7] text-foreground"
                            >
                                <Markdown>{part.content}</Markdown>
                                {part.streaming && (
                                    <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-middle" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {message.error && (
                    <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--destructive),transparent_70%)] bg-[color-mix(in_oklab,var(--destructive),transparent_90%)] px-3 py-2 text-sm text-destructive">
                        <Icons.AlertTriangle className="size-4 flex-none" />
                        <span>{message.error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Collapsible tool-call row ────────────────────────────────────────────────

function ToolCallRow({ part }: { part: Extract<AgentPart, { kind: "tool_call" }> }) {
    const running = part.status === "running";
    // Auto-open while running; collapse when done (user can re-expand)
    const [open, setOpen] = useState(running);

    // When the tool transitions from running → done, collapse it
    const prevRunning = useRef(running);
    useEffect(() => {
        if (prevRunning.current && !running) setOpen(false);
        prevRunning.current = running;
    }, [running]);

    return (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
                {running ? (
                    <Icons.Activity
                        className="size-3 flex-none animate-pulse text-warning"
                        aria-hidden
                    />
                ) : (
                    <Icons.Check className="size-3 flex-none text-success" aria-hidden />
                )}
                <span className="flex-1 truncate font-mono text-xs text-text-secondary">
                    {part.name}
                </span>
                <Icons.ChevronRight
                    className={`size-3 flex-none text-text-tertiary transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                    aria-hidden
                />
            </button>
            {open && (
                <div className="border-t border-border bg-muted/20 px-3 py-2">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-tertiary break-all">
                        {renderArgs(part.args)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ─── Inline artifact card ────────────────────────────────────────────────────

function InlineArtifact({ part, agent }: { part: ArtifactPart; agent: string }) {
    const agentKey = KNOWN_AGENTS.has(agent) ? (agent as never) : undefined;
    return (
        <figure className="flex flex-col gap-2.5">
            <figcaption className="flex items-center gap-2">
                <span aria-hidden className="inline-block size-2 rounded-full bg-primary/60" />
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    {humanComponent(part.component)}
                </span>
                <span aria-hidden className="text-text-tertiary text-xs">
                    ·
                </span>
                {agentKey ? (
                    <Badge variant="agent" agent={agentKey}>
                        {formatAgentLabel(agent)}
                    </Badge>
                ) : (
                    <Badge variant="default">{formatAgentLabel(agent)}</Badge>
                )}
            </figcaption>
            <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
                <ArtifactRenderer component={part.component} props={part.props} />
            </div>
        </figure>
    );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

const CAPABILITY_CARDS = [
    {
        icon: "Activity" as const,
        title: "Diagnose an anomaly",
        description: "ARIA cross-references sensor telemetry, thresholds and failure patterns.",
        prompt: "What is currently degrading on the plant?",
    },
    {
        icon: "Gauge" as const,
        title: "Inspect a cell",
        description: "Ask for the last 24 h of telemetry, OEE or alarm history for any equipment.",
        prompt: "Show me the last 24h of telemetry for Cell 1",
    },
    {
        icon: "FileText" as const,
        title: "Generate a work order",
        description: "Describe the fault and ARIA drafts a complete maintenance work order.",
        prompt: "Create a work order for a bearing overheating on the Bottle Filler",
    },
    {
        icon: "BookOpen" as const,
        title: "Query the knowledge base",
        description: "Search equipment manuals, RCA reports and maintenance procedures.",
        prompt: "Search the KB for turbidity calibration procedures",
    },
] as const;

type CapabilityCard = (typeof CAPABILITY_CARDS)[number];

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-10 px-8 py-16">
            {/* Mark + headline */}
            <div className="flex flex-col items-center gap-5 text-center">
                <div
                    className="flex size-16 items-center justify-center rounded-2xl bg-primary/8 ring-1 ring-border shadow-sm"
                    aria-hidden
                >
                    <Icons.Sparkles className="size-7 text-primary" />
                </div>
                <div>
                    <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                        What can I help you with?
                    </h2>
                    <p className="mt-2 text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
                        ARIA orchestrates specialised agents — pick a starting point below or type
                        your own question.
                    </p>
                </div>
            </div>

            {/* Capability grid */}
            <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
                {CAPABILITY_CARDS.map((c) => (
                    <CapabilityTile key={c.title} card={c} onClick={() => onPrompt(c.prompt)} />
                ))}
            </div>
        </div>
    );
}

function CapabilityTile({ card, onClick }: { card: CapabilityCard; onClick: () => void }) {
    const Icon = Icons[card.icon];
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left",
                "transition-all duration-150 hover:border-input hover:shadow-md hover:-translate-y-0.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            ].join(" ")}
        >
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/8">
                <Icon className="size-4.5 text-primary" aria-hidden />
            </div>
            <div>
                <p className="text-sm font-semibold text-foreground">{card.title}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {card.description}
                </p>
            </div>
        </button>
    );
}
