import { memo } from "react";
import { Badge, Icons } from "../../design-system";
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
}

function UserRow({ message, now }: UserRowProps) {
    return (
        <div className="flex flex-col items-end gap-1">
            <div className="max-w-[80%] rounded-[var(--ds-radius-md)] bg-[var(--ds-bg-elevated)] border border-[var(--ds-border)] px-3 py-2 text-[var(--ds-text-sm)] leading-[1.55] text-[var(--ds-fg-primary)] whitespace-pre-wrap break-words">
                {message.content}
            </div>
            <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                {formatRelativeTime(message.createdAt, now)}
            </span>
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
        <div className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)]/60 px-2.5 py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
            {running ? (
                <Icons.Activity className="size-3.5 flex-none animate-pulse text-[var(--ds-fg-subtle)]" />
            ) : (
                <Icons.Check className="size-3.5 flex-none text-[var(--ds-status-nominal)]" />
            )}
            <span className="font-mono text-[var(--ds-fg-primary)]">{part.name}</span>
            <span className="truncate font-mono text-[var(--ds-fg-subtle)]">
                {renderArgs(part.args)}
            </span>
            {part.summary && (
                <span className="ml-auto flex-none text-[var(--ds-fg-muted)]">{part.summary}</span>
            )}
        </div>
    );
}

interface HandoffRowProps {
    part: Extract<AgentPart, { kind: "handoff" }>;
}

function HandoffRow({ part }: HandoffRowProps) {
    const fromAgent = KNOWN_AGENTS.has(String(part.from)) ? (part.from as never) : undefined;
    const toAgent = KNOWN_AGENTS.has(String(part.to)) ? (part.to as never) : undefined;
    return (
        <div className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-dashed border-[var(--ds-border)] bg-transparent px-2.5 py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
            <Icons.ArrowRight className="size-3.5 flex-none text-[var(--ds-fg-subtle)]" />
            <span>Handoff</span>
            {fromAgent ? (
                <Badge variant="agent" agent={fromAgent}>
                    {formatAgentLabel(part.from)}
                </Badge>
            ) : (
                <span className="font-mono">{part.from}</span>
            )}
            <Icons.ChevronRight className="size-3 flex-none text-[var(--ds-fg-subtle)]" />
            {toAgent ? (
                <Badge variant="agent" agent={toAgent}>
                    {formatAgentLabel(part.to)}
                </Badge>
            ) : (
                <span className="font-mono">{part.to}</span>
            )}
            <span className="ml-1 truncate text-[var(--ds-fg-subtle)]">· {part.reason}</span>
        </div>
    );
}

interface AgentRowProps {
    message: AgentMessage;
    now: number;
}

function AgentRow({ message, now }: AgentRowProps) {
    const agentKey = KNOWN_AGENTS.has(message.agent) ? (message.agent as never) : undefined;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {agentKey ? (
                    <Badge variant="agent" agent={agentKey}>
                        {formatAgentLabel(message.agent)}
                    </Badge>
                ) : (
                    <Badge variant="default">{formatAgentLabel(message.agent)}</Badge>
                )}
                <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                    {formatRelativeTime(message.createdAt, now)}
                </span>
                {message.streaming && (
                    <span
                        aria-hidden
                        className="inline-block size-1.5 flex-none animate-pulse rounded-full bg-[var(--ds-accent)]"
                    />
                )}
            </div>
            <div className="flex flex-col gap-2">
                {message.parts.length === 0 && message.streaming && (
                    <span className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)] italic">
                        Thinking…
                    </span>
                )}
                {message.parts.map((part) => {
                    if (part.kind === "tool_call") return <ToolCallRow key={part.id} part={part} />;
                    if (part.kind === "handoff") return <HandoffRow key={part.id} part={part} />;
                    return (
                        <div key={part.id} className="max-w-full text-[var(--ds-fg-primary)]">
                            <Markdown>{part.content}</Markdown>
                            {part.streaming && (
                                <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[var(--ds-accent)] align-middle" />
                            )}
                        </div>
                    );
                })}
                {message.error && (
                    <div className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-[color-mix(in_oklab,var(--ds-status-critical),transparent_70%)] bg-[color-mix(in_oklab,var(--ds-status-critical),transparent_90%)] px-2.5 py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-status-critical)]">
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
}

function MessageImpl({ message, now }: MessageProps) {
    if (message.role === "user") return <UserRow message={message} now={now} />;
    return <AgentRow message={message} now={now} />;
}

export const Message = memo(MessageImpl, (prev, next) => {
    if (prev.message !== next.message) return false;
    // Relative timestamp re-renders on parent tick; suppress if within the same bucket.
    const prevBucket = Math.floor((prev.now - prev.message.createdAt) / 60_000);
    const nextBucket = Math.floor((next.now - next.message.createdAt) / 60_000);
    return prevBucket === nextBucket;
});
