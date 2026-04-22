/**
 * Typed WebSocket client for the ARIA backend.
 *
 * Two factories share the same runtime:
 * - `createWsClient<M>({ url, onEvent, ... })`: keyed event bus for
 *   `/api/v1/events` (EventBusMap-style). `onEvent` receives the event
 *   `type` as its first argument and the typed payload as its second.
 * - `createChatWsClient<U>({ url, onEvent, ... })`: discriminated-union
 *   stream for `/api/v1/agent/chat` (ChatMap-style). `onEvent` receives
 *   the full message object (whose `type` field discriminates the union).
 *
 * Auth is cookie-based (see M5.2) — no token handling here. Reconnect
 * backoff: 500ms, 1500ms, 4500ms (x3 multiplier), cap 3 attempts, counter
 * resets after 30s of stable OPEN connection. No retry on clean close
 * (1000) or going-away (1001). Honors an external `AbortSignal`.
 *
 * Chose a second factory `createChatWsClient` over a typed overload so
 * the union-discriminated ChatMap can stay as-is without needing an
 * index signature. Zero runtime duplication — both delegate to one
 * shared implementation.
 */

const RECONNECT_DELAYS_MS = [500, 1500, 4500] as const;
const STABLE_RESET_MS = 30_000;
const NO_RETRY_CODES = new Set([1000, 1001]);

export interface WsClientOptions<M extends Record<string, unknown>> {
    /** Absolute (`ws://` / `wss://`) or relative path (`/api/v1/events`). */
    url: string;
    /** Invoked for every well-formed message. */
    onEvent: <K extends keyof M>(type: K, payload: M[K]) => void;
    /** Invoked on parse errors or when reconnect attempts are exhausted. */
    onError?: (err: Error) => void;
    /** Invoked every time the socket reaches OPEN (including after reconnects). */
    onOpen?: () => void;
    /** Invoked when the socket closes (before reconnect is scheduled). */
    onClose?: (code: number, reason: string, wasClean: boolean) => void;
    /** External abort: when it fires, the client closes and stops reconnecting. */
    signal?: AbortSignal;
}

export interface ChatWsClientOptions<U extends { type: string }> {
    url: string;
    /** Invoked with the full discriminated-union message. */
    onEvent: (type: U["type"], message: U) => void;
    onError?: (err: Error) => void;
    onOpen?: () => void;
    onClose?: (code: number, reason: string, wasClean: boolean) => void;
    signal?: AbortSignal;
}

export interface WsClient {
    close(code?: number, reason?: string): void;
    readonly readyState: number;
}

interface InternalOptions {
    url: string;
    dispatch: (raw: string) => void;
    onError?: (err: Error) => void;
    onOpen?: () => void;
    onClose?: (code: number, reason: string, wasClean: boolean) => void;
    signal?: AbortSignal;
}

function resolveUrl(url: string): string {
    if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
    if (typeof document === "undefined" || !document.location) return url;
    const scheme = document.location.protocol === "https:" ? "wss:" : "ws:";
    const host = document.location.host;
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${scheme}//${host}${path}`;
}

