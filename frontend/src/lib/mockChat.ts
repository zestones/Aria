/**
 * Mock chat transport — isomorphic to `createChatWsClient` (M6.4).
 *
 * Same signature shape (`url`, `onEvent`, `onOpen`, `onClose`, `onError`,
 * `signal`) and same `WsClient` return type so swapping to the real
 * `createChatWsClient` in M7.4 is a one-line change at the call site.
 *
 * Exposes `sendMock(prompt)` on the returned handle for the chat store to
 * drive simulated agent turns. The real WS client will receive prompts
 * via its own `send()` path — same handle shape so the store code is
 * reused as-is.
 */

import type { WsClient } from "./ws";
import type { ChatMap } from "./ws.types";

export interface MockChatClientOptions {
    url: string;
    onEvent: (type: ChatMap["type"], message: ChatMap) => void;
    onError?: (err: Error) => void;
    onOpen?: () => void;
    onClose?: (code: number, reason: string, wasClean: boolean) => void;
    signal?: AbortSignal;
}

export interface MockChatHandle extends WsClient {
    /** Simulate the user sending a prompt over the wire. */
    sendMock(prompt: string): void;
}

interface Scenario {
    delayMs: number;
    event: ChatMap;
}

const STATIC_OPEN_DELAY_MS = 30;

function buildScenario(prompt: string): Scenario[] {
    const lower = prompt.toLowerCase();

    if (lower.includes("table") || lower.includes("wo") || lower.includes("work order")) {
        return buildTableScenario();
    }
    if (lower.includes("code") || lower.includes("sql") || lower.includes("query")) {
        return buildCodeScenario();
    }
    if (lower.includes("tool") || lower.includes("query_kb") || lower.includes("search")) {
        return buildToolCallScenario(prompt);
    }
    if (lower.includes("handoff") || lower.includes("investigator")) {
        return buildHandoffScenario();
    }
    return buildDefaultScenario(prompt);
}

function tokenize(text: string): string[] {
    return text.match(/\s+|\S+/g) ?? [text];
}

function streamText(content: string, startAt: number, perTokenMs = 22): Scenario[] {
    const tokens = tokenize(content);
    let t = startAt;
    return tokens.map((tok) => {
        t += perTokenMs;
        return { delayMs: t, event: { type: "text_delta", content: tok } };
    });
}

function buildDefaultScenario(prompt: string): Scenario[] {
    const opener = `Got it — you asked about "${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}".\n\n`;
    const body =
        "Here's what I can tell you from current telemetry:\n\n" +
        "- **Cell 02.01** is nominal with a 4.3 % margin on `flow_rate`.\n" +
        "- Sentinel flagged one anomaly in the last hour, auto-resolved.\n" +
        "- No open work orders require attention.\n\n" +
        "Ask me to drill into any of these, or say *show WO table* for a structured view.";
    const stream: Scenario[] = [];
    let cursor = STATIC_OPEN_DELAY_MS;
    for (const block of [opener, body]) {
        const chunk = streamText(block, cursor);
        stream.push(...chunk);
        cursor = chunk[chunk.length - 1]?.delayMs ?? cursor;
    }
    stream.push({ delayMs: cursor + 200, event: { type: "done" } });
    return stream;
}

function buildTableScenario(): Scenario[] {
    const intro = "Pulling the latest work orders from the knowledge base.\n\n";
    const table =
        "| WO | Cell | Status | Priority | Opened |\n" +
        "| --- | --- | --- | --- | --- |\n" +
        "| WO-0142 | 02.01 | In progress | High | 2 h ago |\n" +
        "| WO-0141 | 02.03 | Awaiting QA | Medium | 5 h ago |\n" +
        "| WO-0139 | 01.04 | Closed | Low | Yesterday |\n\n" +
        "Tell me which one to open for a full RCA.";

    const stream: Scenario[] = [];
    let cursor = STATIC_OPEN_DELAY_MS;

    const introChunk = streamText(intro, cursor);
    stream.push(...introChunk);
    cursor = introChunk[introChunk.length - 1]?.delayMs ?? cursor;

    cursor += 120;
    stream.push({
        delayMs: cursor,
        event: {
            type: "tool_call",
            name: "query_kb",
            args: { entity: "work_order", status: ["open", "in_progress"] },
        },
    });
    cursor += 280;
    stream.push({
        delayMs: cursor,
        event: { type: "tool_result", name: "query_kb", summary: "3 rows" },
    });

    cursor += 60;
    const tableChunk = streamText(table, cursor);
    stream.push(...tableChunk);
    cursor = tableChunk[tableChunk.length - 1]?.delayMs ?? cursor;

    stream.push({ delayMs: cursor + 200, event: { type: "done" } });
    return stream;
}

