import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMap, ChatWsClient, ChatWsClientOptions } from "@/lib/ws";

interface Fake {
    options: ChatWsClientOptions<ChatMap>;
    handle: ChatWsClient;
    sendSpy: ReturnType<typeof vi.fn>;
    closeSpy: ReturnType<typeof vi.fn>;
    /** Drive the socket through its lifecycle from the test side. */
    simulateOpen: () => void;
    simulateEvent: (msg: ChatMap) => void;
    simulateClose: (code?: number, reason?: string) => void;
}

const fakes: Fake[] = [];

vi.mock("@/lib/ws", async () => {
    const actual = await vi.importActual<typeof import("@/lib/ws")>("@/lib/ws");
    return {
        ...actual,
        createChatWsClient: (options: ChatWsClientOptions<ChatMap>) => {
            const sendSpy = vi.fn();
            const closeSpy = vi.fn();
            let readyState = 0;
            const handle: ChatWsClient = {
                close: (code, reason) => {
                    closeSpy(code, reason);
                    readyState = 3;
                },
                get readyState() {
                    return readyState;
                },
                send: sendSpy,
            };
            const fake: Fake = {
                options,
                handle,
                sendSpy,
                closeSpy,
                simulateOpen: () => {
                    readyState = 1;
                    options.onOpen?.();
                },
                simulateEvent: (msg) => {
                    options.onEvent(msg.type, msg);
                },
                simulateClose: (code = 1006, reason = "abnormal") => {
                    readyState = 3;
                    options.onClose?.(code, reason, code === 1000 || code === 1001);
                },
            };
            fakes.push(fake);
            return handle;
        },
    };
});

async function importStoreFresh() {
    vi.resetModules();
    fakes.length = 0;
    const mod = await import("@/features/chat/chatStore");
    return mod.useChatStore;
}

function lastFake(): Fake {
    const f = fakes.at(-1);
    if (!f) throw new Error("No fake chat client created yet");
    return f;
}

/** Flush every pending microtask (sendMessage uses a microtask retry loop). */
async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
    }
}

beforeEach(() => {
    fakes.length = 0;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("chatStore — real WS integration", () => {
    it("sends {type: 'user', content} once the socket is OPEN", async () => {
        const useChatStore = await importStoreFresh();
        useChatStore.getState().sendMessage("hi");

        lastFake().simulateOpen();
        await flushMicrotasks();

        expect(lastFake().sendSpy).toHaveBeenCalledTimes(1);
        expect(lastFake().sendSpy).toHaveBeenCalledWith({ type: "user", content: "hi" });
    });

    it("accumulates ui_render as artifact parts and ignores thinking_delta bursts", async () => {
        const useChatStore = await importStoreFresh();
        useChatStore.getState().sendMessage("investigate");
        lastFake().simulateOpen();
        await flushMicrotasks();

        const beforeMessages = useChatStore.getState().messages;
        const agentMsg = beforeMessages.find((m) => m.role === "agent");
        if (!agentMsg) throw new Error("agent message missing");
        const agentId = agentMsg.id;

        for (let i = 0; i < 10; i += 1) {
            lastFake().simulateEvent({
                type: "ui_render",
                component: "signal_chart",
                props: { cell_id: 1, signal_def_id: i },
            });
            lastFake().simulateEvent({
                type: "thinking_delta",
                content: `reasoning chunk ${i}`,
            });
        }

        const after = useChatStore
            .getState()
            .messages.find((m) => m.id === agentId && m.role === "agent");
        if (!after || after.role !== "agent") throw new Error("agent message missing after burst");

        // thinking_delta is still ignored — no "thinking" parts should land.
        for (const part of after.parts) {
            expect(part.kind).not.toBe("thinking");
        }

        const artifacts = after.parts.filter((p) => p.kind === "artifact");
        expect(artifacts).toHaveLength(10);
        artifacts.forEach((p, idx) => {
            if (p.kind !== "artifact") throw new Error("expected artifact part");
            expect(p.component).toBe("signal_chart");
            expect(p.props).toEqual({ cell_id: 1, signal_def_id: idx });
        });
        expect(after.streaming).toBe(true);
    });

    it("marks the agent message with error and streaming=false on done.error", async () => {
        const useChatStore = await importStoreFresh();
        useChatStore.getState().sendMessage("boom");
        lastFake().simulateOpen();
        await flushMicrotasks();

        lastFake().simulateEvent({ type: "text_delta", content: "partial…" });
        lastFake().simulateEvent({ type: "done", error: "backend boom" });

        const agent = useChatStore.getState().messages.find((m) => m.role === "agent");
        if (!agent || agent.role !== "agent") throw new Error("agent message missing");

        expect(agent.streaming).toBe(false);
        expect(agent.error).toBe("backend boom");
        for (const part of agent.parts) {
            if (part.kind === "text") expect(part.streaming).toBe(false);
        }
    });

    it("transitions to error state with a sign-in prompt when close code is 4401", async () => {
        const useChatStore = await importStoreFresh();
        useChatStore.getState().connect();

        lastFake().simulateClose(4401, "cookie invalid");

        const { status, error } = useChatStore.getState();
        expect(status).toBe("error");
        expect(error).toMatch(/sign in/i);
    });

    it("updates the agent message badge when an agent_start frame arrives (issue #109)", async () => {
        const useChatStore = await importStoreFresh();
        useChatStore.getState().sendMessage("who's speaking?");
        lastFake().simulateOpen();
        await flushMicrotasks();

        const before = useChatStore.getState().messages.find((m) => m.role === "agent");
        if (!before || before.role !== "agent") throw new Error("agent message missing");
        // Default placeholder before backend declares the speaker.
        expect(before.agent).toBe("sentinel");

        lastFake().simulateEvent({ type: "agent_start", agent: "investigator" });

        const after = useChatStore
            .getState()
            .messages.find((m) => m.id === before.id && m.role === "agent");
        if (!after || after.role !== "agent") throw new Error("agent message missing after frame");
        expect(after.agent).toBe("investigator");
    });
});
