import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, logout } from "../../services/auth";
import { Icons } from "../ui";

function initialsOf(name: string | undefined, fallback: string): string {
    const source = name?.trim() || fallback;
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: string): string {
    switch (role) {
        case "admin":
            return "Administrator";
        case "operator":
            return "Operator";
        case "viewer":
            return "Viewer";
        default:
            return role;
    }
}

interface UserMenuProps {
    /** When true, only the avatar is rendered (sidebar collapsed mode). */
    compact?: boolean;
}

export function UserMenu({ compact = false }: UserMenuProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const user = getUser();
    const displayName = user?.full_name || user?.username || "Guest";
    const initials = initialsOf(user?.full_name, user?.username || "?");

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const handleLogout = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
            await logout();
        } finally {
            setBusy(false);
            setOpen(false);
            navigate("/login", { replace: true });
        }
    }, [busy, navigate]);

    const avatar = (
        <span
            aria-hidden
            className="flex size-8 flex-none items-center justify-center rounded-full bg-(--ds-accent-soft) text-(--ds-text-xs) font-semibold uppercase tracking-wide"
        >
            {initials}
        </span>
    );

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={compact ? `Account menu for ${displayName}` : undefined}
                className={[
                    "group flex w-full items-center gap-2.5 rounded-(--ds-radius-md) border border-transparent transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]",
                    "hover:border-[var(--ds-border)] hover:bg-[var(--ds-bg-hover)]",
                    compact ? "justify-center p-1.5" : "px-2 py-1.5",
                    open ? "border-[var(--ds-border)] bg-[var(--ds-bg-hover)]" : "",
                ].join(" ")}
            >
                {avatar}
                {!compact && (
                    <>
                        <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                            <span className="truncate text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)]">
                                {displayName}
                            </span>
                            {user?.role && (
                                <span className="truncate text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                                    {roleLabel(user.role)}
                                </span>
                            )}
                        </span>
                        <Icons.ChevronUp
                            className="size-3.5 flex-none text-[var(--ds-fg-subtle)] transition-transform"
                            style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
                            aria-hidden
                        />
                    </>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="User menu"
                    className={[
                        "absolute z-40 w-60 overflow-hidden rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] shadow-[var(--ds-shadow-overlay)]",
                        // Position above the button — sidebar bottom anchor.
                        "bottom-[calc(100%+6px)]",
                        compact ? "left-[calc(100%+8px)] bottom-0" : "left-0 right-0",
                    ].join(" ")}
                >
                    <div className="flex items-center gap-2.5 border-b border-[var(--ds-border)] px-3 py-2.5">
                        {avatar}
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)]">
                                {displayName}
                            </span>
                            {user?.email && (
                                <span className="truncate text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                                    {user.email}
                                </span>
                            )}
                            {user?.role && (
                                <span className="mt-0.5 truncate text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                    {roleLabel(user.role)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-1">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleLogout}
                            disabled={busy}
                            className="flex w-full items-center gap-2 rounded-[var(--ds-radius-sm)] px-2.5 py-1.5 text-left text-[var(--ds-text-sm)] text-[var(--ds-fg-primary)] transition-colors hover:bg-[var(--ds-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Icons.LogOut
                                className="size-4 text-[var(--ds-fg-muted)]"
                                aria-hidden
                            />
                            {busy ? "Signing out…" : "Sign out"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
