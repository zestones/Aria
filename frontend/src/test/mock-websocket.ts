/**
 * Mock WebSocket installed on the global scope during tests.
 *
 * Usage:
 *   installMockWebSocket() // beforeEach
 *   restoreWebSocket()     // afterEach
 *
 * Tests grab `MockWebSocket.last` after calling into the client to drive
 * lifecycle transitions manually (simulateOpen / simulateMessage /
 * simulateClose / simulateError).
 */

type Listener = (event: Event | MessageEvent | CloseEvent) => void;

export class MockWebSocket {
    static readonly CONNECTING = 0 as const;
    static readonly OPEN = 1 as const;
    static readonly CLOSING = 2 as const;
    static readonly CLOSED = 3 as const;

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
    listeners = new Map<string, Set<Listener>>();

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

    close(code = 1000, reason = ""): void {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.dispatch("close", {
            type: "close",
            code,
            reason,
            wasClean: code === 1000 || code === 1001,
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
            wasClean: code === 1000 || code === 1001,
        } as unknown as CloseEvent);
    }

    totalListenerCount(): number {
        let total = 0;
        for (const set of this.listeners.values()) total += set.size;
        return total;
    }

    private dispatch(type: string, event: Event | MessageEvent | CloseEvent): void {
        const set = this.listeners.get(type);
        if (!set) return;
        for (const listener of set) listener(event);
    }
}

let originalWebSocket: typeof WebSocket | undefined;

export function installMockWebSocket(): void {
    MockWebSocket.reset();
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
}

export function restoreWebSocket(): void {
    if (originalWebSocket) {
        (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    }
    MockWebSocket.reset();
}
