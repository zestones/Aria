import type { EventBusMap } from "../../lib/ws";

export type AgentStreamAgentId = string;

/**
 * Snapshot of a tool call the agent emitted during a turn.
 * Started when `tool_call_started` arrives; sealed when the matching
 * `tool_call_completed` arrives (same turn_id + tool_name, FIFO match).
 */
export interface ToolRun {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    startedAt: number;
    /** Fills on `tool_call_completed`. */
    durationMs?: number;
    /** UI status — "done" once the completed event arrives. */
    status: "running" | "done";
}

export type HandoffEvent = EventBusMap["agent_handoff"] & {
    /** `Date.now()` at reception — for stable ordering. */
    receivedAt: number;
    id: string;
};

export type ThinkingDeltaEvent = EventBusMap["thinking_delta"];
