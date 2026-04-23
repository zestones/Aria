/**
 * Unit tests for `useAnomalyStatusMap` — the M7.1b live status overlay hook.
 *
 * We mock `useAnomalyStream` directly (rather than driving the WS mock) so
 * each case narrates a single transformation: a fixed set of active anomalies
 * in, a `cell_id → status` map out. The mock-WS integration path is already
 * covered by `useAnomalyStream.test.ts`.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnomalyStatusMap } from "./useAnomalyStatusMap";
import type { AnomalyEvent } from "./useAnomalyStream";

const useAnomalyStreamMock = vi.hoisted(() => vi.fn());

vi.mock("./useAnomalyStream", () => ({
    useAnomalyStream: useAnomalyStreamMock,
}));

function anomaly(partial: Partial<AnomalyEvent> & { cell_id: number }): AnomalyEvent {
    return {
        cell_id: partial.cell_id,
        signal_def_id: partial.signal_def_id ?? 11,
        value: partial.value ?? 5,
        threshold: partial.threshold ?? 4,
        work_order_id: partial.work_order_id ?? 101,
        time: partial.time ?? "2026-04-24T12:00:00.000Z",
        severity: partial.severity ?? "alert",
        direction: partial.direction ?? "high",
        id:
            partial.id ??
            `${partial.cell_id}-${partial.signal_def_id ?? 11}-${partial.time ?? "t"}`,
        receivedAt: partial.receivedAt ?? 0,
    };
}

function mockStream(active: AnomalyEvent[]): void {
    useAnomalyStreamMock.mockReturnValue({
        active,
        latest: active[0] ?? null,
        count: active.length,
        dismissAll: vi.fn(),
        dismissLatest: vi.fn(),
        connectionStatus: "open" as const,
    });
}

beforeEach(() => {
    useAnomalyStreamMock.mockReset();
});

describe("useAnomalyStatusMap", () => {
    it("returns an empty map when no anomaly is active", () => {
        mockStream([]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.size).toBe(0);
    });

    it("maps a single alert anomaly to 'warning'", () => {
        mockStream([anomaly({ cell_id: 1, severity: "alert" })]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.get(1)).toBe("warning");
        expect(result.current.size).toBe(1);
    });

    it("maps a single trip anomaly to 'critical'", () => {
        mockStream([anomaly({ cell_id: 2, severity: "trip" })]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.get(2)).toBe("critical");
        expect(result.current.size).toBe(1);
    });

    it("lets trip win over alert when both target the same cell", () => {
        mockStream([
            anomaly({ cell_id: 1, severity: "alert", time: "2026-04-24T12:00:00.000Z" }),
            anomaly({ cell_id: 1, severity: "trip", time: "2026-04-24T12:00:01.000Z" }),
        ]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.get(1)).toBe("critical");
        expect(result.current.size).toBe(1);
    });

    it("keeps trip on a cell even if a later alert arrives for the same cell", () => {
        // Stream is newest-first; insertion order can vary, so assert the
        // outcome not the iteration path.
        mockStream([
            anomaly({ cell_id: 1, severity: "trip", time: "2026-04-24T12:00:00.000Z" }),
            anomaly({ cell_id: 1, severity: "alert", time: "2026-04-24T12:00:01.000Z" }),
        ]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.get(1)).toBe("critical");
    });

    it("handles multiple cells independently", () => {
        mockStream([
            anomaly({ cell_id: 1, severity: "alert" }),
            anomaly({ cell_id: 2, severity: "trip" }),
            anomaly({ cell_id: 3, severity: "alert" }),
        ]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        expect(result.current.get(1)).toBe("warning");
        expect(result.current.get(2)).toBe("critical");
        expect(result.current.get(3)).toBe("warning");
        expect(result.current.get(99)).toBeUndefined();
        expect(result.current.size).toBe(3);
    });

    it("never emits 'nominal' or 'unknown' — absence carries that meaning", () => {
        mockStream([
            anomaly({ cell_id: 1, severity: "alert" }),
            anomaly({ cell_id: 2, severity: "trip" }),
        ]);
        const { result } = renderHook(() => useAnomalyStatusMap());
        for (const value of result.current.values()) {
            expect(value === "warning" || value === "critical").toBe(true);
        }
    });

    it("is memoized across re-renders when the active array reference is stable", () => {
        const active = [anomaly({ cell_id: 1, severity: "alert" })];
        mockStream(active);
        const { result, rerender } = renderHook(() => useAnomalyStatusMap());
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it("recomputes the map when the active array reference changes", () => {
        mockStream([anomaly({ cell_id: 1, severity: "alert" })]);
        const { result, rerender } = renderHook(() => useAnomalyStatusMap());
        const first = result.current;

        mockStream([
            anomaly({ cell_id: 1, severity: "alert" }),
            anomaly({ cell_id: 2, severity: "trip" }),
        ]);
        rerender();

        expect(result.current).not.toBe(first);
        expect(result.current.get(2)).toBe("critical");
    });
});
