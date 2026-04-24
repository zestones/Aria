import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { AriaMark, Icons, KbdKey, StatusDot, ThemeToggle } from "../design-system";
import type { EquipmentSelection } from "../lib/hierarchy";
import { EquipmentPicker } from "./EquipmentPicker";

function computeShift(date: Date) {
    const h = date.getHours();
    if (h >= 6 && h < 14) return { label: "Shift A", range: "06–14" };
    if (h >= 14 && h < 22) return { label: "Shift B", range: "14–22" };
    return { label: "Shift C", range: "22–06" };
}

function useShift() {
    const [shift, setShift] = useState(() => computeShift(new Date()));
    useEffect(() => {
        const tick = () => setShift(computeShift(new Date()));
        const id = window.setInterval(tick, 60_000);
        return () => window.clearInterval(id);
    }, []);
    return shift;
}

export interface TopBarProps {
    selection: EquipmentSelection | null;
    onSelectionChange: (selection: EquipmentSelection) => void;
    drawerOpen: boolean;
    drawerControlsId: string;
    onDrawerToggle: () => void;
    /** Placeholder slot for KpiBar — wired in M7.2. */
    kpiSlot?: React.ReactNode;
}

const NAV_BASE_CLASS =
    "inline-flex h-8 items-center gap-1.5 rounded-[var(--ds-radius-sm)] px-2.5 text-[var(--ds-text-sm)] font-medium transition-colors duration-[var(--ds-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]";

export function TopBar({
    selection,
    onSelectionChange,
    drawerOpen,
    drawerControlsId,
    onDrawerToggle,
    kpiSlot,
}: TopBarProps) {
    const shift = useShift();
    const DrawerIcon = drawerOpen ? Icons.PanelRightClose : Icons.PanelRightOpen;

    return (
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-5 border-b border-[var(--ds-border)] bg-[var(--ds-bg-base)] px-4">
            <div className="flex items-center gap-2.5">
                <AriaMark size={20} className="text-[var(--ds-fg-primary)]" />
                <span className="text-[var(--ds-text-md)] font-semibold tracking-[-0.01em] text-[var(--ds-fg-primary)]">
                    ARIA
                </span>
            </div>

            <div className="h-5 w-px flex-none bg-[var(--ds-border)]" aria-hidden />

            <EquipmentPicker selection={selection} onChange={onSelectionChange} />

            <nav className="flex items-center gap-1" aria-label="Primary">
                <NavLink
                    to="/control-room"
                    className={({ isActive }) =>
                        `${NAV_BASE_CLASS} ${
                            isActive
                                ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"
                                : "text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)]"
                        }`
                    }
                >
                    <Icons.Gauge className="size-4" aria-hidden />
                    Control room
                </NavLink>
                <NavLink
                    to="/work-orders"
                    className={({ isActive }) =>
                        `${NAV_BASE_CLASS} ${
                            isActive
                                ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"
                                : "text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)]"
                        }`
                    }
                >
                    <Icons.Wrench className="size-4" aria-hidden />
                    Work orders
                </NavLink>
            </nav>

            <div className="min-w-0 flex-1" data-kpi-slot>
                {kpiSlot}
            </div>

            <div className="flex flex-none items-center gap-2 text-[var(--ds-text-sm)]">
                <StatusDot status="nominal" />
                <span className="font-medium text-[var(--ds-fg-primary)]">{shift.label}</span>
                <span className="text-[var(--ds-fg-subtle)]">{shift.range}</span>
            </div>

            <ThemeToggle />

            <button
                type="button"
                onClick={onDrawerToggle}
                aria-expanded={drawerOpen}
                aria-controls={drawerControlsId}
                aria-label={drawerOpen ? "Collapse chat drawer" : "Expand chat drawer"}
                className="inline-flex h-8 flex-none items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] px-2.5 text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
            >
                <DrawerIcon className="size-4" />
                <KbdKey className="ml-1">⌘K</KbdKey>
            </button>
        </header>
    );
}
