/**
 * Subscribes to `/api/v1/events` and funnels the 6 agent-facing event
 * variants into the `useActivityFeedStore` FIFO (M8.4).
 *
 * Mirrors `useAnomalyStream` (M7.3) / `useAgentStream` (M8.5): one socket
 * per mount, AbortController cleanup, status surfaced for debugging UI.
 * Dedup by the local `id` prevents duplicate frames (WS reconnect) from
 * showing twice in the feed.
 */

import { useEffect, useState } from "react";
import type { EventBusMap } from "../../lib/ws";
import { createWsClient } from "../../lib/ws";
import { type ActivityEvent, useActivityFeedStore } from "./activityFeedStore";

const EVENTS_WS_URL = "/api/v1/events";

export type ActivityFeedStatus = "connecting" | "open" | "closed" | "error";

let nextCounter = 0;

function makeId(prefix: string): string {
    nextCounter += 1;
    return `${prefix}-${nextCounter}-${Date.now().toString(36)}`;
}

export function useActivityFeedStream(): { connectionStatus: ActivityFeedStatus } {
    const push = useActivityFeedStore((s) => s.push);
    const [connectionStatus, setConnectionStatus] = useState<ActivityFeedStatus>("connecting");

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
                const now = Date.now();
                let evt: ActivityEvent | null = null;
                switch (type) {
                    case "agent_start":
                        evt = {
                            kind: "agent_start",
                            id: makeId("as"),
                            receivedAt: now,
                            ...(payload as EventBusMap["agent_start"]),
                        };
                        break;
                    case "agent_end":
                        evt = {
                            kind: "agent_end",
                            id: makeId("ae"),
                            receivedAt: now,
                            ...(payload as EventBusMap["agent_end"]),
                        };
                        break;
                    case "tool_call_started":
                        evt = {
                            kind: "tool_call_started",
                            id: makeId("ts"),
                            receivedAt: now,
                            ...(payload as EventBusMap["tool_call_started"]),
                        };
                        break;
                    case "tool_call_completed":
                        evt = {
                            kind: "tool_call_completed",
                            id: makeId("tc"),
                            receivedAt: now,
                            ...(payload as EventBusMap["tool_call_completed"]),
                        };
                        break;
                    case "agent_handoff":
                        evt = {
                            kind: "agent_handoff",
                            id: makeId("ho"),
                            receivedAt: now,
                            ...(payload as EventBusMap["agent_handoff"]),
                        };
                        break;
                    case "anomaly_detected":
                        evt = {
                            kind: "anomaly_detected",
                            id: makeId("an"),
                            receivedAt: now,
                            ...(payload as EventBusMap["anomaly_detected"]),
                        };
                        break;
                    default:
                        break;
                }
                if (evt) push(evt);
            },
        });

        return () => {
            controller.abort();
            client.close(1000, "unmount");
        };
    }, [push]);

    return { connectionStatus };
}
