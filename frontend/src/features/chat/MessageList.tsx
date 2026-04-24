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
                    className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground shadow-card transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.ChevronDown className="size-3.5" />
                    Jump to latest
                    {pendingCount > 0 && (
                        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
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
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div
                className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden
            >
                <Icons.Sparkles className="size-4" />
            </div>
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium tracking-[-0.01em] text-foreground">
                    Ask the operator console anything
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                    Try “show WO table”, “query_kb for turbidity RCAs”, or “handoff to
                    investigator”.
                </p>
            </div>
        </div>
    );
}
