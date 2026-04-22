import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockWebSocket } from "../test/mock-websocket";
import { type ChatMap, createChatClient, createEventBusClient, createWsClient } from "./ws";

type BusMap = {
    "machine.status": { id: string; state: "up" | "down" };
    "alarm.raised": { code: number; message: string };
};

beforeEach(() => {
    MockWebSocket.reset();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("createWsClient", () => {
    it("dispatches incoming messages to the right typed handler", () => {
        const client = createEventBusClient<BusMap>("ws://localhost/test", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });

        const statusHandler = vi.fn();
        const alarmHandler = vi.fn();
        client.on("machine.status", statusHandler);
        client.on("alarm.raised", alarmHandler);

        MockWebSocket.last.simulateOpen();
        MockWebSocket.last.simulateMessage({
            type: "machine.status",
            payload: { id: "M1", state: "up" },
        });

        expect(statusHandler).toHaveBeenCalledExactlyOnceWith({ id: "M1", state: "up" });
        expect(alarmHandler).not.toHaveBeenCalled();
    });

    it("ignores messages whose `type` has no subscriber", () => {
        const client = createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });
        const onError = vi.fn();
        client.on("machine.status", vi.fn());
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({ type: "unknown.event", payload: {} });

        expect(onError).not.toHaveBeenCalled();
    });

    it("reports malformed frames through onError", () => {
        const onError = vi.fn();
        createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
            onError,
        });
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage("not-json");
        MockWebSocket.last.simulateMessage({ no_type: true });

        expect(onError).toHaveBeenCalledTimes(2);
    });

    it("queues send() before OPEN and flushes on open", () => {
        const client = createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });

        client.send("machine.status", { id: "M1", state: "down" });
        expect(MockWebSocket.last.sent).toHaveLength(0);

        MockWebSocket.last.simulateOpen();

        expect(MockWebSocket.last.sent).toEqual([
            JSON.stringify({ type: "machine.status", payload: { id: "M1", state: "down" } }),
        ]);
    });

    it("unsubscribes handlers cleanly", () => {
        const client = createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });
        const handler = vi.fn();
        const unsubscribe = client.on("machine.status", handler);
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({
            type: "machine.status",
            payload: { id: "a", state: "up" },
        });
        unsubscribe();
        MockWebSocket.last.simulateMessage({
            type: "machine.status",
            payload: { id: "b", state: "up" },
        });

        expect(handler).toHaveBeenCalledExactlyOnceWith({ id: "a", state: "up" });
    });

    it("reconnects with exponential backoff after abnormal close", () => {
        const onOpen = vi.fn();
        createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
            reconnectBaseDelayMs: 100,
            reconnectMaxDelayMs: 10_000,
            reconnectJitter: 0,
            onOpen,
        });

        MockWebSocket.last.simulateOpen();
        expect(onOpen).toHaveBeenCalledTimes(1);

        MockWebSocket.last.simulateClose();
        expect(MockWebSocket.instances).toHaveLength(1);

        // 1st reconnect after base * 2^0 = 100ms
        vi.advanceTimersByTime(100);
        expect(MockWebSocket.instances).toHaveLength(2);

        // Fail again before it opens, next delay is base * 2^1 = 200ms
        MockWebSocket.last.simulateClose();
        vi.advanceTimersByTime(199);
        expect(MockWebSocket.instances).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(3);

        MockWebSocket.last.simulateOpen();
        expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it("stops reconnecting after close() is called by the user", () => {
        const client = createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
            reconnectBaseDelayMs: 50,
            reconnectJitter: 0,
        });
        MockWebSocket.last.simulateOpen();

        client.close();
        expect(MockWebSocket.last.readyState).toBe(MockWebSocket.CLOSED);

        vi.advanceTimersByTime(10_000);
        expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("caps reconnect attempts when reconnectMaxAttempts is set", () => {
        createEventBusClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
            reconnectBaseDelayMs: 10,
            reconnectJitter: 0,
            reconnectMaxAttempts: 2,
        });

        MockWebSocket.last.simulateClose();
        vi.advanceTimersByTime(10);
        expect(MockWebSocket.instances).toHaveLength(2);

        MockWebSocket.last.simulateClose();
        vi.advanceTimersByTime(20);
        expect(MockWebSocket.instances).toHaveLength(3);

        MockWebSocket.last.simulateClose();
        vi.advanceTimersByTime(10_000);
        expect(MockWebSocket.instances).toHaveLength(3);
    });
});

describe("createChatClient", () => {
    it("routes typed chat events", () => {
        const client = createChatClient("ws://chat", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });
        const onMessage = vi.fn<(m: ChatMap["message"]) => void>();
        client.on("message", onMessage);
        MockWebSocket.last.simulateOpen();

        MockWebSocket.last.simulateMessage({
            type: "message",
            payload: {
                id: "1",
                threadId: "t1",
                role: "assistant",
                content: "hello",
                createdAt: "2026-04-22T10:00:00Z",
            },
        });

        expect(onMessage).toHaveBeenCalledExactlyOnceWith({
            id: "1",
            threadId: "t1",
            role: "assistant",
            content: "hello",
            createdAt: "2026-04-22T10:00:00Z",
        });
    });
});

describe("createWsClient (generic)", () => {
    it("exposes readyState reflecting the underlying socket", () => {
        const client = createWsClient<BusMap>("ws://x", {
            WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        });
        expect(client.readyState).toBe(MockWebSocket.CONNECTING);
        MockWebSocket.last.simulateOpen();
        expect(client.readyState).toBe(MockWebSocket.OPEN);
        client.close();
        expect(client.readyState).toBe(MockWebSocket.CLOSED);
    });
});
