/**
 * SessionsPanel — left rail in the Agent workspace listing the
 * operator's persisted chat sessions.
 *
 * Replaces the agent-turn timeline on the workspace surface (M9 polish):
 * the timeline is still useful for in-flight introspection but operators
 * asked for a way to *find* and *resume* past conversations, which the
 * timeline never offered. Lives next to the chat store so loading a
 * session here updates the same surface (`ConversationStream`).
 *
 * Notes
 *   - All persistence is client-side (localStorage). See
 *     {@link useChatSessionsStore} for the why.
 *   - The active session is highlighted with the same left-rail accent
 *     pattern as the global Sidebar, for visual rhyme.
 */

import { useCallback, useMemo, useState } from "react";
import { Icons } from "../../components/ui";
import { filterSessions, type SavedSession, useChatSessionsStore } from "../chat/chatSessionsStore";
import { useChatStore } from "../chat/chatStore";

function formatRelative(now: number, ts: number): string {
    const delta = Math.max(0, now - ts);
    const min = Math.floor(delta / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(ts).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

export function SessionsPanel() {
    const sessions = useChatSessionsStore((s) => s.sessions);
    const currentId = useChatSessionsStore((s) => s.currentId);
    const searchQuery = useChatSessionsStore((s) => s.searchQuery);
    const setSearchQuery = useChatSessionsStore((s) => s.setSearchQuery);
    const setCurrent = useChatSessionsStore((s) => s.setCurrent);
    const startNew = useChatSessionsStore((s) => s.startNew);
    const remove = useChatSessionsStore((s) => s.remove);

    const newSession = useChatStore((s) => s.newSession);
    const loadMessages = useChatStore((s) => s.loadMessages);

    const filtered = useMemo(() => filterSessions(sessions, searchQuery), [sessions, searchQuery]);

    const handleNew = useCallback(() => {
        newSession();
        startNew();
    }, [newSession, startNew]);

    const handleLoad = useCallback(
        (session: SavedSession) => {
            setCurrent(session.id);
            loadMessages(session.messages);
        },
        [setCurrent, loadMessages],
    );

    const now = Date.now();

    return (
        <aside
            aria-label="Chat sessions"
            className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar/40"
        >
            <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
                <Icons.MessageSquare className="size-4 text-text-tertiary" aria-hidden />
                <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-text-tertiary">
                    Sessions
                </h2>
                <span className="ml-auto text-xs text-text-tertiary tabular-nums">
                    {filtered.length}
                </span>
            </header>

            <div className="flex flex-none flex-col gap-2.5 border-b border-border px-3 py-3">
                <button
                    type="button"
                    onClick={handleNew}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.Plus className="size-4" aria-hidden />
                    New session
                </button>
                <SessionsSearch value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="flex-1 overflow-y-auto px-2.5 py-3">
                {filtered.length === 0 ? (
                    <p className="px-2 py-6 text-sm text-text-tertiary leading-relaxed">
                        {searchQuery
                            ? "No sessions match that search."
                            : "No sessions yet — start a conversation to save one."}
                    </p>
                ) : (
                    <ol className="flex flex-col gap-0.5">
                        {filtered.map((session) => (
                            <SessionRow
                                key={session.id}
                                session={session}
                                active={session.id === currentId}
                                relative={formatRelative(now, session.updatedAt)}
                                onOpen={handleLoad}
                                onDelete={remove}
                            />
                        ))}
                    </ol>
                )}
            </div>
        </aside>
    );
}

function SessionsSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="relative">
            <Icons.Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
                aria-hidden
            />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search sessions"
                className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        </div>
    );
}

function SessionRow({
    session,
    active,
    relative,
    onOpen,
    onDelete,
}: {
    session: SavedSession;
    active: boolean;
    relative: string;
    onOpen: (s: SavedSession) => void;
    onDelete: (id: string) => void;
}) {
    const [hover, setHover] = useState(false);
    return (
        <li
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="relative"
        >
            <button
                type="button"
                onClick={() => onOpen(session)}
                aria-current={active ? "true" : undefined}
                className={[
                    "group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                    active ? "bg-accent" : "hover:bg-accent/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ].join(" ")}
            >
                <span className="line-clamp-1 pr-6 text-sm font-medium text-foreground">
                    {session.title}
                </span>
                <span className="flex items-center gap-2 text-xs text-text-tertiary">
                    <span className="tabular-nums">
                        {session.messageCount} msg
                        {session.messageCount === 1 ? "" : "s"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{relative}</span>
                </span>
            </button>
            {hover && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(session.id);
                    }}
                    aria-label={`Delete session ${session.title}`}
                    className="absolute right-2 top-2.5 inline-flex size-6 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.X className="size-3.5" aria-hidden />
                </button>
            )}
        </li>
    );
}
