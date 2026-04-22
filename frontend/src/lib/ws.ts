/**
 * Typed WebSocket client with exponential-backoff reconnection.
 *
 * Two factories expose the same runtime with different type maps:
 * - `createEventBusClient<TMap>(url)`: server-driven event bus. `TMap` is a
 *   `{ eventName: Payload }` record for incoming messages.
 * - `createChatClient<TMap>(url)`: the same runtime, with a conventional
 *   ChatMap shape (`message`, `typing`, `presence`, ...) for consumer
 *   ergonomics.
 *
 * Wire protocol: `{ type: string, payload: unknown }` (JSON over text frames).
 *
 * Chose 2 factories rather than a discriminated-union overload so that
 * callers never have to narrow unions at each `.on(...)`: the map they pass
 * already constrains the keys. Same runtime, zero duplication.
 */

export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

export interface WsClient<TMap extends EventMap> {
    on<K extends keyof TMap & string>(event: K, handler: Handler<TMap[K]>): () => void;
    send<K extends keyof TMap & string>(event: K, payload: TMap[K]): void;
    close(code?: number, reason?: string): void;
    readonly readyState: number;
}

export interface WsClientOptions {
    /** Milliseconds before the first reconnect attempt. Default 500. */
    reconnectBaseDelayMs?: number;
    /** Cap on the exponential backoff delay. Default 15_000. */
    reconnectMaxDelayMs?: number;
    /** Jitter ratio in [0, 1]. Actual delay is `base * (1 +/- jitter*rand)`. Default 0.2. */
    reconnectJitter?: number;
    /** Max reconnect attempts; `Infinity` for unbounded. Default Infinity. */
    reconnectMaxAttempts?: number;
    /** Injected WebSocket constructor (tests pass a mock). */
    WebSocketImpl?: typeof WebSocket;
    /** Called after every connection failure (reporting / logging hook). */
    onError?: (error: Event | Error) => void;
    /** Called when the socket transitions to OPEN (including after reconnects). */
    onOpen?: () => void;
    /** Called when the socket closes (before a reconnect is scheduled). */
    onClose?: (event: CloseEvent) => void;
}

interface InternalState<TMap extends EventMap> {
    socket: WebSocket | null;
    url: string;
    handlers: Map<keyof TMap & string, Set<Handler<unknown>>>;
    closedByUser: boolean;
    reconnectAttempts: number;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    queued: Array<{ type: string; payload: unknown }>;
    opts: Required<Omit<WsClientOptions, "onError" | "onOpen" | "onClose">> &
        Pick<WsClientOptions, "onError" | "onOpen" | "onClose">;
}

function computeBackoff(attempt: number, base: number, cap: number, jitter: number): number {
    const raw = Math.min(cap, base * 2 ** attempt);
    if (jitter <= 0) return raw;
    const delta = raw * jitter * (Math.random() * 2 - 1);
    return Math.max(0, raw + delta);
}

function dispatch<TMap extends EventMap>(state: InternalState<TMap>, raw: string): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        state.opts.onError?.(err as Error);
        return;
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as { type?: unknown }).type !== "string"
    ) {
        state.opts.onError?.(new Error("Malformed WS message (missing `type`)"));
        return;
    }
    const { type, payload } = parsed as { type: string; payload: unknown };
    const set = state.handlers.get(type);
    if (!set) return;
    for (const h of set) h(payload);
}

function connect<TMap extends EventMap>(state: InternalState<TMap>): void {
    const Impl = state.opts.WebSocketImpl;
    const socket = new Impl(state.url);
    state.socket = socket;

    socket.addEventListener("open", () => {
        state.reconnectAttempts = 0;
        for (const frame of state.queued) socket.send(JSON.stringify(frame));
        state.queued.length = 0;
        state.opts.onOpen?.();
    });

    socket.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data === "string") dispatch(state, event.data);
    });

    socket.addEventListener("error", (event: Event) => {
        state.opts.onError?.(event);
    });

    socket.addEventListener("close", (event: CloseEvent) => {
        state.opts.onClose?.(event);
        state.socket = null;
        if (state.closedByUser) return;
        if (state.reconnectAttempts >= state.opts.reconnectMaxAttempts) return;
        const delay = computeBackoff(
            state.reconnectAttempts,
            state.opts.reconnectBaseDelayMs,
            state.opts.reconnectMaxDelayMs,
            state.opts.reconnectJitter,
        );
        state.reconnectAttempts += 1;
        state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = null;
            if (!state.closedByUser) connect(state);
        }, delay);
    });
}

export function createWsClient<TMap extends EventMap>(
    url: string,
    options: WsClientOptions = {},
): WsClient<TMap> {
    const state: InternalState<TMap> = {
        socket: null,
        url,
        handlers: new Map(),
        closedByUser: false,
        reconnectAttempts: 0,
        reconnectTimer: null,
        queued: [],
        opts: {
            reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 500,
            reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 15_000,
            reconnectJitter: options.reconnectJitter ?? 0.2,
            reconnectMaxAttempts: options.reconnectMaxAttempts ?? Number.POSITIVE_INFINITY,
            WebSocketImpl: options.WebSocketImpl ?? WebSocket,
            onError: options.onError,
            onOpen: options.onOpen,
            onClose: options.onClose,
        },
    };

    connect(state);

    return {
        on(event, handler) {
            let set = state.handlers.get(event);
            if (!set) {
                set = new Set();
                state.handlers.set(event, set);
            }
            const wrapped = handler as Handler<unknown>;
            set.add(wrapped);
            return () => {
                set?.delete(wrapped);
                if (set && set.size === 0) state.handlers.delete(event);
            };
        },
        send(event, payload) {
            const frame = { type: event, payload };
            if (state.socket && state.socket.readyState === 1) {
                state.socket.send(JSON.stringify(frame));
            } else {
                state.queued.push(frame);
            }
        },
        close(code, reason) {
            state.closedByUser = true;
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
            state.socket?.close(code, reason);
            state.handlers.clear();
            state.queued.length = 0;
        },
        get readyState() {
            return state.socket?.readyState ?? 3;
        },
    };
}

// --- EventBus -------------------------------------------------------------

/** Shape for server-driven event-bus clients. Consumers extend this. */
export type EventBusMap = EventMap;

export function createEventBusClient<TMap extends EventBusMap>(
    url: string,
    options?: WsClientOptions,
): WsClient<TMap> {
    return createWsClient<TMap>(url, options);
}

// --- Chat -----------------------------------------------------------------

export interface ChatMessage {
    id: string;
    threadId: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
}

export interface ChatTyping {
    threadId: string;
    userId: string;
    isTyping: boolean;
}

export interface ChatPresence {
    userId: string;
    status: "online" | "offline";
}

export interface ChatMap extends EventMap {
    message: ChatMessage;
    typing: ChatTyping;
    presence: ChatPresence;
}

export function createChatClient(url: string, options?: WsClientOptions): WsClient<ChatMap> {
    return createWsClient<ChatMap>(url, options);
}
