import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Icons, type Status, StatusDot } from "../../design-system";
import { ActivityFeed } from "../../features/agents";
import { useLocalStorage } from "../../lib/useLocalStorage";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { useChatStore } from "./chatStore";
import { MessageList } from "./MessageList";
import { useThrottledMessages } from "./useThrottledMessages";

const ACTIVITY_PANEL_KEY = "aria.activityPanelOpen";

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
    const [activityOpen, setActivityOpen] = useLocalStorage<boolean>(ACTIVITY_PANEL_KEY, true);

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
            <div className="flex flex-none items-center justify-between border-b border-[var(--ds-border)] px-4 py-2">
                <ConnectionIndicator status={status} />
                <button
                    type="button"
                    onClick={() => setActivityOpen(!activityOpen)}
                    aria-expanded={activityOpen}
                    aria-controls="aria-activity-panel"
                    aria-label={activityOpen ? "Collapse activity feed" : "Expand activity feed"}
                    className="inline-flex h-6 items-center gap-1 rounded-[var(--ds-radius-sm)] px-1.5 text-[11px] text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                >
                    <Icons.Activity className="size-3.5" aria-hidden />
                    <span>Activity</span>
                    {activityOpen ? (
                        <Icons.ChevronDown className="size-3" aria-hidden />
                    ) : (
                        <Icons.ChevronUp className="size-3" aria-hidden />
                    )}
                </button>
            </div>
            <MessageList messages={messages} />
            {activityOpen && (
                <div
                    id="aria-activity-panel"
                    className="flex h-[38%] min-h-[160px] max-h-[320px] flex-none flex-col border-t border-[var(--ds-border)]"
                >
                    <ActivityFeed />
                </div>
            )}
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

    const dotStatus: Status =
        status === "open"
            ? "nominal"
            : status === "error"
              ? "critical"
              : status === "connecting"
                ? "warning"
                : "unknown";

    return (
        <div className="flex items-center gap-2 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
            <StatusDot status={dotStatus} size={6} aria-hidden />
            <span>{label}</span>
        </div>
    );
}
