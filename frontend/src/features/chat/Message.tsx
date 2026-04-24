import { memo } from "react";
import { ArtifactRenderer } from "../../components/artifacts";
import { Badge, Icons, StatusDot } from "../../components/ui";
import { useAgentInspectorStore } from "../../features/agents";
import type { AgentMessage, AgentPart, UserMessage } from "./chatStore";
import { Markdown } from "./Markdown";

const KNOWN_AGENTS = new Set(["sentinel", "investigator", "kb_builder", "work_order", "qa"]);

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB builder";
    if (id === "work_order") return "Work order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function formatRelativeTime(ts: number, now: number): string {
    const diff = Math.max(0, now - ts);
    if (diff < 30_000) return "just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface UserRowProps {
    message: UserMessage;
    now: number;
    /** When set, render a "… is investigating…" hint below this bubble. */
    investigatingWith?: string;
}

function UserRow({ message, now, investigatingWith }: UserRowProps) {
    return (
        <div className="flex flex-col items-end gap-1">
            <div className="max-w-[80%] rounded-lg bg-muted border border-border px-3 py-2 text-sm leading-[1.55] text-foreground whitespace-pre-wrap break-words">
                {message.content}
            </div>
            <span className="text-xs text-text-tertiary">
                {formatRelativeTime(message.createdAt, now)}
            </span>
            {investigatingWith && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icons.Sparkles
                        className="size-3 flex-none animate-pulse text-primary"
                        aria-hidden
                    />
                    <span>{formatAgentLabel(investigatingWith)} is investigating…</span>
                </div>
            )}
        </div>
    );
}

function renderArgs(args: Record<string, unknown>): string {
    try {
        const json = JSON.stringify(args);
        return json.length > 80 ? `${json.slice(0, 77)}…` : json;
    } catch {
        return "{…}";
    }
}

interface ToolCallRowProps {
    part: Extract<AgentPart, { kind: "tool_call" }>;
}

function ToolCallRow({ part }: ToolCallRowProps) {
    const running = part.status === "running";
    return (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            {running ? (
                <Icons.Activity className="size-3.5 flex-none animate-pulse text-text-tertiary" />
            ) : (
                <Icons.Check className="size-3.5 flex-none text-success" />
            )}
            <span className="font-mono text-foreground">{part.name}</span>
            <span className="truncate font-mono text-text-tertiary">{renderArgs(part.args)}</span>
            {part.summary && (
                <span className="ml-auto flex-none text-muted-foreground">{part.summary}</span>
            )}
        </div>
    );
}

interface HandoffRowProps {
    part: Extract<AgentPart, { kind: "handoff" }>;
}

/**
 * Inline handoff card. The previous treatment was a thin dashed pill that
 * read as a debug log line; this version renders the routing decision as a
 * proper card so judges *see* the multi-agent moment in the conversation.
 * The destination agent gets the prominent badge — the "who is now on it"
 * is what the operator cares about.
 */
function HandoffRow({ part }: HandoffRowProps) {
    const fromAgent = KNOWN_AGENTS.has(String(part.from)) ? (part.from as never) : undefined;
    const toAgent = KNOWN_AGENTS.has(String(part.to)) ? (part.to as never) : undefined;
    return (
        <div className="flex items-start gap-2.5 rounded-cta border border-border bg-muted/40 px-3 py-2 text-xs">
            <div
                className="flex size-6 flex-none items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden
            >
                <Icons.ArrowRight className="size-3" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                    <span className="font-medium">Handed off to</span>
                    {toAgent ? (
                        <Badge variant="agent" agent={toAgent}>
                            {formatAgentLabel(part.to)}
                        </Badge>
                    ) : (
                        <Badge variant="default">{formatAgentLabel(part.to)}</Badge>
                    )}
                    {fromAgent && (
                        <span className="text-text-tertiary">
                            from {formatAgentLabel(part.from)}
                        </span>
                    )}
                </div>
                {part.reason && (
                    <p className="leading-relaxed text-muted-foreground">{part.reason}</p>
                )}
            </div>
        </div>
    );
}

interface AgentRowProps {
    message: AgentMessage;
    now: number;
}

function AgentRow({ message, now }: AgentRowProps) {
    const agentKey = KNOWN_AGENTS.has(message.agent) ? (message.agent as never) : undefined;
    const openInspector = useAgentInspectorStore((s) => s.openForAgent);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => openInspector(message.agent)}
                aria-label={`Open agent inspector for ${formatAgentLabel(message.agent)}`}
                className="-mx-1 -my-0.5 inline-flex w-fit items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {agentKey ? (
                    <Badge variant="agent" agent={agentKey}>
                        {formatAgentLabel(message.agent)}
                    </Badge>
                ) : (
                    <Badge variant="default">{formatAgentLabel(message.agent)}</Badge>
                )}
                <span className="text-xs text-text-tertiary">
                    {formatRelativeTime(message.createdAt, now)}
                </span>
                {message.streaming && <StatusDot status="warning" size={6} pulse aria-hidden />}
            </button>
            <div className="flex flex-col gap-2">
                {message.parts.length === 0 && message.streaming && (
                    <span className="text-sm text-text-tertiary italic">Thinking…</span>
                )}
                {message.parts.map((part) => {
                    if (part.kind === "tool_call") return <ToolCallRow key={part.id} part={part} />;
                    if (part.kind === "handoff") return <HandoffRow key={part.id} part={part} />;
                    if (part.kind === "artifact") {
                        return (
                            <ArtifactRenderer
                                key={part.id}
                                component={part.component}
                                props={part.props}
                            />
                        );
                    }
                    return (
                        <div key={part.id} className="max-w-full text-foreground">
                            <Markdown>{part.content}</Markdown>
                            {part.streaming && (
                                <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-middle" />
                            )}
                        </div>
                    );
                })}
                {message.error && (
                    <div className="flex items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--destructive),transparent_70%)] bg-[color-mix(in_oklab,var(--destructive),transparent_90%)] px-2.5 py-1.5 text-xs text-destructive">
                        <Icons.AlertTriangle className="size-3.5 flex-none" />
                        <span>{message.error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

interface MessageProps {
    message: UserMessage | AgentMessage;
    now: number;
    /** Forwarded to `UserRow` so the latest user bubble can show an active sub-agent hint. */
    investigatingWith?: string;
}

function MessageImpl({ message, now, investigatingWith }: MessageProps) {
    if (message.role === "user") {
        return <UserRow message={message} now={now} investigatingWith={investigatingWith} />;
    }
    return <AgentRow message={message} now={now} />;
}

export const Message = memo(MessageImpl, (prev, next) => {
    if (prev.message !== next.message) return false;
    if (prev.investigatingWith !== next.investigatingWith) return false;
    // Relative timestamp re-renders on parent tick; suppress if within the same bucket.
    const prevBucket = Math.floor((prev.now - prev.message.createdAt) / 60_000);
    const nextBucket = Math.floor((next.now - next.message.createdAt) / 60_000);
    return prevBucket === nextBucket;
});
