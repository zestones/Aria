import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 48;

export interface AutoScrollHandle {
    /** True when user has scrolled up and new messages are being held. */
    isPaused: boolean;
    /** Delta of new content since pause started — drives the jump-bottom badge. */
    pendingCount: number;
    /** Scroll back to the bottom smoothly and resume auto-scroll. */
    jumpToBottom: () => void;
    /** Call on every external reason to re-evaluate (new token, new message). */
    notifyContentGrew: () => void;
    /** Call when a brand-new message arrives — increments the pending counter. */
    notifyMessageAppended: () => void;
}

export function useAutoScroll<T extends HTMLElement>(ref: RefObject<T | null>): AutoScrollHandle {
    const [isPaused, setIsPaused] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const pausedRef = useRef(false);

    const isNearBottom = useCallback(() => {
        const el = ref.current;
        if (!el) return true;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        return distance <= NEAR_BOTTOM_PX;
    }, [ref]);

    const scrollToBottom = useCallback(
        (smooth = false) => {
            const el = ref.current;
            if (!el) return;
            el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        },
        [ref],
    );

    const jumpToBottom = useCallback(() => {
        scrollToBottom(true);
        pausedRef.current = false;
        setIsPaused(false);
        setPendingCount(0);
    }, [scrollToBottom]);

    const notifyContentGrew = useCallback(() => {
        if (pausedRef.current) return;
        // Defer until layout has settled so scrollHeight reflects the new content.
        requestAnimationFrame(() => scrollToBottom(false));
    }, [scrollToBottom]);

    const notifyMessageAppended = useCallback(() => {
        if (pausedRef.current) {
            setPendingCount((c) => c + 1);
            return;
        }
        requestAnimationFrame(() => scrollToBottom(false));
    }, [scrollToBottom]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let rafId = 0;
        const handle = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                const near = isNearBottom();
                const nextPaused = !near;
                if (nextPaused !== pausedRef.current) {
                    pausedRef.current = nextPaused;
                    setIsPaused(nextPaused);
                    if (!nextPaused) setPendingCount(0);
                }
            });
        };
        el.addEventListener("scroll", handle, { passive: true });
        return () => {
            el.removeEventListener("scroll", handle);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [ref, isNearBottom]);

    return { isPaused, pendingCount, jumpToBottom, notifyContentGrew, notifyMessageAppended };
}
