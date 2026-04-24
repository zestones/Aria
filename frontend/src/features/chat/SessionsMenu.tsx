/**
 * SessionsMenu — compact dropdown launched from the main `ChatPanel`
 * header. Mirrors the workspace `SessionsPanel` but in a popover form so
 * operators can find/resume a past conversation without leaving the
 * sidebar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../../components/ui";
import { filterSessions, type SavedSession, useChatSessionsStore } from "./chatSessionsStore";
import { useChatStore } from "./chatStore";

export function SessionsMenu() {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sessions = useChatSessionsStore((s) => s.sessions);
    const currentId = useChatSessionsStore((s) => s.currentId);
    const searchQuery = useChatSessionsStore((s) => s.searchQuery);
    const setSearchQuery = useChatSessionsStore((s) => s.setSearchQuery);
    const setCurrent = useChatSessionsStore((s) => s.setCurrent);
    const remove = useChatSessionsStore((s) => s.remove);
    const loadMessages = useChatStore((s) => s.loadMessages);

    const filtered = useMemo(() => filterSessions(sessions, searchQuery), [sessions, searchQuery]);

    useEffect(() => {
        if (!open) return;
        // Focus the search input on next tick so the popover finishes mounting.
        const id = window.setTimeout(() => inputRef.current?.focus(), 0);
        const onClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) {
                return;
            }
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
            window.clearTimeout(id);
        };
    }, [open]);

    const handleLoad = (s: SavedSession) => {
        setCurrent(s.id);
        loadMessages(s.messages);
        setOpen(false);
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Find a saved session"
                title="Find session"
                aria-expanded={open}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Icons.Search className="size-3" aria-hidden />
                Sessions
            </button>
            {open && (
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label="Saved sessions"
                    className="absolute right-0 top-full z-30 mt-1 flex w-72 flex-col rounded-md border border-border bg-card shadow-lg"
                >
                    <div className="border-b border-border p-2">
                        <div className="relative">
                            <Icons.Search
                                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                                aria-hidden
                            />
                            {/* Focused via inputRef + setTimeout in `useEffect` (no autofocus attr). */}
                            <input
                                ref={inputRef}
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search sessions"
                                className="h-7 w-full rounded border border-border bg-background pl-7 pr-2 text-[12px] text-foreground placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1">
                        {filtered.length === 0 ? (
                            <p className="px-2 py-3 text-[11px] text-text-tertiary">
                                {searchQuery ? "No matches." : "No saved sessions yet."}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-0.5">
                                {filtered.map((s) => (
                                    <li key={s.id} className="group relative">
                                        <button
                                            type="button"
                                            onClick={() => handleLoad(s)}
                                            aria-current={s.id === currentId ? "true" : undefined}
                                            className={[
                                                "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors duration-150",
                                                s.id === currentId
                                                    ? "bg-accent"
                                                    : "hover:bg-accent",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            ].join(" ")}
                                        >
                                            <span className="line-clamp-1 pr-5 text-[12px] font-medium text-foreground">
                                                {s.title}
                                            </span>
                                            <span className="text-[10px] text-text-tertiary tabular-nums">
                                                {s.messageCount} msg
                                                {s.messageCount === 1 ? "" : "s"}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                remove(s.id);
                                            }}
                                            aria-label={`Delete session ${s.title}`}
                                            className="absolute right-1 top-1 hidden size-4 items-center justify-center rounded text-text-tertiary group-hover:inline-flex hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <Icons.X className="size-3" aria-hidden />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
