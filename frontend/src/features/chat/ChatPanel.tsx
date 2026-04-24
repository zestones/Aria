import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { type Status, StatusDot } from "../../components/ui";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { type ChatMessage, useChatStore } from "./chatStore";
import { MessageList } from "./MessageList";
import { QuickPrompts } from "./QuickPrompts";
import { useThrottledMessages } from "./useThrottledMessages";

export interface ChatPanelProps {
    /** Operator's currently-scoped equipment — drives quick-prompt suggestions. */
    selection: EquipmentSelection | null;
}

/**
 * Chat panel — conversation surface. Header + message list + quick-prompt
 * launchpad + composer. The launchpad sits between the message list and
 * the composer so judges immediately see how to talk to ARIA *and* see
 * that it knows what equipment they're scoped to (audit §4.3).
 */
export function ChatPanel({ selection }: ChatPanelProps) {
    const messages = useThrottledMessages();
    const { status, sendMessage, connect, focusRequestId } = useChatStore(
        useShallow((s) => ({
            status: s.status,
            sendMessage: s.sendMessage,
            connect: s.connect,
            focusRequestId: s.focusRequestId,
        })),
    );

    const inputRef = useRef<ChatInputHandle>(null);

    useEffect(() => {
        connect();
    }, [connect]);

    useEffect(() => {
        if (focusRequestId > 0) {
            inputRef.current?.focus();
        }
    }, [focusRequestId]);

    const dotStatus = statusToDot(status);
    const statusLabel = statusToLabel(status);
    const activeSubAgent = useMemo(() => computeActiveSubAgent(messages), [messages]);
    const disabled = status === "error";

    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
                <h2 className="text-sm font-medium tracking-[-0.01em] text-foreground">
                    ARIA copilot
                </h2>
                <StatusDot status={dotStatus} size={6} aria-hidden />
                <span className="sr-only">{statusLabel}</span>
            </header>

            <MessageList messages={messages} activeSubAgent={activeSubAgent} />

            <QuickPrompts selection={selection} onPick={sendMessage} disabled={disabled} />

            <ChatInput ref={inputRef} onSubmit={sendMessage} disabled={disabled} />
        </div>
    );
}

/**
 * Walk back through the message log to find the agent that's *currently*
 * working a sub-task. Returns the `to` agent of the last `handoff` part on
 * the latest still-streaming agent message, or `undefined` if no handoff
 * is in flight. Used by `MessageList` to attach the "Investigator is
 * investigating…" hint to the operator's last bubble.
 */
function computeActiveSubAgent(messages: ChatMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role !== "agent") continue;
        if (!m.streaming) return undefined;
        for (let j = m.parts.length - 1; j >= 0; j -= 1) {
            const part = m.parts[j];
            if (part.kind === "handoff") return part.to;
        }
        return undefined;
    }
    return undefined;
}

function statusToDot(status: string): Status {
    if (status === "open") return "nominal";
    if (status === "error") return "critical";
    if (status === "connecting") return "warning";
    return "unknown";
}

function statusToLabel(status: string): string {
    if (status === "open") return "Connected";
    if (status === "connecting") return "Connecting…";
    if (status === "error") return "Connection error";
    if (status === "closed") return "Disconnected";
    return "Idle";
}
