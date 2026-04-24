import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockWebSocket, MockWebSocket, restoreWebSocket } from "../../test/mock-websocket";
import type { WorkOrder } from "./types";
import { useWorkOrdersStream } from "./useWorkOrdersStream";

function makeClient(): QueryClient {
    return new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
}

function wrap(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

function workOrderFixture(overrides: Partial<WorkOrder> = {}): WorkOrder {
    return {
        id: 42,
        cell_id: 2,
        cell_name: "Cell-02",
        title: "Vibration spike",
        priority: "high",
        status: "detected",
        generated_by_agent: true,
        created_at: "2026-04-24T12:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    installMockWebSocket();
});

afterEach(() => {
    restoreWebSocket();
});

describe("useWorkOrdersStream", () => {
    it("invalidates list + detail queries on work_order_ready", async () => {
        const client = makeClient();
        const invalidate = vi.spyOn(client, "invalidateQueries");

        renderHook(() => useWorkOrdersStream(), { wrapper: wrap(client) });

        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "work_order_ready",
                work_order_id: 99,
            });
        });

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["work-orders"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["work-order", 99] });
    });

    it("flips rca_summary optimistically and invalidates on rca_ready", async () => {
        const client = makeClient();
        client.setQueryData<WorkOrder[]>(
            ["work-orders"],
            [
                workOrderFixture({ id: 42, rca_summary: null }),
                workOrderFixture({ id: 43, rca_summary: null }),
            ],
        );
        const invalidate = vi.spyOn(client, "invalidateQueries");

        renderHook(() => useWorkOrdersStream(), { wrapper: wrap(client) });

        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "rca_ready",
                work_order_id: 42,
                rca_summary: "Root cause: bearing wear",
                confidence: 0.87,
                turn_id: "turn-1",
            });
        });

        const rows = client.getQueryData<WorkOrder[]>(["work-orders"]);
        expect(rows).toBeTruthy();
        const target = rows?.find((r) => r.id === 42);
        expect(target?.rca_summary).toBe("Root cause: bearing wear");
        const untouched = rows?.find((r) => r.id === 43);
        expect(untouched?.rca_summary).toBeNull();

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["work-orders"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["work-order", 42] });
    });

    it("ignores unrelated events on the bus", () => {
        const client = makeClient();
        const invalidate = vi.spyOn(client, "invalidateQueries");

        renderHook(() => useWorkOrdersStream(), { wrapper: wrap(client) });

        act(() => {
            MockWebSocket.last.simulateOpen();
            MockWebSocket.last.simulateMessage({
                type: "agent_start",
                agent: "sentinel",
                turn_id: "turn-x",
            });
            MockWebSocket.last.simulateMessage({
                type: "thinking_delta",
                agent: "investigator",
                content: "nope",
                turn_id: "turn-x",
            });
        });

        expect(invalidate).not.toHaveBeenCalled();
    });
});
