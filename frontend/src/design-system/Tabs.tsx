import { createContext, type ReactNode, useContext, useId, useState } from "react";

interface TabsContextValue {
    value: string;
    setValue: (v: string) => void;
    idBase: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error("Tabs.* must be used inside <Tabs>");
    return ctx;
}

export interface TabsProps {
    defaultValue: string;
    value?: string;
    onValueChange?: (v: string) => void;
    className?: string;
    children: ReactNode;
}

export function Tabs({
    defaultValue,
    value: controlled,
    onValueChange,
    className = "",
    children,
}: TabsProps) {
    const [internal, setInternal] = useState(defaultValue);
    const value = controlled ?? internal;
    const setValue = (v: string) => {
        if (controlled === undefined) setInternal(v);
        onValueChange?.(v);
    };
    const idBase = useId();
    return (
        <TabsContext.Provider value={{ value, setValue, idBase }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

/**
 * Tabs list — editorial/SCADA flavor: no filled-pill background, just a
 * bottom border running under every trigger plus a 2px accent rail on the
 * selected one (DESIGN_PLAN §8).
 */
export function TabsList({
    className = "",
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            role="tablist"
            className={`inline-flex items-end gap-0 border-b border-[var(--ds-border)] ${className}`}
        >
            {children}
        </div>
    );
}

export function TabsTrigger({
    value,
    className = "",
    children,
}: {
    value: string;
    className?: string;
    children: ReactNode;
}) {
    const { value: active, setValue, idBase } = useTabs();
    const selected = active === value;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${value}`}
            id={`${idBase}-trigger-${value}`}
            onClick={() => setValue(value)}
            className={`relative h-8 px-4 text-[11px] font-mono font-medium tracking-[0.08em] uppercase transition-colors duration-[var(--ds-motion-fast)] -mb-px border-b-2 ${
                selected
                    ? "text-[var(--ds-fg-primary)] border-[var(--ds-accent)]"
                    : "text-[var(--ds-fg-subtle)] border-transparent hover:text-[var(--ds-fg-muted)]"
            } ${className}`}
        >
            {children}
        </button>
    );
}

export function TabsContent({
    value,
    className = "",
    children,
}: {
    value: string;
    className?: string;
    children: ReactNode;
}) {
    const { value: active, idBase } = useTabs();
    if (active !== value) return null;
    return (
        <div
            role="tabpanel"
            id={`${idBase}-panel-${value}`}
            aria-labelledby={`${idBase}-trigger-${value}`}
            className={className}
        >
            {children}
        </div>
    );
}
