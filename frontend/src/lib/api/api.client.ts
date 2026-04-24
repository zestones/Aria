/**
 * Thin fetch wrapper for the ARIA backend.
 *
 * - Prepends `/api/v1` (Vite dev proxy forwards to backend:8000).
 * - Sends JSON with httpOnly cookies (`credentials: "include"`).
 * - On 401 silently calls `/auth/refresh` then retries once.
 * - Unwraps the `{status, message, data}` envelope and returns `data` as `T`.
 */

const PREFIX = "/api/v1";

export class ApiError extends Error {
    status: number;
    details?: unknown;
    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

let refreshPromise: Promise<boolean> | null = null;

function refreshToken(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetch(`${PREFIX}/auth/refresh`, {
        method: "POST",
        credentials: "include",
    })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
}

interface FetchOptions {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    params?: Record<string, unknown>;
}

function buildQuery(params?: Record<string, unknown>): string {
    if (!params) return "";
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
            for (const item of v) usp.append(k, String(item));
        } else usp.append(k, String(v));
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : "";
}

async function doFetch(url: string, opts: FetchOptions): Promise<Response> {
    const init: RequestInit = {
        method: opts.method ?? "GET",
        credentials: "include",
        signal: opts.signal,
        headers: { "Content-Type": "application/json" },
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    const fullUrl = `${PREFIX}${url}${buildQuery(opts.params)}`;
    let res = await fetch(fullUrl, init);

    if (res.status === 401 && !url.startsWith("/auth/")) {
        const ok = await refreshToken();
        if (ok) res = await fetch(fullUrl, init);
    }

    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem("user");
            if (window.location.pathname !== "/") window.location.href = "/";
        }
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const msg =
            typeof body.message === "string" ? body.message : `Request failed (${res.status})`;
        throw new ApiError(res.status, msg, body.data);
    }

    return res;
}

export async function apiFetch<T>(url: string, opts: FetchOptions = {}): Promise<T> {
    const res = await doFetch(url, opts);
    if (res.status === 204) return null as T;
    const json = (await res.json()) as { data: T };
    return json.data;
}
