/**
 * Global, lifecycle-agnostic buffer of agent turns (M8.5 fix).
 *
 * Fed in permanence by `useAgentTurnsIngest` (mounted once at the app
 * root), consumed on-demand by `useAgentStream` (Agent Inspector). The
 * Inspector's mount/unmount cycle can no longer wipe the buffer — close
 * and reopen the drawer, everything is still there.
 *
 * Keyed by `turn_id` for O(1) lookup on every incoming event. A
 * `latestByAgent` secondary index lets the Inspector resolve
 * `agent -> latest turn` in a single selector call.
 *
 * FIFO cap: MAX_TURNS_TOTAL drops the oldest turn when the map overflows.
 * Each turn also holds a bounded `rawEvents` list (every frame the
 * ingestor forwarded for that turn) so the Inspector's "Inputs & outputs"
 * tab can render the raw event log even long after the turn ended.
 */
import { create } from "zustand";
import type { EventBusMap } from "../../lib/ws.types";
import type { HandoffEvent, ToolRun } from "./types";

export interface RawAgentEvent {
    id: string;
    type: keyof EventBusMap;
    at: number;
    payload: Record<string, unknown>;
}

export interface TurnState {
    agent: string;
    turnId: string;
    startedAt: number;
    endedAt: number | null;
    thinking: string;
    tools: ToolRun[];
    handoffs: HandoffEvent[];
    rawEvents: RawAgentEvent[];
    finishReason: string | null;
}

interface AgentTurnsState {
    /** Turn data indexed by turn_id. */
    turns: Record<string, TurnState>;
    /** Agent name -> most recent turn_id seen for that agent. */
    latestByAgent: Record<string, string>;
    /** Monotonic counter for local id generation (stable React keys). */
    counter: number;
    /** Funnel from the bus. Called once per frame by the ingest hook. */
    ingest: (type: keyof EventBusMap, payload: Record<string, unknown>) => void;
    /** Wipe everything — used by tests, never by the UI. */
    clearAll: () => void;
}

const MAX_TURNS_TOTAL = 50;
const MAX_RAW_EVENTS_PER_TURN = 500;

function bumpCounter(state: AgentTurnsState): number {
    state.counter += 1;
    return state.counter;
}

function nextLocalId(state: AgentTurnsState, prefix: string): string {
    return `${prefix}-${bumpCounter(state)}`;
}

function appendRaw(
    state: AgentTurnsState,
    turnId: string,
    type: keyof EventBusMap,
    payload: Record<string, unknown>,
): void {
    const turn = state.turns[turnId];
    if (!turn) return;
    const entry: RawAgentEvent = {
        id: nextLocalId(state, "raw"),
        type,
        at: Date.now(),
        payload,
    };
    const raw =
        turn.rawEvents.length >= MAX_RAW_EVENTS_PER_TURN
            ? [...turn.rawEvents.slice(-(MAX_RAW_EVENTS_PER_TURN - 1)), entry]
            : [...turn.rawEvents, entry];
    state.turns[turnId] = { ...turn, rawEvents: raw };
}