function buildCodeScenario(): Scenario[] {
    const intro = "Here's the query I'd run against the telemetry store:\n\n";
    const code =
        "```sql\n" +
        "SELECT\n" +
        "  cell_id,\n" +
        "  AVG(flow_rate) AS avg_flow,\n" +
        "  MAX(turbidity) AS peak_turbidity\n" +
        "FROM signals\n" +
        "WHERE time > now() - interval '1 hour'\n" +
        "GROUP BY cell_id\n" +
        "ORDER BY avg_flow DESC;\n" +
        "```\n\n" +
        "Inline reference: `signals.flow_rate` is sampled at 2 Hz, so this " +
        "aggregates ~7 200 rows per cell per hour.";

    const stream: Scenario[] = [];
    let cursor = STATIC_OPEN_DELAY_MS;
    const introChunk = streamText(intro, cursor);
    stream.push(...introChunk);
    cursor = introChunk[introChunk.length - 1]?.delayMs ?? cursor;
    const codeChunk = streamText(code, cursor);
    stream.push(...codeChunk);
    cursor = codeChunk[codeChunk.length - 1]?.delayMs ?? cursor;
    stream.push({ delayMs: cursor + 200, event: { type: "done" } });
    return stream;
}

function buildToolCallScenario(prompt: string): Scenario[] {
    const stream: Scenario[] = [];
    let cursor = STATIC_OPEN_DELAY_MS;

    cursor += 80;
    stream.push({
        delayMs: cursor,
        event: {
            type: "tool_call",
            name: "query_kb",
            args: { q: prompt.slice(0, 80), limit: 5 },
        },
    });
    cursor += 340;
    stream.push({
        delayMs: cursor,
        event: { type: "tool_result", name: "query_kb", summary: "5 rows" },
    });
    cursor += 60;

    const reply =
        "I pulled five matching entries from the knowledge base. The most " +
        "relevant one is **RCA-2041** — a similar turbidity excursion on " +
        "Cell 02.01 three weeks ago, resolved by flushing the prefilter.";
    const replyChunk = streamText(reply, cursor);
    stream.push(...replyChunk);
    cursor = replyChunk[replyChunk.length - 1]?.delayMs ?? cursor;
    stream.push({ delayMs: cursor + 200, event: { type: "done" } });
    return stream;
}

function buildHandoffScenario(): Scenario[] {
    const stream: Scenario[] = [];
    let cursor = STATIC_OPEN_DELAY_MS;

    const part1 = "Taking a first look…\n\n";
    const chunk1 = streamText(part1, cursor);
    stream.push(...chunk1);
    cursor = chunk1[chunk1.length - 1]?.delayMs ?? cursor;

    cursor += 140;
    stream.push({
        delayMs: cursor,
        event: {
            type: "agent_handoff",
            from: "sentinel",
            to: "investigator",
            reason: "anomaly needs root-cause analysis",
        },
    });

    cursor += 200;
    const part2 =
        "I've run a correlation across the last 24 h of flow and turbidity " +
        "signals. The excursion aligns with the scheduled backwash cycle — " +
        "not a genuine anomaly, but the threshold should be widened during " +
        "cycle windows.";
    const chunk2 = streamText(part2, cursor);
    stream.push(...chunk2);
    cursor = chunk2[chunk2.length - 1]?.delayMs ?? cursor;
    stream.push({ delayMs: cursor + 200, event: { type: "done" } });
    return stream;
}

export function createMockChatClient(options: MockChatClientOptions): MockChatHandle {
    let aborted = false;
    let readyState: number = 0;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const clearAllScheduled = () => {
        for (const t of pendingTimers) clearTimeout(t);
        pendingTimers.clear();
    };

    const open = () => {
        readyState = 1;
        options.onOpen?.();
    };

    readyTimer = setTimeout(() => {
        readyTimer = null;
        if (!aborted) open();
    }, 0);

    const close = (code = 1000, reason = "") => {
        if (aborted) return;
        aborted = true;
        if (readyTimer !== null) {
            clearTimeout(readyTimer);
            readyTimer = null;
        }
        clearAllScheduled();
        readyState = 3;
        options.onClose?.(code, reason, code === 1000 || code === 1001);
    };

    if (options.signal) {
        if (options.signal.aborted) {
            close(1000, "aborted");
        } else {
            options.signal.addEventListener("abort", () => close(1000, "aborted"), {
                once: true,
            });
        }
    }

    const sendMock = (prompt: string) => {
        if (aborted || readyState !== 1) {
            options.onError?.(new Error("mockChat: send while not OPEN"));
            return;
        }
        const scenario = buildScenario(prompt);
        for (const step of scenario) {
            const timer = setTimeout(() => {
                pendingTimers.delete(timer);
                if (aborted) return;
                options.onEvent(step.event.type, step.event);
            }, step.delayMs);
            pendingTimers.add(timer);
        }
    };

    return {
        close,
        sendMock,
        get readyState() {
            return readyState;
        },
    };
}
