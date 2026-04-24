/**
 * Tests for the `useAgentStream` selector.
 *
 * M8.5 refactor: the hook no longer owns a WebSocket subscription. It
 * reads from the global `useAgentTurnsStore` which is fed by
 * `useAgentTurnsIngest`. Tests drive the store directly to exercise
 * the selector.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAgentTurnsStore } from "@/features/agents/agentTurnsStore";
import { useAgentStream } from "@/features/agents/useAgentStream";

describe("useAgentStream", () => {
    afterEach(() => {
        useAgentTurnsStore.getState().clearAll();
    });

    type IngestType = Parameters<ReturnType<typeof useAgentTurnsStore.getState>["ingest"]>[0];

    function ingest(type: IngestType, payload: Record<string, unknown>): void {
        useAgentTurnsStore.getState().ingest(type, payload);
    }

    it("returns empty state when agent is null", () => {
        const { result } = renderHook(() => useAgentStream(null));
        expect(result.current.turnId).toBeNull();
        expect(result.current.thinking).toBe("");
        expect(result.current.tools).toEqual([]);
        expect(result.current.isStreaming).toBe(false);
    });

    it("returns empty state when no turn has been recorded for agent", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        expect(result.current.turnId).toBeNull();
    });

    it("picks up an agent_start and exposes turnId + isStreaming", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "investigator", turn_id: "t1" });
        });
        expect(result.current.turnId).toBe("t1");
        expect(result.current.isStreaming).toBe(true);
        expect(result.current.thinking).toBe("");
    });

    it("accumulates thinking deltas on the active turn", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "investigator", turn_id: "t1" });
            ingest("thinking_delta", {
                agent: "investigator",
                turn_id: "t1",
                content: "Hmm, ",
            });
            ingest("thinking_delta", {
                agent: "investigator",
                turn_id: "t1",
                content: "pressure is pinned.",
            });
        });
        expect(result.current.thinking).toBe("Hmm, pressure is pinned.");
    });

    it("records tool_call lifecycle with FIFO matching", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "investigator", turn_id: "t1" });
            ingest("tool_call_started", {
                agent: "investigator",
                turn_id: "t1",
                tool_name: "get_signal_trend",
                args: { cell_id: 1 },
            });
            ingest("tool_call_started", {
                agent: "investigator",
                turn_id: "t1",
                tool_name: "get_signal_trend",
                args: { cell_id: 2 },
            });
            ingest("tool_call_completed", {
                agent: "investigator",
                turn_id: "t1",
                tool_name: "get_signal_trend",
                duration_ms: 42,
            });
        });
        expect(result.current.tools).toHaveLength(2);
        // First (oldest running) tool is the one that gets sealed.
        expect(result.current.tools[0].status).toBe("done");
        expect(result.current.tools[0].durationMs).toBe(42);
        expect(result.current.tools[1].status).toBe("running");
    });

    it("flips isStreaming to false on agent_end", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "investigator", turn_id: "t1" });
            ingest("agent_end", {
                agent: "investigator",
                turn_id: "t1",
                finish_reason: "end_turn",
            });
        });
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.turnId).toBe("t1"); // still readable after end
    });

    it("survives the Inspector closing + reopening (persistence)", () => {
        // First mount — simulates Inspector open during the run.
        const first = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "investigator", turn_id: "t1" });
            ingest("thinking_delta", {
                agent: "investigator",
                turn_id: "t1",
                content: "Diagnosing...",
            });
            ingest("agent_end", {
                agent: "investigator",
                turn_id: "t1",
                finish_reason: "end_turn",
            });
        });
        first.unmount();

        // Second mount — simulates Inspector reopened after the turn.
        const second = renderHook(() => useAgentStream("investigator"));
        expect(second.result.current.turnId).toBe("t1");
        expect(second.result.current.thinking).toBe("Diagnosing...");
        expect(second.result.current.isStreaming).toBe(false);
    });

    it("ignores events for a different agent", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            ingest("agent_start", { agent: "kb_builder", turn_id: "t99" });
            ingest("thinking_delta", {
                agent: "kb_builder",
                turn_id: "t99",
                content: "KB work",
            });
        });
        expect(result.current.turnId).toBeNull();
        expect(result.current.thinking).toBe("");
    });
});
