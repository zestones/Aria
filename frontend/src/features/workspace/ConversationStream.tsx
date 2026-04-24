/**
 * ConversationStream — compact right-rail view of the chat conversation.
 *
 * Same data source as the side-drawer ChatPanel (`useChatStore`,
 * throttled), but artifacts are hidden because they live in the
 * full-width `ArtifactCanvas`. What remains is the *conversation* itself:
 * user prompts, agent badges, tool calls, handoffs, and the streaming
 * text.
 *
 * The composer is pinned at the bottom and reuses the existing
 * `ChatInput` so behaviour (Enter-to-send, autosize, focus signal) stays
 * identical to the drawer surface.
 */

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Icons, StatusDot } from "../../components/ui";
import { useAgentInspectorStore } from "../agents";
import { ChatInput, type ChatInputHandle } from "../chat/ChatInput";
import {
    type AgentMessage,
    type AgentPart,
    type UserMessage,
    useChatStore,
} from "../chat/chatStore";
import { Markdown } from "../chat/Markdown";
import { useThrottledMessages } from "../chat/useThrottledMessages";

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
        return json.length > 80 ? `${json.slice(0, 77)}…` : json;
    } catch {
        return "{…}";
    }
}

type NonArtifactPart = Exclude<AgentPart, { kind: "artifact" }>;

function nonArtifactParts(parts: AgentPart[]): NonArtifactPart[] {
    return parts.filter((p): p is NonArtifactPart => p.kind !== "artifact");
}

export function ConversationStream() {
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

    useEffect(() => {
        connect();
    }, [connect]);

    useEffect(() => {
        if (focusRequestId > 0) inputRef.current?.focus();
    }, [focusRequestId]);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lenRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > lenRef.current && scrollRef.current) {
            const el = scrollRef.current;
            requestAnimationFrame(() => {
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            });
        }
        lenRef.current = messages.length;
    }, [messages.length]);

    const disabled = status === "error";

    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <header className="flex h-12 flex-none items-center gap-2 border-b border-border px-4">
                <Icons.Sparkles className="size-3.5 text-text-tertiary" aria-hidden />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
                    Conversation
                </h2>
                <StatusDot
                    status={
                        status === "open" ? "nominal" : status === "error" ? "critical" : "warning"
                    }
                    size={6}
                />
            </header>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                    <p className="px-1 py-6 text-xs text-text-tertiary">
                        Send a question to start a conversation. Charts and cards will appear in the
                        canvas.
                    </p>
                ) : (
                    <ol className="flex flex-col gap-4">
                        {messages.map((m) => (
                            <li key={m.id}>
                                {m.role === "user" ? (
                                    <UserBubble message={m} />
                                ) : (
                                    <AgentBubble message={m} />
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
            <ChatInput ref={inputRef} onSubmit={sendMessage} disabled={disabled} />
        </div>
    );
}

function UserBubble({ message }: { message: UserMessage }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[90%] rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-[1.55] text-foreground whitespace-pre-wrap break-words">
                {message.content}
            </div>
        </div>
    );
}

function AgentBubble({ message }: { message: AgentMessage }) {
    const agentKey = KNOWN_AGENTS.has(message.agent) ? (message.agent as never) : undefined;
    const openInspector = useAgentInspectorStore((s) => s.openForAgent);
    const parts = nonArtifactParts(message.parts);
    const onlyArtifacts = parts.length === 0 && message.parts.length > 0 && !message.streaming;

    return (
        <div className="flex flex-col gap-1.5">
            <button
                type="button"
                onClick={() => openInspector(message.agent)}
                aria-label={`Open agent inspector for ${formatAgentLabel(message.agent)}`}
                className="inline-flex w-fit items-center gap-2 rounded-md py-0.5 text-left transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {agentKey ? (
                    <Badge variant="agent" agent={agentKey}>
                        {formatAgentLabel(message.agent)}
                    </Badge>
                ) : (
                    <Badge variant="default">{formatAgentLabel(message.agent)}</Badge>
                )}
                {message.streaming && <StatusDot status="warning" size={6} pulse />}
            </button>
            {onlyArtifacts && (
                <p className="text-[11px] italic text-text-tertiary">
                    Output rendered in the canvas →
                </p>
            )}
            {parts.length === 0 && message.streaming && (
                <p className="text-sm italic text-text-tertiary">Thinking…</p>
            )}
            <div className="flex flex-col gap-2">
                {parts.map((part) => {
                    if (part.kind === "tool_call") {
                        const running = part.status === "running";
                        return (
                            <div
                                key={part.id}
                                className="flex w-full min-w-0 items-start gap-2 rounded-md border border-border bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground"
                            >
                                {running ? (
                                    <Icons.Activity className="mt-0.5 size-3 flex-none animate-pulse text-text-tertiary" />
                                ) : (
                                    <Icons.Check className="mt-0.5 size-3 flex-none text-success" />
                                )}
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="truncate font-mono text-foreground">
                                        {part.name}
                                    </span>
                                    <span className="font-mono text-[10px] text-text-tertiary break-all">
                                        {renderArgs(part.args)}
                                    </span>
                                </div>
                            </div>
                        );
                    }
                    if (part.kind === "handoff") {
                        const toAgent = KNOWN_AGENTS.has(String(part.to))
                            ? (part.to as never)
                            : undefined;
                        return (
                            <div
                                key={part.id}
                                className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px]"
                            >
                                <Icons.ArrowRight
                                    className="mt-0.5 size-3 flex-none text-primary"
                                    aria-hidden
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                                        <span className="font-medium">→</span>
                                        {toAgent ? (
                                            <Badge variant="agent" agent={toAgent}>
                                                {formatAgentLabel(part.to)}
                                            </Badge>
                                        ) : (
                                            <Badge variant="default">
                                                {formatAgentLabel(part.to)}
                                            </Badge>
                                        )}
                                    </div>
                                    {part.reason && (
                                        <p className="leading-relaxed text-text-tertiary">
                                            {part.reason}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    }
                    // text
                    return (
                        <div key={part.id} className="text-sm text-foreground">
                            <Markdown>{part.content}</Markdown>
                            {part.streaming && (
                                <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-middle" />
                            )}
                        </div>
                    );
                })}
                {message.error && (
                    <div className="flex items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--destructive),transparent_70%)] bg-[color-mix(in_oklab,var(--destructive),transparent_90%)] px-2 py-1.5 text-[11px] text-destructive">
                        <Icons.AlertTriangle className="size-3 flex-none" />
                        <span>{message.error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
