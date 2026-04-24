import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { type Status, StatusDot } from "../../components/ui";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { useChatStore } from "./chatStore";
import { MessageList } from "./MessageList";
import { useThrottledMessages } from "./useThrottledMessages";

/**
 * Chat panel — conversation surface only.
 *
 * Header is a single quiet strip: product label + connection dot. No close
 * button (the TopBar chat toggle is the canonical control), no Activity
 * toggle (agent observability lives in `AgentInspector`, not stuffed into
 * the chat). Body is just message history → input.
 */
export function ChatPanel() {
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

    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
                <h2 className="text-sm font-medium tracking-[-0.01em] text-foreground">
                    ARIA copilot
                </h2>
                <StatusDot status={dotStatus} size={6} aria-hidden />
                <span className="sr-only">{statusLabel}</span>
            </header>

            <MessageList messages={messages} />

            <ChatInput ref={inputRef} onSubmit={sendMessage} disabled={status === "error"} />
        </div>
    );
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
