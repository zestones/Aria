/**
 * Singleton bus consumer feeding `useAgentTurnsStore`.
 *
 * Mounted exactly once at the app root (`AppShell`). Keeps a single
 * `/api/v1/events` WebSocket open for the lifetime of the session so
 * every agent frame is captured in the store — regardless of whether
 * the Agent Inspector is currently open.
 *
 * Mirrors `useAnomalyStream` / `useActivityFeedStream` wiring: the
 * typed `createWsClient` with an AbortController-based cleanup.
 */
import { useEffect } from "react";
import type { EventBusMap } from "../../lib/ws";
import { createWsClient } from "../../lib/ws";
import { useAgentTurnsStore } from "./agentTurnsStore";

const EVENTS_WS_URL = "/api/v1/events";

/**
 * Mount-once side effect hook. Populates `useAgentTurnsStore` from the
 * `/api/v1/events` server-sent stream for the lifetime of the tab. Any
 * consumer that calls `useAgentStream(agent)` reads from the resulting
 * buffer — closing/reopening the consumer never wipes history.
 */
export function useAgentTurnsIngest(): void {
    const ingest = useAgentTurnsStore((s) => s.ingest);
    useEffect(() => {
        const controller = new AbortController();
        const client = createWsClient<EventBusMap>({
            url: EVENTS_WS_URL,
            signal: controller.signal,
            onEvent: (type, payload) => {
                ingest(type, payload as Record<string, unknown>);
            },
        });
        return () => {
            controller.abort();
            client.close(1000, "unmount");
        };
    }, [ingest]);
}
