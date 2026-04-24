import { useEffect, useState } from "react";
import { EquipmentPicker } from "../../features/control-room";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { Icons, StatusDot, ThemeToggle } from "../ui";

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
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-5 border-b border-border bg-background px-4">
            <EquipmentPicker selection={selection} onChange={onSelectionChange} />

            <div className="min-w-0 flex-1" data-kpi-slot>
                {kpiSlot}
            </div>

            <div className="flex flex-none items-center gap-2 text-sm">
                <StatusDot status="nominal" />
                <span className="font-medium text-foreground">{shift.label}</span>
                <span className="text-text-tertiary">{shift.range}</span>
            </div>

            <ThemeToggle />

            <button
                type="button"
                onClick={onDrawerToggle}
                aria-expanded={drawerOpen}
                aria-controls={drawerControlsId}
                aria-label={drawerOpen ? "Collapse chat drawer" : "Expand chat drawer"}
                className="inline-flex h-8 flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-muted-foreground transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <DrawerIcon className="size-4" />
            </button>
        </header>
    );
}