function createInternal(opts: InternalOptions): WsClient {
    const resolved = resolveUrl(opts.url);
    let socket: WebSocket | null = null;
    let aborted = false;
    let failedAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    const disposers: Array<() => void> = [];

    const clearTimers = () => {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (stableTimer !== null) {
            clearTimeout(stableTimer);
            stableTimer = null;
        }
    };

    const detach = () => {
        for (const dispose of disposers) dispose();
        disposers.length = 0;
    };

    const scheduleReconnect = () => {
        if (aborted) return;
        if (failedAttempts >= RECONNECT_DELAYS_MS.length) {
            opts.onError?.(new Error("Max reconnect attempts reached"));
            return;
        }
        const delay = RECONNECT_DELAYS_MS[failedAttempts];
        failedAttempts += 1;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (!aborted) connect();
        }, delay);
    };

    const connect = () => {
        const ws = new WebSocket(resolved);
        socket = ws;

        const handleOpen = () => {
            stableTimer = setTimeout(() => {
                failedAttempts = 0;
                stableTimer = null;
            }, STABLE_RESET_MS);
            opts.onOpen?.();
        };

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.data !== "string") {
                opts.onError?.(new Error("WS: non-string frame received"));
                return;
            }
            opts.dispatch(event.data);
        };

        const handleError = () => {
            opts.onError?.(new Error("WS: socket error"));
        };

        const handleClose = (event: CloseEvent) => {
            detach();
            socket = null;
            if (stableTimer !== null) {
                clearTimeout(stableTimer);
                stableTimer = null;
            }
            opts.onClose?.(event.code, event.reason, event.wasClean);
            if (aborted) return;
            if (NO_RETRY_CODES.has(event.code)) return;
            scheduleReconnect();
        };

        ws.addEventListener("open", handleOpen);
        ws.addEventListener("message", handleMessage);
        ws.addEventListener("error", handleError);
        ws.addEventListener("close", handleClose);
        disposers.push(
            () => ws.removeEventListener("open", handleOpen),
            () => ws.removeEventListener("message", handleMessage),
            () => ws.removeEventListener("error", handleError),
            () => ws.removeEventListener("close", handleClose),
        );
    };

    const close = (code?: number, reason?: string) => {
        aborted = true;
        clearTimers();
        const current = socket;
        if (current) {
            detach();
            socket = null;
            if (
                current.readyState === WebSocket.CONNECTING ||
                current.readyState === WebSocket.OPEN
            ) {
                current.close(code, reason);
            }
        }
    };

    if (opts.signal) {
        if (opts.signal.aborted) {
            aborted = true;
        } else {
            const onAbort = () => close(1000, "aborted");
            opts.signal.addEventListener("abort", onAbort, { once: true });
        }
    }

    if (!aborted) connect();

    return {
        close,
        get readyState() {
            return socket?.readyState ?? WebSocket.CLOSED;
        },
    };
}

function dispatchKeyed<M extends Record<string, unknown>>(
    raw: string,
    onEvent: <K extends keyof M>(type: K, payload: M[K]) => void,
    onError?: (err: Error) => void,
): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        return;
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as { type?: unknown }).type !== "string"
    ) {
        onError?.(new Error("WS: malformed message (missing `type`)"));
        return;
    }
    const { type, payload } = parsed as { type: string; payload: unknown };
    onEvent(type as keyof M, payload as M[keyof M]);
}

function dispatchUnion<U extends { type: string }>(
    raw: string,
    onEvent: (type: U["type"], message: U) => void,
    onError?: (err: Error) => void,
): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        return;
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as { type?: unknown }).type !== "string"
    ) {
        onError?.(new Error("WS: malformed message (missing `type`)"));
        return;
    }
    const message = parsed as U;
    onEvent(message.type, message);
}

/**
 * Create a typed WebSocket client for a keyed event bus (EventBusMap shape).
 * Wire format: each frame is `{ type: string, payload: <typed> }`.
 */
export function createWsClient<M extends Record<string, unknown>>(
    options: WsClientOptions<M>,
): WsClient {
    return createInternal({
        url: options.url,
        dispatch: (raw) => dispatchKeyed<M>(raw, options.onEvent, options.onError),
        onError: options.onError,
        onOpen: options.onOpen,
        onClose: options.onClose,
        signal: options.signal,
    });
}

/**
 * Create a typed WebSocket client for a discriminated-union stream (ChatMap shape).
 * Wire format: each frame is the serialized union member itself (with `type` field).
 */
export function createChatWsClient<U extends { type: string }>(
    options: ChatWsClientOptions<U>,
): WsClient {
    return createInternal({
        url: options.url,
        dispatch: (raw) => dispatchUnion<U>(raw, options.onEvent, options.onError),
        onError: options.onError,
        onOpen: options.onOpen,
        onClose: options.onClose,
        signal: options.signal,
    });
}

export type { ChatMap, EventBusMap } from "./ws.types";