export const useAgentTurnsStore = create<AgentTurnsState>((set) => ({
    turns: {},
    latestByAgent: {},
    counter: 0,
    ingest: (type, payload) =>
        set((prev) => {
            // Work on a shallow draft — we rebuild turns/latestByAgent on write.
            const draft: AgentTurnsState = {
                ...prev,
                turns: { ...prev.turns },
                latestByAgent: { ...prev.latestByAgent },
            };

            const p = payload as Record<string, unknown>;
            const agent = typeof p.agent === "string" ? (p.agent as string) : undefined;
            const turnId = typeof p.turn_id === "string" ? (p.turn_id as string) : undefined;
            const now = Date.now();

            switch (type) {
                case "agent_start": {
                    if (!agent || !turnId) break;
                    draft.turns[turnId] = {
                        agent,
                        turnId,
                        startedAt: now,
                        endedAt: null,
                        thinking: "",
                        tools: [],
                        handoffs: [],
                        rawEvents: [
                            {
                                id: nextLocalId(draft, "raw"),
                                type,
                                at: now,
                                payload,
                            },
                        ],
                        finishReason: null,
                    };
                    draft.latestByAgent[agent] = turnId;
                    break;
                }
                case "agent_end": {
                    if (!turnId || !draft.turns[turnId]) break;
                    const finishReason =
                        typeof p.finish_reason === "string"
                            ? (p.finish_reason as string)
                            : "unknown";
                    draft.turns[turnId] = {
                        ...draft.turns[turnId],
                        endedAt: now,
                        finishReason,
                    };
                    appendRaw(draft, turnId, type, payload);
                    break;
                }
                case "thinking_delta": {
                    if (!turnId || !draft.turns[turnId]) break;
                    const content = typeof p.content === "string" ? (p.content as string) : "";
                    draft.turns[turnId] = {
                        ...draft.turns[turnId],
                        thinking: draft.turns[turnId].thinking + content,
                    };
                    appendRaw(draft, turnId, type, payload);
                    break;
                }
                case "tool_call_started": {
                    if (!turnId || !draft.turns[turnId]) break;
                    const toolName = typeof p.tool_name === "string" ? (p.tool_name as string) : "";
                    const args =
                        p.args && typeof p.args === "object"
                            ? (p.args as Record<string, unknown>)
                            : {};
                    const run: ToolRun = {
                        id: nextLocalId(draft, "tc"),
                        toolName,
                        args,
                        startedAt: now,
                        status: "running",
                    };
                    draft.turns[turnId] = {
                        ...draft.turns[turnId],
                        tools: [...draft.turns[turnId].tools, run],
                    };
                    appendRaw(draft, turnId, type, payload);
                    break;
                }
                case "tool_call_completed": {
                    if (!turnId || !draft.turns[turnId]) break;
                    const toolName = typeof p.tool_name === "string" ? (p.tool_name as string) : "";
                    const durationMs =
                        typeof p.duration_ms === "number" ? (p.duration_ms as number) : 0;
                    const tools = [...draft.turns[turnId].tools];
                    const idx = tools.findIndex(
                        (t) => t.toolName === toolName && t.status === "running",
                    );
                    if (idx >= 0) {
                        tools[idx] = { ...tools[idx], durationMs, status: "done" };
                        draft.turns[turnId] = { ...draft.turns[turnId], tools };
                    }
                    appendRaw(draft, turnId, type, payload);
                    break;
                }
                case "agent_handoff": {
                    if (!turnId || !draft.turns[turnId]) break;
                    const fromAgent =
                        typeof p.from_agent === "string" ? (p.from_agent as string) : "";
                    const toAgent = typeof p.to_agent === "string" ? (p.to_agent as string) : "";
                    const reason = typeof p.reason === "string" ? (p.reason as string) : "";
                    const handoff: HandoffEvent = {
                        id: nextLocalId(draft, "ho"),
                        from_agent: fromAgent,
                        to_agent: toAgent,
                        reason,
                        turn_id: turnId,
                        receivedAt: now,
                    };
                    draft.turns[turnId] = {
                        ...draft.turns[turnId],
                        handoffs: [...draft.turns[turnId].handoffs, handoff],
                    };
                    appendRaw(draft, turnId, type, payload);
                    break;
                }
                default:
                    break;
            }

            // Bound total turns — drop oldest by startedAt.
            const ids = Object.keys(draft.turns);
            if (ids.length > MAX_TURNS_TOTAL) {
                const sorted = ids.sort(
                    (a, b) => draft.turns[a].startedAt - draft.turns[b].startedAt,
                );
                for (const id of sorted.slice(0, ids.length - MAX_TURNS_TOTAL)) {
                    delete draft.turns[id];
                }
                // Rebuild latestByAgent — a dropped turn_id might have been
                // referenced there. Keep only entries still pointing at a
                // live turn.
                const cleaned: Record<string, string> = {};
                for (const [a, tid] of Object.entries(draft.latestByAgent)) {
                    if (draft.turns[tid]) cleaned[a] = tid;
                }
                draft.latestByAgent = cleaned;
            }

            return {
                turns: draft.turns,
                latestByAgent: draft.latestByAgent,
                counter: draft.counter,
            };
        }),
    clearAll: () => set({ turns: {}, latestByAgent: {}, counter: 0 }),
}));
