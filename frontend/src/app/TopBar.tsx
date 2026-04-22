import { useEffect, useState } from "react";
import { AriaMark, Icons, KbdKey, MetaStrip, StatusDot } from "../design-system";
import type { EquipmentSelection } from "../lib/hierarchy";
import { EquipmentPicker } from "./EquipmentPicker";

function computeShift(date: Date) {
    const h = date.getHours();
    if (h >= 6 && h < 14) return { label: "Shift A", range: "06—14" };
    if (h >= 14 && h < 22) return { label: "Shift B", range: "14—22" };
    return { label: "Shift C", range: "22—06" };
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

    const metaItems = [
        { label: "SITE", value: selection?.siteName ?? "—" },
        { label: "LINE", value: selection?.lineName ?? "—" },
        { label: "REV", value: "2026.04.22" },
    ];

    return (
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-6 border-b border-[var(--ds-border)] bg-[var(--ds-bg-base)] px-4">
            <div className="flex items-center gap-2.5">
                <AriaMark size={22} className="text-[var(--ds-accent)]" />
                <span className="font-sans text-[var(--ds-text-md)] font-semibold tracking-[-0.01em] text-[var(--ds-fg-primary)]">
                    ARIA
                </span>
            </div>

            <div className="h-6 w-px flex-none bg-[var(--ds-border)]" aria-hidden />

            <EquipmentPicker selection={selection} onChange={onSelectionChange} />

            <div className="min-w-0 flex-1" data-kpi-slot>
                {kpiSlot}
            </div>

            <div className="flex flex-none items-center gap-2">
                <StatusDot status="nominal" />
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ds-fg-muted)]">
                    {shift.label}
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ds-fg-subtle)]">
                    {shift.range}
                </span>
            </div>

            <MetaStrip items={metaItems} />

            <button
                type="button"
                onClick={onDrawerToggle}
                aria-expanded={drawerOpen}
                aria-controls={drawerControlsId}
                aria-label={drawerOpen ? "Collapse chat drawer" : "Expand chat drawer"}
                className="inline-flex h-8 flex-none items-center gap-1.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] px-2 text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-fg-primary)] focus-visible:border-[var(--ds-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-accent)]"
            >
                <DrawerIcon className="size-4" />
                <KbdKey className="ml-1">⌘K</KbdKey>
            </button>
        </header>
    );
}
