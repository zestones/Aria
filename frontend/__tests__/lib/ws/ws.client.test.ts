import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockWebSocket, MockWebSocket, restoreWebSocket } from "../../mock-websocket";
import { createChatWsClient, createWsClient } from "@/lib/ws/ws.client";
import type { ChatMap, EventBusMap } from "@/lib/ws/ws.types";

beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    restoreWebSocket();
});

describe("createWsClient (EventBusMap)", () => {
    it("parses fixture multi-event and dispatches typed events", () => {
        const onEvent = vi.fn();
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({
            type: "agent_start",
            agent: "planner",
            turn_id: "t1",
        });
        MockWebSocket.last.simulateMessage({
            type: "thinking_delta",
            agent: "planner",
            content: "analysing",
            turn_id: "t1",
        });
        MockWebSocket.last.simulateMessage({
            type: "work_order_ready",
            work_order_id: 42,
        });

        expect(onEvent).toHaveBeenCalledTimes(3);
        expect(onEvent).toHaveBeenNthCalledWith(1, "agent_start", {
            agent: "planner",
            turn_id: "t1",
        });
        expect(onEvent).toHaveBeenNthCalledWith(2, "thinking_delta", {
            agent: "planner",
            content: "analysing",
            turn_id: "t1",
        });
        expect(onEvent).toHaveBeenNthCalledWith(3, "work_order_ready", {
            work_order_id: 42,
        });
    });

    it("parses flat-payload frames (backend spread at root, not nested)", () => {
        const onEvent = vi.fn();
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({
            type: "anomaly_detected",
            cell_id: 1,
            signal_def_id: 4,
            value: 11.9,
            threshold: 6.5,
            work_order_id: 20,
            time: "2026-04-23T22:34:08.295000+00:00",
            severity: "alert",
            direction: "high",
        });

        expect(onEvent).toHaveBeenCalledWith("anomaly_detected", {
            cell_id: 1,
            signal_def_id: 4,
            value: 11.9,
            threshold: 6.5,
            work_order_id: 20,
            time: "2026-04-23T22:34:08.295000+00:00",
            severity: "alert",
            direction: "high",
        });
    });

    it("reconnects with exponential backoff after unexpected close (1006)", () => {
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
        });
        MockWebSocket.last.simulateOpen();
        expect(MockWebSocket.instances).toHaveLength(1);

        MockWebSocket.last.simulateClose(1006, "abnormal");

        // Attempt #1: 500ms
        vi.advanceTimersByTime(499);
        expect(MockWebSocket.instances).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(2);

        // Attempt #2: 1500ms
        MockWebSocket.last.simulateClose(1006, "abnormal");
        vi.advanceTimersByTime(1499);
        expect(MockWebSocket.instances).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(3);
    });

    it("cleans up listeners after close()", () => {
        const client = createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
        });
        MockWebSocket.last.simulateOpen();
        const mock = MockWebSocket.last;
        expect(mock.totalListenerCount()).toBeGreaterThan(0);

        client.close();

        expect(mock.totalListenerCount()).toBe(0);
        expect(mock.readyState).toBe(MockWebSocket.CLOSED);
    });

    it("calls onError with 'Max reconnect attempts' after 3 failed retries", () => {
        const onError = vi.fn();
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
            onError,
        });

        // Attempt #1: initial close → retry after 500ms
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(500);
        expect(MockWebSocket.instances).toHaveLength(2);

        // Attempt #2: close again → retry after 1500ms
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(1500);
        expect(MockWebSocket.instances).toHaveLength(3);

        // Attempt #3: close again → retry after 4500ms
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(4500);
        expect(MockWebSocket.instances).toHaveLength(4);

        // 4th close → max reached, no new instance, onError fires
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(10_000);
        expect(MockWebSocket.instances).toHaveLength(4);
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Max reconnect attempts reached" }),
        );
    });

    it("does not reconnect on clean close (code 1000)", () => {
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateClose(1000, "normal");
        vi.advanceTimersByTime(10_000);

        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("resets retry counter after 30s of stable OPEN connection", () => {
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
        });

        // Burn two failed attempts quickly
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(500);
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(1500);
        expect(MockWebSocket.instances).toHaveLength(3);

        // Open stable for 30s+ → counter resets
        MockWebSocket.last.simulateOpen();
        vi.advanceTimersByTime(30_001);

        // Close again → should retry with attempt #1 delay (500ms), not #3 (4500ms)
        MockWebSocket.last.simulateClose(1006);
        vi.advanceTimersByTime(499);
        expect(MockWebSocket.instances).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(4);
    });

    it("calls onError on invalid JSON without crashing", () => {
        const onError = vi.fn();
        const onEvent = vi.fn();
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent,
            onError,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage("{not json");
        MockWebSocket.last.simulateMessage({ no_type_field: true });

        expect(onError).toHaveBeenCalledTimes(2);
        expect(onEvent).not.toHaveBeenCalled();
    });

    it("honors external AbortSignal — closes socket and stops reconnect", () => {
        const controller = new AbortController();
        createWsClient<EventBusMap>({
            url: "ws://localhost/api/v1/events",
            onEvent: vi.fn(),
            signal: controller.signal,
        });
        MockWebSocket.last.simulateOpen();

        controller.abort();

        expect(MockWebSocket.last.readyState).toBe(MockWebSocket.CLOSED);
        vi.advanceTimersByTime(10_000);
        expect(MockWebSocket.instances).toHaveLength(1);
    });
});

