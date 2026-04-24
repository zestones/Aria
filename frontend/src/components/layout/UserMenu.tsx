import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ThemeMode, useTheme } from "../../providers/theme.provider";
import { getUser, logout } from "../../services/auth";
import { Icons } from "../ui";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
];

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

    const { mode: themeMode, setMode: setThemeMode } = useTheme();

    const handleLogout = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
            await logout();
        } finally {
            setBusy(false);
            setOpen(false);
            navigate("/", { replace: true });
        }
    }, [busy, navigate]);

    const avatar = (
        <span
            aria-hidden
            className="flex size-8 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase tracking-wide"
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
                    "group flex w-full items-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
                    "hover:bg-sidebar-accent",
                    compact ? "justify-center px-3 py-3" : "gap-3 px-4 py-3",
                    open ? "bg-sidebar-accent" : "",
                ].join(" ")}
            >
                {avatar}
                {!compact && (
                    <>
                        <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                            <span className="truncate text-sm font-medium text-sidebar-foreground">
                                {displayName}
                            </span>
                            {user?.role && (
                                <span className="truncate text-[11px] text-sidebar-muted-foreground">
                                    {roleLabel(user.role)}
                                </span>
                            )}
                        </span>
                        <Icons.ChevronUp
                            className="size-4 flex-none text-sidebar-muted-foreground transition-transform"
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
                        "absolute z-40 w-60 overflow-hidden rounded-lg border border-border bg-popover shadow-card",
                        // Anchor above the trigger.
                        "bottom-[calc(100%+6px)]",
                        compact ? "left-[calc(100%+8px)] bottom-2" : "left-3 right-3",
                    ].join(" ")}
                >
                    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                        {avatar}
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                                {displayName}
                            </span>
                            {user?.email && (
                                <span className="truncate text-xs text-text-tertiary">
                                    {user.email}
                                </span>
                            )}
                            {user?.role && (
                                <span className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {roleLabel(user.role)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="border-b border-border px-3 py-2.5">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                            Theme
                        </p>
                        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
                            {THEME_OPTIONS.map((opt) => {
                                const active = themeMode === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        aria-label={`Use ${opt.label.toLowerCase()} theme`}
                                        onClick={() => setThemeMode(opt.value)}
                                        className={[
                                            "flex-1 rounded-md py-1 text-xs font-medium transition-colors duration-150",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            active
                                                ? "bg-muted text-foreground"
                                                : "text-muted-foreground hover:text-foreground",
                                        ].join(" ")}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="p-1">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleLogout}
                            disabled={busy}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Icons.LogOut className="size-4 text-muted-foreground" aria-hidden />
                            {busy ? "Signing out…" : "Sign out"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
