import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installMockWebSocket, MockWebSocket, restoreWebSocket } from "../../test/mock-websocket";
import { useAgentStream } from "./useAgentStream";

beforeEach(() => {
    installMockWebSocket();
});

afterEach(() => {
    restoreWebSocket();
});

describe("useAgentStream", () => {
    it("is idle when agent is null (no socket opened)", () => {
        const { result } = renderHook(() => useAgentStream(null));
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.turnId).toBeNull();
        expect(result.current.thinking).toBe("");
        expect(result.current.connectionStatus).toBe("closed");
    });

    it("opens a turn and accumulates thinking for the tracked agent", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "Observing ",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "vibration spike.",
                turn_id: "turn-1",
            });
        });

        expect(result.current.turnId).toBe("turn-1");
        expect(result.current.thinking).toBe("Observing vibration spike.");
        expect(result.current.isStreaming).toBe(true);
    });

    it("flips isStreaming off on agent_end but keeps buffers", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "done.",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "agent_end",
                agent: "investigator",
                turn_id: "turn-1",
                finish_reason: "end_turn",
            });
        });

        expect(result.current.isStreaming).toBe(false);
        expect(result.current.thinking).toBe("done.");
    });

    it("ignores events for other agents on the shared bus", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "sentinel",
                turn_id: "other-turn",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "sentinel",
                content: "nope",
                turn_id: "other-turn",
            });
        });

        expect(result.current.turnId).toBeNull();
        expect(result.current.thinking).toBe("");
        expect(result.current.isStreaming).toBe(false);
    });

    it("ignores events with a stale turn_id for the same agent", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-2",
            });
            // Stray event from a previous turn leaking in.
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "stale",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "current",
                turn_id: "turn-2",
            });
        });

        expect(result.current.turnId).toBe("turn-2");
        expect(result.current.thinking).toBe("current");
    });

    it("tracks tool call lifecycle with duration on completion", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "tool_call_started",
                agent: "investigator",
                tool_name: "get_equipment_kb",
                args: { cell_id: 2 },
                turn_id: "turn-1",
            });
        });

        expect(result.current.tools).toHaveLength(1);
        expect(result.current.tools[0].status).toBe("running");
        expect(result.current.tools[0].toolName).toBe("get_equipment_kb");

        act(() => {
            MockWebSocket.last.simulateMessage({
                type: "tool_call_completed",
                agent: "investigator",
                tool_name: "get_equipment_kb",
                duration_ms: 123,
                turn_id: "turn-1",
            });
        });

        expect(result.current.tools[0].status).toBe("done");
        expect(result.current.tools[0].durationMs).toBe(123);
    });

    it("resets buffers when a new turn starts for the same agent", () => {
        const { result } = renderHook(() => useAgentStream("investigator"));
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "first",
                turn_id: "turn-1",
            });
            MockWebSocket.last.simulateMessage({
                type: "agent_end",
                agent: "investigator",
                turn_id: "turn-1",
                finish_reason: "end_turn",
            });
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "investigator",
                turn_id: "turn-2",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "second",
                turn_id: "turn-2",
            });
        });

        expect(result.current.turnId).toBe("turn-2");
        expect(result.current.thinking).toBe("second");
        expect(result.current.isStreaming).toBe(true);
    });
});