describe("createChatWsClient (ChatMap)", () => {
    it("dispatches discriminated-union messages with full object", () => {
        const onEvent = vi.fn();
        createChatWsClient<ChatMap>({
            url: "ws://localhost/api/v1/agent/chat",
            onEvent,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({ type: "text_delta", content: "Hel" });
        MockWebSocket.last.simulateMessage({
            type: "tool_call",
            name: "query_db",
            args: { sql: "SELECT 1" },
        });
        MockWebSocket.last.simulateMessage({ type: "done" });

        expect(onEvent).toHaveBeenNthCalledWith(1, "text_delta", {
            type: "text_delta",
            content: "Hel",
        });
        expect(onEvent).toHaveBeenNthCalledWith(2, "tool_call", {
            type: "tool_call",
            name: "query_db",
            args: { sql: "SELECT 1" },
        });
        expect(onEvent).toHaveBeenNthCalledWith(3, "done", { type: "done" });
    });
    it("sends JSON-serialized message over the socket after OPEN", () => {
        const client = createChatWsClient<ChatMap>({
            url: "ws://localhost/api/v1/agent/chat",
            onEvent: vi.fn(),
        });
        MockWebSocket.last.simulateOpen();

        client.send({ type: "user", content: "hello" });

        expect(MockWebSocket.last.sent).toEqual([
            JSON.stringify({ type: "user", content: "hello" }),
        ]);
    });

    it("calls onError when send() is invoked before OPEN", () => {
        const onError = vi.fn();
        const client = createChatWsClient<ChatMap>({
            url: "ws://localhost/api/v1/agent/chat",
            onEvent: vi.fn(),
            onError,
        });
        // Still CONNECTING — no simulateOpen yet.

        client.send({ type: "user", content: "too early" });

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("not OPEN") }),
        );
        expect(MockWebSocket.last.sent).toEqual([]);
    });

    it("no-ops silently when send() is called after close()", () => {
        const onError = vi.fn();
        const client = createChatWsClient<ChatMap>({
            url: "ws://localhost/api/v1/agent/chat",
            onEvent: vi.fn(),
            onError,
        });
        MockWebSocket.last.simulateOpen();

        client.close();

        expect(() => {
            client.send({ type: "user", content: "post-close" });
        }).not.toThrow();
        expect(onError).not.toHaveBeenCalled();
    });

    it("does not reconnect on close code 4401 (auth invalid)", () => {
        const onClose = vi.fn();
        const onError = vi.fn();
        createChatWsClient<ChatMap>({
            url: "ws://localhost/api/v1/agent/chat",
            onEvent: vi.fn(),
            onClose,
            onError,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateClose(4401, "cookie invalid");
        vi.advanceTimersByTime(10_000);

        expect(MockWebSocket.instances).toHaveLength(1);
        expect(onClose).toHaveBeenCalledWith(4401, "cookie invalid", false);
        expect(onError).not.toHaveBeenCalled();
    });
});
