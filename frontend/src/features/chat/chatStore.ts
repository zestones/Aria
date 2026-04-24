import { create } from "zustand";
import type { ChatMap } from "../../lib/ws";
import { type ChatWsClient, createChatWsClient } from "../../lib/ws";

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error";

export type AgentId = "sentinel" | "investigator" | "kb_builder" | "work_order" | "qa";

export interface UserMessage {
    id: string;
    role: "user";
    content: string;
    createdAt: number;
}

export interface ToolCallPart {
    kind: "tool_call";
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: "running" | "done";
    summary?: string;
}

export interface TextPart {
    kind: "text";
    id: string;
    content: string;
    /** Still receiving text_delta frames for this part. */
    streaming: boolean;
}

export interface HandoffPart {
    kind: "handoff";
    id: string;
    from: AgentId | string;
    to: AgentId | string;
    reason: string;
}

export interface ArtifactPart {
    kind: "artifact";
    id: string;
    component: string;
    props: Record<string, unknown>;
}

export type AgentPart = ToolCallPart | TextPart | HandoffPart | ArtifactPart;

export interface AgentMessage {
    id: string;
    role: "agent";
    agent: AgentId | string;
    parts: AgentPart[];
    createdAt: number;
    /** True until the turn produces a `done` event. */
    streaming: boolean;
    /** Populated when `done` carries an `error`. */
    error?: string;
}

export type ChatMessage = UserMessage | AgentMessage;

export interface ChatState {
    messages: ChatMessage[];
    status: ConnectionStatus;
    error: string | null;
    /** Bumps every time the input should re-focus (cmd+K while drawer is open). */
    focusRequestId: number;

    connect: () => void;
    disconnect: () => void;
    sendMessage: (content: string) => void;
    reset: () => void;
    requestFocus: () => void;
    /** Replace the message list (e.g. when resuming a saved session). */
    loadMessages: (messages: ChatMessage[]) => void;
    /**
     * Start a fresh server-side context: closes the current WS so the
     * backend's per-connection memory is dropped, clears the local
     * transcript, and the next user send will reconnect on demand.
     */
    newSession: () => void;
}

const DEFAULT_AGENT: AgentId = "sentinel";
const CHAT_WS_URL = "/api/v1/agent/chat";
const AUTH_EXPIRED_MESSAGE = "Session expired — please sign in again.";

interface InternalState {
    handle: ChatWsClient | null;
    currentAgentMessageId: string | null;
    idCounter: number;
    /** FIFO of user messages queued while the socket is CONNECTING. */
    pendingSends: string[];
}

function nextId(internal: InternalState, prefix: string): string {
    internal.idCounter += 1;
    return `${prefix}-${internal.idCounter}-${Date.now().toString(36)}`;
}

