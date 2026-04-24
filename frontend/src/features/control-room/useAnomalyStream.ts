/**
 * M7.3 — Real-time anomaly stream hook.
 *
 * Wires the singleton `/api/v1/events` WS client into a compact React state:
 * a FIFO-capped list of active (non-dismissed) anomalies, newest first, plus
 * a live connection status.
 *
 * The bus emits several event types (`agent_start`, `thinking_delta`,
 * `tool_call_*`, etc.) — this hook listens **only** to `anomaly_detected`
 * and ignores the rest silently. Other panels will claim their own slice of
 * the bus in later milestones (M8+).
 *
 * FIFO cap: 20 entries. A long demo session can fire dozens of anomalies;
 * the banner only ever shows `latest`, so older entries are pure memory. Cap
 * keeps the array bounded without persistence (a page refresh wipes state
 * — desired: "dismiss masks locally, new event re-shows").
 *
 * Reconnect/abort/error handling is delegated to `createWsClient` (tested in
 * M6.4). The hook surfaces the connection status for future debug UI but
 * never renders errors itself.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBusMap } from "../../lib/ws";
import { createWsClient } from "../../lib/ws";

const EVENTS_WS_URL = "/api/v1/events";
const FIFO_CAP = 20;

export type AnomalyEvent = EventBusMap["anomaly_detected"] & {
    /** `Date.now()` at reception — stable ordering independent of `time` clock skew. */
    receivedAt: number;
    /** Stable unique id; duplicate frames with the same tuple are ignored. */
    id: string;
};

export type AnomalyConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface UseAnomalyStreamResult {
    /** Non-dismissed anomalies, newest first, capped at {@link FIFO_CAP}. */
    active: AnomalyEvent[];
    /** Sugar: `active[0] ?? null`. */
    latest: AnomalyEvent | null;
    /** `active.length` — exposed for badge counters. */
    count: number;
    /** Clear every active anomaly. */
    dismissAll: () => void;
    /** Drop the newest (head) anomaly only. */
    dismissLatest: () => void;
    /** Live socket state, mirrors the underlying client lifecycle. */
    connectionStatus: AnomalyConnectionStatus;
}

function anomalyId(evt: EventBusMap["anomaly_detected"]): string {
    return `${evt.cell_id}-${evt.signal_def_id}-${evt.time}`;
}

export function useAnomalyStream(): UseAnomalyStreamResult {
    const [active, setActive] = useState<AnomalyEvent[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<AnomalyConnectionStatus>("connecting");

    // Track seen ids so a retried/duplicate frame does not appear twice.
    const seenIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const controller = new AbortController();
        setConnectionStatus("connecting");

        const client = createWsClient<EventBusMap>({
            url: EVENTS_WS_URL,
            signal: controller.signal,
            onOpen: () => setConnectionStatus("open"),
            onClose: () => setConnectionStatus("closed"),
            onError: () => setConnectionStatus("error"),
            onEvent: (type, payload) => {
                if (type !== "anomaly_detected") return;
                const evt = payload as EventBusMap["anomaly_detected"];
                const id = anomalyId(evt);
                if (seenIdsRef.current.has(id)) return;
                seenIdsRef.current.add(id);
                const entry: AnomalyEvent = {
                    ...evt,
                    id,
                    receivedAt: Date.now(),
                };
                setActive((prev) => [entry, ...prev].slice(0, FIFO_CAP));
            },
        });

        return () => {
            controller.abort();
            client.close(1000, "unmount");
        };
    }, []);

    const dismissAll = useCallback(() => {
        setActive([]);
    }, []);

    const dismissLatest = useCallback(() => {
        setActive((prev) => (prev.length === 0 ? prev : prev.slice(1)));
    }, []);

    return {
        active,
        latest: active[0] ?? null,
        count: active.length,
        dismissAll,
        dismissLatest,
        connectionStatus,
    };
}
