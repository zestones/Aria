import { useEffect, useState } from "react";
import { ActivityFeed } from "../../features/agents";
import { EquipmentPicker } from "../../features/control-room";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { Drawer, Icons, StatusDot, ThemeToggle } from "../ui";

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
    sidebarCollapsed: boolean;
    onSidebarToggle: () => void;
    /** Placeholder slot for KpiBar — wired in M7.2. */
    kpiSlot?: React.ReactNode;
}

/**
 * Top app chrome — sits flush against the sidebar (same `bg-sidebar` surface)
 * so the entire chrome reads as one continuous strip.
 *
 * Right-edge controls, in order, are scoped from "ambient" → "intent":
 *   shift + theme  ·  Activity (overlay)  ·  Ask ARIA (primary copilot CTA)
 *
 * The chat toggle is intentionally a labelled pill (not an icon) so judges
 * understand at a glance there is a copilot to talk to — fixing the audit's
 * §4.3 finding that nothing in the chrome telegraphs ARIA's agentic nature.
 */
export function TopBar({
    selection,
    onSelectionChange,
    drawerOpen,
    drawerControlsId,
    onDrawerToggle,
    sidebarCollapsed,
    onSidebarToggle,
    kpiSlot,
}: TopBarProps) {
    const shift = useShift();
    const [activityOpen, setActivityOpen] = useState(false);
    const SidebarIcon = sidebarCollapsed ? Icons.PanelLeftOpen : Icons.PanelLeftClose;

    return (
        <>
            <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-sidebar-border/40 bg-sidebar pl-2 pr-3">
                {/* Left chrome — sidebar toggle + context */}
                <button
                    type="button"
                    onClick={onSidebarToggle}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-pressed={!sidebarCollapsed}
                    title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className={ChromeButton}
                >
                    <SidebarIcon className="size-4" aria-hidden />
                </button>
                <div aria-hidden className="h-5 w-px bg-sidebar-border/60" />

                <EquipmentPicker selection={selection} onChange={onSelectionChange} />

                <div className="min-w-0 flex-1" data-kpi-slot>
                    {kpiSlot}
                </div>

                {/* Right chrome */}
                <div className="flex flex-none items-center gap-1.5 text-sm">
                    <StatusDot status="nominal" />
                    <span className="font-medium text-sidebar-foreground">{shift.label}</span>
                    <span className="text-sidebar-muted-foreground">{shift.range}</span>
                </div>
                <div aria-hidden className="h-5 w-px bg-sidebar-border/60" />
                <ThemeToggle />
                <button
                    type="button"
                    onClick={() => setActivityOpen(true)}
                    aria-label="Show agent activity"
                    title="Agent activity"
                    className={ChromeButton}
                >
                    <Icons.Activity className="size-4" aria-hidden />
                </button>
                <CopilotToggle
                    open={drawerOpen}
                    onClick={onDrawerToggle}
                    controlsId={drawerControlsId}
                />
            </header>

            <Drawer
                open={activityOpen}
                onClose={() => setActivityOpen(false)}
                side="right"
                width={380}
                overlay
            >
                <ActivityFeed />
            </Drawer>
        </>
    );
}

interface CopilotToggleProps {
    open: boolean;
    onClick: () => void;
    controlsId: string;
}

/**
 * Primary copilot CTA. Ink-on-cream pill in the resting state so it reads
 * as the page's main action; flips to an outlined "open" treatment when the
 * drawer is already visible, so the same control communicates state without
 * needing a second redundant button inside the chat panel.
 */
function CopilotToggle({ open, onClick, controlsId }: CopilotToggleProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-controls={controlsId}
            aria-label={open ? "Hide ARIA copilot" : "Open ARIA copilot"}
            className={
                open
                    ? "inline-flex h-8 flex-none items-center gap-1.5 rounded-cta border border-sidebar-border bg-sidebar-accent px-3 text-sm font-medium tracking-[-0.01em] text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    : "inline-flex h-8 flex-none items-center gap-1.5 rounded-cta bg-primary px-3 text-sm font-medium tracking-[-0.01em] text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
        >
            <Icons.Sparkles className="size-3.5" aria-hidden />
            <span>Ask ARIA</span>
        </button>
    );
}

// Shared ghost-square button class for utility chrome icons.
const ChromeButton = [
    "inline-flex h-8 w-8 flex-none items-center justify-center rounded-md",
    "text-sidebar-muted-foreground transition-colors duration-150",
    "hover:bg-sidebar-accent hover:text-sidebar-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
].join(" ");