export const useChatStore = create<ChatState>((set, get) => {
    const internal: InternalState = {
        handle: null,
        currentAgentMessageId: null,
        idCounter: 0,
        pendingSends: [],
    };

    const upsertAgentMessage = (update: (msg: AgentMessage) => AgentMessage) => {
        const id = internal.currentAgentMessageId;
        if (!id) return;
        set((state) => ({
            messages: state.messages.map((m) =>
                m.id === id && m.role === "agent" ? update(m) : m,
            ),
        }));
    };

    const appendTextDelta = (content: string) => {
        upsertAgentMessage((msg) => {
            const parts = [...msg.parts];
            const last = parts[parts.length - 1];
            if (last && last.kind === "text" && last.streaming) {
                parts[parts.length - 1] = { ...last, content: last.content + content };
            } else {
                parts.push({
                    kind: "text",
                    id: nextId(internal, "text"),
                    content,
                    streaming: true,
                });
            }
            return { ...msg, parts };
        });
    };

    const handleEvent = (type: ChatMap["type"], message: ChatMap) => {
        if (!internal.currentAgentMessageId) return;

        switch (message.type) {
            case "text_delta": {
                appendTextDelta(message.content);
                break;
            }
            case "thinking_delta": {
                // M6.5 scope: thinking tokens are collapsed into the main text
                // stream so the shell exercises the streaming path end-to-end.
                // Dedicated thinking UI lands post-M6.5.
                break;
            }
            case "agent_start": {
                // Issue #109: backend declares the speaker at turn start so
                // the badge reflects the real agent instead of DEFAULT_AGENT.
                upsertAgentMessage((msg) => ({ ...msg, agent: message.agent }));
                break;
            }
            case "tool_call": {
                upsertAgentMessage((msg) => {
                    const parts = [...msg.parts];
                    // Seal any ongoing text part so tool call sits between text runs.
                    const lastIdx = parts.length - 1;
                    if (parts[lastIdx]?.kind === "text" && (parts[lastIdx] as TextPart).streaming) {
                        parts[lastIdx] = { ...(parts[lastIdx] as TextPart), streaming: false };
                    }
                    parts.push({
                        kind: "tool_call",
                        id: nextId(internal, "tc"),
                        name: message.name,
                        args: message.args,
                        status: "running",
                    });
                    return { ...msg, parts };
                });
                break;
            }
            case "tool_result": {
                upsertAgentMessage((msg) => {
                    const parts = [...msg.parts];
                    for (let i = parts.length - 1; i >= 0; i -= 1) {
                        const p = parts[i];
                        if (
                            p.kind === "tool_call" &&
                            p.name === message.name &&
                            p.status === "running"
                        ) {
                            parts[i] = { ...p, status: "done", summary: message.summary };
                            break;
                        }
                    }
                    return { ...msg, parts };
                });
                break;
            }
            case "agent_handoff": {
                upsertAgentMessage((msg) => {
                    const parts = [...msg.parts];
                    const lastIdx = parts.length - 1;
                    if (parts[lastIdx]?.kind === "text" && (parts[lastIdx] as TextPart).streaming) {
                        parts[lastIdx] = { ...(parts[lastIdx] as TextPart), streaming: false };
                    }
                    parts.push({
                        kind: "handoff",
                        id: nextId(internal, "ho"),
                        from: message.from,
                        to: message.to,
                        reason: message.reason,
                    });
                    return { ...msg, agent: message.to, parts };
                });
                break;
            }
            case "ui_render": {
                upsertAgentMessage((msg) => {
                    const parts = [...msg.parts];
                    // Seal any ongoing text part so the artifact sits between text runs,
                    // matching the tool_call insertion pattern above.
                    const lastIdx = parts.length - 1;
                    if (parts[lastIdx]?.kind === "text" && (parts[lastIdx] as TextPart).streaming) {
                        parts[lastIdx] = { ...(parts[lastIdx] as TextPart), streaming: false };
                    }
                    parts.push({
                        kind: "artifact",
                        id: nextId(internal, "ar"),
                        component: message.component,
                        props: message.props,
                    });
                    return { ...msg, parts };
                });
                break;
            }
            case "done": {
                upsertAgentMessage((msg) => {
                    const parts = msg.parts.map((p) =>
                        p.kind === "text" && p.streaming ? { ...p, streaming: false } : p,
                    );
                    return { ...msg, parts, streaming: false, error: message.error };
                });
                internal.currentAgentMessageId = null;
                break;
            }
        }
        // biome-ignore lint/suspicious/noExplicitAny: `type` is derived from the union above, not user input
        void (type as any);
    };

    const flushPending = () => {
        const handle = internal.handle;
        if (!handle) return;
        while (internal.pendingSends.length > 0) {
            const content = internal.pendingSends.shift() as string;
            handle.send({ type: "user", content });
        }
    };

    const ensureConnected = () => {
        if (internal.handle) return;
        set({ status: "connecting", error: null });
        internal.handle = createChatWsClient<ChatMap>({
            url: CHAT_WS_URL,
            onOpen: () => {
                set({ status: "open", error: null });
                // Defensive: avoid microtask busy-loop while CONNECTING — event-driven flush on open.
                flushPending();
            },
            onClose: (code) => {
                internal.pendingSends.length = 0;
                if (code === 4401) {
                    set({ status: "error", error: AUTH_EXPIRED_MESSAGE });
                    return;
                }
                set({ status: "closed" });
            },
            onError: (err) => {
                internal.pendingSends.length = 0;
                set({ status: "error", error: err.message });
            },
            onEvent: handleEvent,
        });
    };

    return {
        messages: [],
        status: "idle",
        error: null,
        focusRequestId: 0,

        connect: () => ensureConnected(),

        disconnect: () => {
            internal.handle?.close(1000, "disconnect");
            internal.handle = null;
            internal.currentAgentMessageId = null;
            internal.pendingSends.length = 0;
            set({ status: "closed" });
        },

        sendMessage: (content) => {
            const trimmed = content.trim();
            if (!trimmed) return;

            ensureConnected();

            const userMsg: UserMessage = {
                id: nextId(internal, "u"),
                role: "user",
                content: trimmed,
                createdAt: Date.now(),
            };
            const agentMsg: AgentMessage = {
                id: nextId(internal, "a"),
                role: "agent",
                agent: DEFAULT_AGENT,
                parts: [],
                createdAt: Date.now() + 1,
                streaming: true,
            };
            internal.currentAgentMessageId = agentMsg.id;

            set((state) => ({ messages: [...state.messages, userMsg, agentMsg] }));

            const handle = internal.handle;
            const status = get().status;
            if (handle && status === "open") {
                handle.send({ type: "user", content: trimmed });
                return;
            }
            if (status === "error" || status === "closed") return;
            // Socket still CONNECTING — queue; flushed event-driven on onOpen.
            internal.pendingSends.push(trimmed);
        },

        reset: () => {
            internal.handle?.close(1000, "reset");
            internal.handle = null;
            internal.currentAgentMessageId = null;
            internal.pendingSends.length = 0;
            set({ messages: [], status: "idle", error: null });
        },

        requestFocus: () => {
            set((state) => ({ focusRequestId: state.focusRequestId + 1 }));
        },

        loadMessages: (messages) => {
            // Hydrate the visible transcript from a saved session. We close
            // the live WS so backend memory matches what the user sees
            // (i.e. an empty server-side context — the visible history is
            // for review/continuation, not literal replay to the model).
            internal.handle?.close(1000, "load-session");
            internal.handle = null;
            internal.currentAgentMessageId = null;
            internal.pendingSends.length = 0;
            set({ messages, status: "idle", error: null });
        },

        newSession: () => {
            internal.handle?.close(1000, "new-session");
            internal.handle = null;
            internal.currentAgentMessageId = null;
            internal.pendingSends.length = 0;
            set({ messages: [], status: "idle", error: null });
        },
    };
});
