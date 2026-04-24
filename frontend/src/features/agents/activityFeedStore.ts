/**
 * Zustand slice backing the Agent Activity Feed (M8.4).
 *
 * Circular FIFO buffer capped at {@link MAX_EVENTS}. The live `/api/v1/events`
 * socket (consumed by `useActivityFeedStream`) pushes typed events in;
 * the panel subscribes to the resulting array and re-renders.
 *
 * Each event is keyed by a monotonic counter so React reconciles correctly
 * even when two events share a timestamp (fast tool calls back-to-back).
 */

import { create } from "zustand";
import type { EventBusMap } from "../../lib/ws";

export const MAX_EVENTS = 100;
export const TTL_MS = 5 * 60 * 1000;

export type ActivityEventType =
    | "agent_start"
    | "agent_end"
    | "tool_call_started"
    | "tool_call_completed"
    | "agent_handoff"
    | "anomaly_detected";

/**
 * The six event variants the feed surfaces. Each extends the backend
 * payload with a local `id` + `receivedAt` for stable ordering / keying.
 */
export type ActivityEvent =
    | ({ kind: "agent_start"; id: string; receivedAt: number } & EventBusMap["agent_start"])
    | ({ kind: "agent_end"; id: string; receivedAt: number } & EventBusMap["agent_end"])
    | ({
          kind: "tool_call_started";
          id: string;
          receivedAt: number;
      } & EventBusMap["tool_call_started"])
    | ({
          kind: "tool_call_completed";
          id: string;
          receivedAt: number;
      } & EventBusMap["tool_call_completed"])
    | ({ kind: "agent_handoff"; id: string; receivedAt: number } & EventBusMap["agent_handoff"])
    | ({
          kind: "anomaly_detected";
          id: string;
          receivedAt: number;
      } & EventBusMap["anomaly_detected"]);

export interface ActivityFeedState {
    events: ActivityEvent[];
    push: (event: ActivityEvent) => void;
    clear: () => void;
}

export const useActivityFeedStore = create<ActivityFeedState>((set) => ({
    events: [],
    push: (event) =>
        set((state) => {
            // Prepend newest — UI renders top-to-bottom newest-first.
            const next = [event, ...state.events];
            if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
            return { events: next };
        }),
    clear: () => set({ events: [] }),
}));
