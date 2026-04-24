/**
 * Chat sessions store — local persistence layer for ARIA copilot
 * conversations.
 *
 * Why client-side only?
 *   The backend WS handler keeps `messages` in a per-connection closure
 *   (see `backend/modules/chat/router.py`). There is no chat persistence
 *   API today. Saving sessions to localStorage gives the operator a
 *   personal history they can browse + resume without backend work — fine
 *   for the demo (and survives a page reload). Resuming a session opens
 *   it read-only-ish: new turns start a fresh server-side context but the
 *   prior transcript stays visible.
 *
 * Storage
 *   key  : `aria.chat.sessions.v1`
 *   shape: `{ currentId: string|null, sessions: SavedSession[] }`
 *
 * The {@link useChatStore} mutates messages; a subscription in
 * `main.tsx` (or app bootstrap) drives `syncFromMessages` to autosave the
 * active session whenever its transcript changes.
 */

import { create } from "zustand";
import type { ChatMessage } from "./chatStore";

const STORAGE_KEY = "aria.chat.sessions.v1";
const MAX_SESSIONS = 50;
const TITLE_MAX_LEN = 60;

export interface SavedSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    messages: ChatMessage[];
}

interface PersistShape {
    currentId: string | null;
    sessions: SavedSession[];
}

/**
 * Pure filter — sort sessions by `updatedAt` desc, then narrow by a
 * free-text query (matches title and user/agent text content).
 *
 * Lives outside the store so consumers can wrap it in `useMemo`. Calling
 * a store *method* that returns a fresh array on every render breaks
 * `useSyncExternalStore`'s snapshot identity check (infinite loop).
 */
export function filterSessions(sessions: readonly SavedSession[], query: string): SavedSession[] {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((s) => {
        if (s.title.toLowerCase().includes(q)) return true;
        for (const m of s.messages) {
            if (m.role === "user" && m.content.toLowerCase().includes(q)) return true;
            if (m.role === "agent") {
                for (const part of m.parts) {
                    if (part.kind === "text" && part.content.toLowerCase().includes(q)) {
                        return true;
                    }
                }
            }
        }
        return false;
    });
}

function emptyState(): PersistShape {
    return { currentId: null, sessions: [] };
}

function readStorage(): PersistShape {
    if (typeof window === "undefined") return emptyState();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw) as PersistShape;
        if (!parsed || !Array.isArray(parsed.sessions)) return emptyState();
        return parsed;
    } catch {
        return emptyState();
    }
}

function writeStorage(state: PersistShape): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Quota / private mode — silent: persistence is best-effort.
    }
}

function deriveTitle(messages: ChatMessage[]): string {
    for (const m of messages) {
        if (m.role === "user" && m.content.trim().length > 0) {
            const oneLine = m.content.replace(/\s+/g, " ").trim();
            return oneLine.length > TITLE_MAX_LEN
                ? `${oneLine.slice(0, TITLE_MAX_LEN - 1)}…`
                : oneLine;
        }
    }
    return "Untitled session";
}

function newId(): string {
    return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ChatSessionsState {
    sessions: SavedSession[];
    currentId: string | null;
    /** Free-text filter applied by `filteredSessions`. */
    searchQuery: string;

    /** Replace the search query (panel input). */
    setSearchQuery: (q: string) => void;

    /** Persist the active transcript. Creates a session record on first call. */
    syncFromMessages: (messages: ChatMessage[]) => void;

    /** Spawn a new empty session and mark it current. Returns its id. */
    startNew: () => string;

    /** Mark a saved session as the active one (caller hydrates chatStore). */
    setCurrent: (id: string | null) => void;

    /** Remove a session. Clears `currentId` if it matched. */
    remove: (id: string) => void;

    /** Rename a session — used by the future inline-rename affordance. */
    rename: (id: string, title: string) => void;
}

export const useChatSessionsStore = create<ChatSessionsState>((set, get) => {
    const initial = readStorage();

    const persist = (partial: Pick<PersistShape, "currentId" | "sessions">) => {
        writeStorage(partial);
    };

    return {
        sessions: initial.sessions,
        currentId: initial.currentId,
        searchQuery: "",

        setSearchQuery: (q) => set({ searchQuery: q }),

        syncFromMessages: (messages) => {
            // Skip empty transcripts so we don't litter the list with blanks.
            if (messages.length === 0) return;
            const { sessions, currentId } = get();
            const now = Date.now();
            let id = currentId;
            let next: SavedSession[];
            if (id) {
                const idx = sessions.findIndex((s) => s.id === id);
                if (idx >= 0) {
                    const existing = sessions[idx];
                    const updated: SavedSession = {
                        ...existing,
                        title:
                            existing.title === "Untitled session"
                                ? deriveTitle(messages)
                                : existing.title,
                        updatedAt: now,
                        messageCount: messages.length,
                        messages,
                    };
                    next = [...sessions];
                    next[idx] = updated;
                } else {
                    // currentId pointed at a missing record — create fresh.
                    id = newId();
                    next = [
                        ...sessions,
                        {
                            id,
                            title: deriveTitle(messages),
                            createdAt: now,
                            updatedAt: now,
                            messageCount: messages.length,
                            messages,
                        },
                    ];
                }
            } else {
                id = newId();
                next = [
                    ...sessions,
                    {
                        id,
                        title: deriveTitle(messages),
                        createdAt: now,
                        updatedAt: now,
                        messageCount: messages.length,
                        messages,
                    },
                ];
            }
            // Cap list — drop oldest by updatedAt.
            if (next.length > MAX_SESSIONS) {
                next.sort((a, b) => b.updatedAt - a.updatedAt);
                next = next.slice(0, MAX_SESSIONS);
            }
            set({ sessions: next, currentId: id });
            persist({ currentId: id, sessions: next });
        },

        startNew: () => {
            const id = newId();
            const now = Date.now();
            const blank: SavedSession = {
                id,
                title: "Untitled session",
                createdAt: now,
                updatedAt: now,
                messageCount: 0,
                messages: [],
            };
            const next = [blank, ...get().sessions];
            set({ sessions: next, currentId: id });
            persist({ currentId: id, sessions: next });
            return id;
        },

        setCurrent: (id) => {
            set({ currentId: id });
            persist({ currentId: id, sessions: get().sessions });
        },

        remove: (id) => {
            const next = get().sessions.filter((s) => s.id !== id);
            const cur = get().currentId === id ? null : get().currentId;
            set({ sessions: next, currentId: cur });
            persist({ currentId: cur, sessions: next });
        },

        rename: (id, title) => {
            const trimmed = title.trim() || "Untitled session";
            const next = get().sessions.map((s) =>
                s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s,
            );
            set({ sessions: next });
            persist({ currentId: get().currentId, sessions: next });
        },
    };
});
