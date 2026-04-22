/**
 * Lightweight WebSocket mock used by ws.test.ts.
 *
 * Tests grab the most recent instance via `MockWebSocket.last` and trigger
 * lifecycle transitions manually (simulateOpen / simulateMessage /
 * simulateClose) so reconnection logic can be driven deterministically with
 * vi.useFakeTimers().
 */

type Listener = (event: Event | MessageEvent | CloseEvent) => void;

export class MockWebSocket {
    static CONNECTING = 0 as const;
    static OPEN = 1 as const;
    static CLOSING = 2 as const;
    static CLOSED = 3 as const;

    static instances: MockWebSocket[] = [];
    static get last(): MockWebSocket {
        const inst = MockWebSocket.instances.at(-1);
        if (!inst) throw new Error("No MockWebSocket instance created yet");
        return inst;
    }
    static reset(): void {
        MockWebSocket.instances = [];
    }

    readonly url: string;
    readyState: number = MockWebSocket.CONNECTING;
    sent: string[] = [];
    private listeners = new Map<string, Set<Listener>>();

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
    }

    send(data: string): void {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error("MockWebSocket: send() while not OPEN");
        }
        this.sent.push(data);
    }

    close(code?: number, reason?: string): void {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch("close", {
            type: "close",
            code: code ?? 1000,
            reason: reason ?? "",
            wasClean: true,
        } as unknown as CloseEvent);
    }

    simulateOpen(): void {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch("open", { type: "open" } as Event);
    }

    simulateMessage(data: unknown): void {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        this.dispatch("message", { type: "message", data: payload } as MessageEvent);
    }

    simulateError(): void {
        this.dispatch("error", { type: "error" } as Event);
    }

    simulateClose(code = 1006, reason = "abnormal"): void {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch("close", {
            type: "close",
            code,
            reason,
            wasClean: false,
        } as unknown as CloseEvent);
    }

    private dispatch(type: string, event: Event | MessageEvent | CloseEvent): void {
        const set = this.listeners.get(type);
        if (!set) return;
        for (const listener of set) listener(event);
    }
}
