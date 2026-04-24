import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installMockWebSocket, MockWebSocket, restoreWebSocket } from "../../mock-websocket";
import { useAnomalyStream } from "@/features/control-room/useAnomalyStream";

interface AnomalyPayload {
    cell_id: number;
    signal_def_id: number;
    value: number;
    threshold: number;
    work_order_id: number;
    time: string;
    severity: "alert" | "trip";
    direction: "high" | "low";
}

function anomalyFixture(overrides: Partial<AnomalyPayload> = {}): AnomalyPayload {
    return {
        cell_id: 2,
        signal_def_id: 11,
        value: 4.8,
        threshold: 4.2,
        work_order_id: 101,
        time: "2026-04-24T12:00:00.000Z",
        severity: "alert",
        direction: "high",
        ...overrides,
    };
}

function emitAnomaly(overrides: Partial<AnomalyPayload> = {}) {
    MockWebSocket.last.simulateMessage({
        type: "anomaly_detected",
        ...anomalyFixture(overrides),
    });
}

beforeEach(() => {
    installMockWebSocket();
});

afterEach(() => {
    restoreWebSocket();
});

describe("useAnomalyStream", () => {
    it("captures a single anomaly_detected event with a stable id and receivedAt", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            emitAnomaly();
        });

        expect(result.current.active).toHaveLength(1);
        expect(result.current.count).toBe(1);
        expect(result.current.latest).not.toBeNull();

        const entry = result.current.active[0];
        expect(entry.id).toBe("2-11-2026-04-24T12:00:00.000Z");
        expect(entry.cell_id).toBe(2);
        expect(entry.signal_def_id).toBe(11);
        expect(entry.severity).toBe("alert");
        expect(typeof entry.receivedAt).toBe("number");
    });

    it("keeps multiple anomalies ordered newest-first", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            emitAnomaly({ time: "2026-04-24T12:00:00.000Z", cell_id: 1 });
            emitAnomaly({ time: "2026-04-24T12:00:01.000Z", cell_id: 2 });
            emitAnomaly({ time: "2026-04-24T12:00:02.000Z", cell_id: 3 });
        });

        expect(result.current.active).toHaveLength(3);
        expect(result.current.active.map((a) => a.cell_id)).toEqual([3, 2, 1]);
        expect(result.current.latest?.cell_id).toBe(3);
    });

    it("dismissLatest() removes only the head entry", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            emitAnomaly({ time: "2026-04-24T12:00:00.000Z", cell_id: 1 });
            emitAnomaly({ time: "2026-04-24T12:00:01.000Z", cell_id: 2 });
        });

        act(() => {
            result.current.dismissLatest();
        });

        expect(result.current.active).toHaveLength(1);
        expect(result.current.active[0].cell_id).toBe(1);
        expect(result.current.latest?.cell_id).toBe(1);
    });

    it("caps active list at 20 entries (FIFO, drops oldest)", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            for (let i = 0; i < 21; i++) {
                emitAnomaly({
                    time: `2026-04-24T12:00:${String(i).padStart(2, "0")}.000Z`,
                    cell_id: i,
                });
            }
        });

        expect(result.current.active).toHaveLength(20);
        // Newest (cell_id=20) is head; oldest (cell_id=0) was dropped.
        expect(result.current.active[0].cell_id).toBe(20);
        expect(result.current.active.find((a) => a.cell_id === 0)).toBeUndefined();
        expect(result.current.active[19].cell_id).toBe(1);
    });

    it("ignores non-anomaly event types silently", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "sentinel",
                turn_id: "t1",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "sentinel",
                content: "...",
                turn_id: "t1",
            });
        });

        expect(result.current.active).toHaveLength(0);
        expect(result.current.count).toBe(0);
        expect(result.current.latest).toBeNull();
    });

    it("transitions connection status from connecting → open on socket open", () => {
        const { result } = renderHook(() => useAnomalyStream());
        expect(result.current.connectionStatus).toBe("connecting");

        act(() => {
            MockWebSocket.last.simulateOpen();
        });
        expect(result.current.connectionStatus).toBe("open");
    });

    it("deduplicates retried frames with the same (cell, signal_def, time) tuple", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            emitAnomaly({ time: "2026-04-24T12:00:00.000Z" });
            emitAnomaly({ time: "2026-04-24T12:00:00.000Z" });
        });

        expect(result.current.active).toHaveLength(1);
    });

    it("dismissAll() clears every active anomaly", () => {
        const { result } = renderHook(() => useAnomalyStream());
        act(() => {
            MockWebSocket.last.simulateOpen();
            emitAnomaly({ time: "2026-04-24T12:00:00.000Z", cell_id: 1 });
            emitAnomaly({ time: "2026-04-24T12:00:01.000Z", cell_id: 2 });
        });

        act(() => {
            result.current.dismissAll();
        });

        expect(result.current.active).toHaveLength(0);
        expect(result.current.latest).toBeNull();
    });
});
