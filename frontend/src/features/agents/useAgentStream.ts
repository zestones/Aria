/**
 * Agent Inspector data source — lifecycle-agnostic selector.
 *
 * Reads from `useAgentTurnsStore` (fed in permanence by
 * `useAgentTurnsIngest` mounted once in `AppShell`). Closing and
 * reopening the Inspector does NOT wipe buffers — the store owns the
 * history, this hook is a pure selector.
 *
 * Signature is preserved so `AgentInspector.tsx` doesn't know the
 * refactor happened. Behaviour changes: `connectionStatus` is
 * always `"open"` from the Inspector's point of view because the
 * ingest socket is mounted at the app root and owns the lifecycle.
 */
import { type RawAgentEvent, useAgentTurnsStore } from "./agentTurnsStore";
import type { HandoffEvent, ToolRun } from "./types";

export type { RawAgentEvent };

export type AgentStreamStatus = "connecting" | "open" | "closed" | "error";

export interface UseAgentStreamResult {
    /** Most recent turn_id seen for `agent`. Null until the first frame. */
    turnId: string | null;
    /** Cumulative `thinking_delta` content for that turn. */
    thinking: string;
    /** Tool calls emitted during that turn, in start order. */
    tools: ToolRun[];
    /** Handoffs originating from `agent` during that turn. */
    handoffs: HandoffEvent[];
    /** Raw bus events for that turn — feeds the "Inputs & outputs" tab. */
    rawEvents: RawAgentEvent[];
    /** True between `agent_start` and `agent_end` for `agent`. */
    isStreaming: boolean;
    /** Ingest socket state (opened once at app root). */
    connectionStatus: AgentStreamStatus;
}

const EMPTY_TOOLS: ToolRun[] = [];
const EMPTY_HANDOFFS: HandoffEvent[] = [];
const EMPTY_RAW: RawAgentEvent[] = [];

/**
 * Returns the latest turn snapshot for `agent`, sourced from the global
 * turns store. Pass `null` to get an empty result (used when the
 * Inspector is closed with no current agent).
 */
export function useAgentStream(agent: string | null): UseAgentStreamResult {
    const turnId = useAgentTurnsStore((s) => (agent ? (s.latestByAgent[agent] ?? null) : null));
    const turn = useAgentTurnsStore((s) => (turnId ? s.turns[turnId] : null));

    if (!agent || !turn) {
        return {
            turnId: null,
            thinking: "",
            tools: EMPTY_TOOLS,
            handoffs: EMPTY_HANDOFFS,
            rawEvents: EMPTY_RAW,
            isStreaming: false,
            connectionStatus: "open",
        };
    }

    return {
        turnId: turn.turnId,
        thinking: turn.thinking,
        tools: turn.tools,
        handoffs: turn.handoffs,
        rawEvents: turn.rawEvents,
        isStreaming: turn.endedAt === null,
        connectionStatus: "open",
    };
}
