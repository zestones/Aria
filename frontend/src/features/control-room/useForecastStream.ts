/**
 * M9 predictive-alerting stream hook.
 *
 * Sibling to {@link useAnomalyStream}. Listens to `forecast_warning` frames
 * emitted by the backend `agents.sentinel.forecast_watch_loop` and exposes
 * a capped FIFO of active forecast warnings with a live connection status.
 *
 * A forecast warning is advisory — no work order is opened, and the
 * `AnomalyBanner` merges these entries with real anomalies but distinguishes
 * the tone. The banner is the only intended consumer for now; future surfaces
 * (KPI bar, Constellation) can reuse the hook without adding plumbing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBusMap } from "../../lib/ws";
import { createWsClient } from "../../lib/ws";

const EVENTS_WS_URL = "/api/v1/events";
const FIFO_CAP = 20;

export type ForecastEvent = EventBusMap["forecast_warning"] & {
    /** `Date.now()` at reception — stable ordering independent of backend clock skew. */
    receivedAt: number;
    /** Stable id; duplicate frames with the same tuple collapse into one. */
    id: string;
};

export type ForecastConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface UseForecastStreamResult {
    /** Non-dismissed forecasts, newest first, capped at {@link FIFO_CAP}. */
    active: ForecastEvent[];
    /** Sugar: `active[0] ?? null`. */
    latest: ForecastEvent | null;
    /** `active.length` — exposed for badge counters. */
    count: number;
    /** Clear every active forecast. */
    dismissAll: () => void;
    /** Drop the newest (head) forecast only. */
    dismissLatest: () => void;
    /** Live socket state, mirrors the underlying client lifecycle. */
    connectionStatus: ForecastConnectionStatus;
}

function forecastId(evt: EventBusMap["forecast_warning"]): string {
    // Backend debounces at 30 min so any two frames with the same tuple in a
    // short window are duplicate deliveries. The `projected_breach_at` is
    // included so two distinct forecasts for the same signal (e.g. drift
    // reversed and was re-emitted) still appear as separate entries.
    return `${evt.cell_id}-${evt.signal_def_id}-${evt.projected_breach_at}`;
}

export function useForecastStream(): UseForecastStreamResult {
    const [active, setActive] = useState<ForecastEvent[]>([]);
    const [connectionStatus, setConnectionStatus] =
        useState<ForecastConnectionStatus>("connecting");

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
                if (type !== "forecast_warning") return;
                const evt = payload as EventBusMap["forecast_warning"];
                const id = forecastId(evt);
                if (seenIdsRef.current.has(id)) return;
                seenIdsRef.current.add(id);
                const entry: ForecastEvent = {
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
