import { useEffect, useRef, useState } from "react";
import { Icons } from "../../components/ui";
import type { ChatMessage } from "./chatStore";
import { Message } from "./Message";
import { useAutoScroll } from "./useAutoScroll";

const TIMESTAMP_TICK_MS = 30_000;

interface MessageListProps {
    messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const messagesLenRef = useRef(messages.length);
    const { isPaused, pendingCount, jumpToBottom, notifyContentGrew, notifyMessageAppended } =
        useAutoScroll(scrollRef);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), TIMESTAMP_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (messages.length > messagesLenRef.current) {
            for (let i = messagesLenRef.current; i < messages.length; i += 1) {
                notifyMessageAppended();
            }
        } else {
            notifyContentGrew();
        }
        messagesLenRef.current = messages.length;
    }, [messages, notifyContentGrew, notifyMessageAppended]);

    return (
        <div className="relative min-h-0 flex-1">
            <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                className="h-full overflow-y-auto px-4 py-4"
            >
                {messages.length === 0 ? (
                    <EmptyState />
                ) : (
                    <ol className="flex flex-col gap-5">
                        {messages.map((m) => (
                            <li key={m.id}>
                                <Message message={m} now={now} />
                            </li>
                        ))}
                    </ol>
                )}
            </div>
            {isPaused && (
                <button
                    type="button"
                    onClick={jumpToBottom}
                    className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border-strong)] bg-[var(--ds-bg-surface)] px-3 py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-primary)] shadow-[var(--ds-shadow-overlay)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                >
                    <Icons.ChevronDown className="size-3.5" />
                    Jump to latest
                    {pendingCount > 0 && (
                        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ds-accent)] px-1 text-[10px] font-medium leading-none text-[var(--ds-accent-fg)]">
                            {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex h-full flex-col items-start gap-3 pt-8">
            <p className="text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)]">
                Ask the operator console anything.
            </p>
            <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                Try “show WO table”, “query_kb for turbidity RCAs”, or “handoff to investigator”.
            </p>
        </div>
    );
}
