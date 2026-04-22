import { useEffect, useState } from "react";
import { type ChatMessage, useChatStore } from "./chatStore";

/**
 * rAF-throttled subscription to `chatStore.messages`. The store can emit
 * dozens of text_delta updates per second during a stream; committing each
 * one to React causes `<MessageList>` (and every `<Message>` through it)
 * to re-render at token rate, which starves the main thread above ~60
 * tokens/s. We coalesce updates into at most one commit per animation
 * frame — the browser wouldn't paint more than that anyway.
 */
export function useThrottledMessages(): ChatMessage[] {
    const [snapshot, setSnapshot] = useState<ChatMessage[]>(() => useChatStore.getState().messages);

    useEffect(() => {
        let rafId = 0;
        let latest: ChatMessage[] = useChatStore.getState().messages;

        const flush = () => {
            rafId = 0;
            setSnapshot(latest);
        };

        const unsubscribe = useChatStore.subscribe((state) => {
            latest = state.messages;
            if (rafId === 0) rafId = requestAnimationFrame(flush);
        });

        // Catch up in case the store changed between render and effect.
        latest = useChatStore.getState().messages;
        setSnapshot(latest);

        return () => {
            unsubscribe();
            if (rafId !== 0) cancelAnimationFrame(rafId);
        };
    }, []);

    return snapshot;
}
