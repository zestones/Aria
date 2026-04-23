import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { useChatStore } from "./chatStore";
import { MessageList } from "./MessageList";
import { useThrottledMessages } from "./useThrottledMessages";

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

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--ds-bg-surface)]">
            <div className="flex-none border-b border-[var(--ds-border)] px-4 py-2">
                <ConnectionIndicator status={status} />
            </div>
            <MessageList messages={messages} />
            <ChatInput ref={inputRef} onSubmit={sendMessage} disabled={status === "error"} />
        </div>
    );
}

function ConnectionIndicator({ status }: { status: string }) {
    const label =
        status === "open"
            ? "Connected"
            : status === "connecting"
              ? "Connecting…"
              : status === "error"
                ? "Connection error"
                : status === "closed"
                  ? "Disconnected"
                  : "Idle";

    const dotColor =
        status === "open"
            ? "var(--ds-status-nominal)"
            : status === "error"
              ? "var(--ds-status-critical)"
              : status === "connecting"
                ? "var(--ds-status-warning)"
                : "var(--ds-fg-subtle)";

    return (
        <div className="flex items-center gap-2 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
            <span
                className="inline-block size-1.5 flex-none rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-hidden
            />
            <span>{label}</span>
        </div>
    );
}
