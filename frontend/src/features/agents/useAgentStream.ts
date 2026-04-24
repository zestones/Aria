/**
 * Subscribes to `/api/v1/events` for a given agent and exposes a turn-scoped
 * buffer (thinking delta cumul, tool call lifecycle, handoffs, streaming
 * flag). Mirrors the `useAnomalyStream` pattern (M7.3) — one socket per
 * hook instance, filter inside `onEvent`.
 *
 * Turn semantics:
 * - `agent_start` for the tracked agent → opens a new turn, resets buffers,
 *   flips `isStreaming` to true.
 * - `agent_end` for the tracked agent → keeps buffers, flips `isStreaming`
 *   to false.
 * - All intermediate events (`thinking_delta`, `tool_call_started`,
 *   `tool_call_completed`, `agent_handoff`) are scoped to the active
 *   `turnId`. Events with a different `turn_id` are ignored defensively
 *   (the bus is global, simultaneous agents can interleave).
 *
 * No persistence. Closing the inspector unmounts → socket closes, buffer
 * garbage-collected. Re-opening the inspector starts fresh.
 */

import { useEffect, useRef, useState } from "react";
import { createWsClient } from "../../lib/ws";
import type { EventBusMap } from "../../lib/ws.types";
import type { HandoffEvent, ToolRun } from "./types";

const EVENTS_WS_URL = "/api/v1/events";

export type AgentStreamStatus = "connecting" | "open" | "closed" | "error";

export interface UseAgentStreamResult {
    /** Current turn id — null before the first `agent_start`. */
    turnId: string | null;
    /** Cumulative `thinking_delta` content for the current turn. */
    thinking: string;
    /** Tool calls emitted during the current turn, in start order. */
    tools: ToolRun[];
    /** Handoffs originating from this agent during the current turn. */
    handoffs: HandoffEvent[];
    /** Raw bus events for this agent's active turn — used by the IO tab. */
    rawEvents: RawAgentEvent[];
    /** True between `agent_start` and `agent_end` for the tracked agent. */
    isStreaming: boolean;
    /** Socket lifecycle. */
    connectionStatus: AgentStreamStatus;
}

export interface RawAgentEvent {
    id: string;
    type: keyof EventBusMap;
    at: number;
    payload: Record<string, unknown>;
}

interface MutableTurnState {
    turnId: string | null;
    thinking: string;
    tools: ToolRun[];
    handoffs: HandoffEvent[];
    rawEvents: RawAgentEvent[];
    counter: number;
}

const emptyTurn = (): MutableTurnState => ({
    turnId: null,
    thinking: "",
    tools: [],
    handoffs: [],
    rawEvents: [],
    counter: 0,
});

/**
 * Subscribe to the event bus for `agent`. Pass `null` to keep the hook
 * idle (no socket opened).
 */
