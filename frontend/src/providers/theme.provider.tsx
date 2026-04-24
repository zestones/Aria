import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "aria.theme";
const MEDIA_QUERY = "(prefers-color-scheme: light)";

interface ThemeContextValue {
    mode: ThemeMode;
    resolved: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
    if (typeof window === "undefined") return "system";
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === "dark" || raw === "light" || raw === "system") return raw;
    } catch {}
    return "system";
}

function systemPreference(): ResolvedTheme {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia(MEDIA_QUERY).matches ? "light" : "dark";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
    return mode === "system" ? systemPreference() : mode;
}

function applyTheme(resolved: ResolvedTheme) {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
    const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

    useEffect(() => {
        applyTheme(resolved);
    }, [resolved]);

    useEffect(() => {
        if (mode !== "system") return;
        const mql = window.matchMedia(MEDIA_QUERY);
        const handler = () => setResolved(systemPreference());
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [mode]);

    const setMode = useCallback((next: ThemeMode) => {
        setModeState(next);
        setResolved(resolveTheme(next));
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {}
    }, []);

    return (
        <ThemeContext.Provider value={{ mode, resolved, setMode }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
    return ctx;
}