export function useAgentStream(agent: string | null): UseAgentStreamResult {
    const [turnId, setTurnId] = useState<string | null>(null);
    const [thinking, setThinking] = useState("");
    const [tools, setTools] = useState<ToolRun[]>([]);
    const [handoffs, setHandoffs] = useState<HandoffEvent[]>([]);
    const [rawEvents, setRawEvents] = useState<RawAgentEvent[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<AgentStreamStatus>("connecting");

    const stateRef = useRef<MutableTurnState>(emptyTurn());

    useEffect(() => {
        if (!agent) {
            stateRef.current = emptyTurn();
            setTurnId(null);
            setThinking("");
            setTools([]);
            setHandoffs([]);
            setRawEvents([]);
            setIsStreaming(false);
            setConnectionStatus("closed");
            return;
        }

        const controller = new AbortController();
        setConnectionStatus("connecting");
        stateRef.current = emptyTurn();
        setTurnId(null);
        setThinking("");
        setTools([]);
        setHandoffs([]);
        setRawEvents([]);
        setIsStreaming(false);

        const nextId = (prefix: string): string => {
            stateRef.current.counter += 1;
            return `${prefix}-${stateRef.current.counter}`;
        };

        const pushRaw = (type: keyof EventBusMap, payload: Record<string, unknown>) => {
            const entry: RawAgentEvent = {
                id: nextId("raw"),
                type,
                at: Date.now(),
                payload,
            };
            stateRef.current.rawEvents = [...stateRef.current.rawEvents, entry];
            setRawEvents(stateRef.current.rawEvents);
        };

        const client = createWsClient<EventBusMap>({
            url: EVENTS_WS_URL,
            signal: controller.signal,
            onOpen: () => setConnectionStatus("open"),
            onClose: () => setConnectionStatus("closed"),
            onError: () => setConnectionStatus("error"),
            onEvent: (type, payload) => {
                // Only claim events that reference our agent.
                const p = payload as Record<string, unknown>;
                const isForAgent =
                    (type === "agent_start" ||
                        type === "agent_end" ||
                        type === "thinking_delta" ||
                        type === "tool_call_started" ||
                        type === "tool_call_completed" ||
                        type === "agent_handoff") &&
                    agentFromPayload(type, p) === agent;
                if (!isForAgent) return;

                switch (type) {
                    case "agent_start": {
                        const e = payload as EventBusMap["agent_start"];
                        // New turn — clear buffers.
                        stateRef.current = {
                            ...emptyTurn(),
                            turnId: e.turn_id,
                            counter: stateRef.current.counter,
                        };
                        setTurnId(e.turn_id);
                        setThinking("");
                        setTools([]);
                        setHandoffs([]);
                        setRawEvents([]);
                        setIsStreaming(true);
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    case "agent_end": {
                        const e = payload as EventBusMap["agent_end"];
                        if (e.turn_id !== stateRef.current.turnId) return;
                        setIsStreaming(false);
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    case "thinking_delta": {
                        const e = payload as EventBusMap["thinking_delta"];
                        if (e.turn_id !== stateRef.current.turnId) return;
                        stateRef.current.thinking += e.content;
                        setThinking(stateRef.current.thinking);
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    case "tool_call_started": {
                        const e = payload as EventBusMap["tool_call_started"];
                        if (e.turn_id !== stateRef.current.turnId) return;
                        const run: ToolRun = {
                            id: nextId("tc"),
                            toolName: e.tool_name,
                            args: e.args,
                            startedAt: Date.now(),
                            status: "running",
                        };
                        stateRef.current.tools = [...stateRef.current.tools, run];
                        setTools(stateRef.current.tools);
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    case "tool_call_completed": {
                        const e = payload as EventBusMap["tool_call_completed"];
                        if (e.turn_id !== stateRef.current.turnId) return;
                        // FIFO match on tool_name against the oldest running run.
                        const idx = stateRef.current.tools.findIndex(
                            (t) => t.toolName === e.tool_name && t.status === "running",
                        );
                        if (idx >= 0) {
                            const next = [...stateRef.current.tools];
                            next[idx] = {
                                ...next[idx],
                                durationMs: e.duration_ms,
                                status: "done",
                            };
                            stateRef.current.tools = next;
                            setTools(next);
                        }
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    case "agent_handoff": {
                        const e = payload as EventBusMap["agent_handoff"];
                        if (e.turn_id !== stateRef.current.turnId) return;
                        const entry: HandoffEvent = {
                            ...e,
                            id: nextId("ho"),
                            receivedAt: Date.now(),
                        };
                        stateRef.current.handoffs = [...stateRef.current.handoffs, entry];
                        setHandoffs(stateRef.current.handoffs);
                        pushRaw(type, e as unknown as Record<string, unknown>);
                        break;
                    }
                    default:
                        break;
                }
            },
        });

        return () => {
            controller.abort();
            client.close(1000, "unmount");
        };
    }, [agent]);

    return {
        turnId,
        thinking,
        tools,
        handoffs,
        rawEvents,
        isStreaming,
        connectionStatus,
    };
}

/**
 * Extract the `agent` field from an event payload. `agent_handoff` uses
 * `from_agent` (the outgoing speaker); that's still the agent this inspector
 * tracks when we're watching them delegate.
 */
function agentFromPayload(
    type: keyof EventBusMap,
    payload: Record<string, unknown>,
): string | null {
    if (type === "agent_handoff") {
        const v = payload.from_agent;
        return typeof v === "string" ? v : null;
    }
    const v = payload.agent;
    return typeof v === "string" ? v : null;
}
