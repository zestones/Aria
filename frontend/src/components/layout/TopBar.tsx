import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EquipmentPicker } from "../../features/control-room";
import { useCurrentShift } from "../../features/shifts/useShifts";
import { formatShiftRange, operatorDisplay } from "../../features/shifts/utils";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { Icons, StatusDot } from "../ui";

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
    /** Toggle the full-screen Agent Constellation overlay (hotkey `A`). */
    onConstellationToggle?: () => void;
}

/**
 * Top app chrome — sits flush against the sidebar (same `bg-sidebar` surface)
 * so the entire chrome reads as one continuous strip.
 *
 * Right-edge controls, in order, are scoped from "ambient" → "intent":
 *   shift + theme  ·  Constellation (overlay)  ·  Ask ARIA (primary copilot CTA)
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
    onConstellationToggle,
}: TopBarProps) {
    const navigate = useNavigate();
    const current = useCurrentShift();
    const SidebarIcon = sidebarCollapsed ? Icons.PanelLeftOpen : Icons.PanelLeftClose;

    // Re-run when the route changes — referenced so the linter doesn't
    // strip the dep. (Previously toggled the Activity overlay; kept as a
    // safe no-op hook to avoid surprising future additions.)
    const { pathname } = useLocation();
    useEffect(() => {
        void pathname;
    }, [pathname]);

    const shift = current.data?.shift ?? null;
    const shiftLabel = shift?.name ?? "No shift";
    const shiftRange = shift ? formatShiftRange(shift) : "—";
    const operatorName = current.data ? operatorDisplay(current.data.assignments) : null;
    const pillTitle = shift
        ? operatorName
            ? `${shift.name} · ${shiftRange} · ${operatorName}`
            : `${shift.name} · ${shiftRange}`
        : "No shift currently active";

    return (
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-sidebar-border/40 bg-sidebar pl-2 pr-3">
            {/* Left chrome — sidebar toggle + context */}
            <button
                type="button"
                onClick={() => {
                    onSidebarToggle();
                }}
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

            {/* Right chrome — shift pill is clickable, navigates to /shifts.
                Source of truth is `/shifts/current` (same hook the Shifts page
                uses) so the pill and the page never disagree. */}
            <button
                type="button"
                onClick={() => navigate("/shifts")}
                title={pillTitle}
                aria-label={`Open shifts page — ${pillTitle}`}
                className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
                <StatusDot status="nominal" />
                <span className="font-medium">{shiftLabel}</span>
                <span className="text-sidebar-muted-foreground">{shiftRange}</span>
                {operatorName && (
                    <span className="hidden text-sidebar-muted-foreground sm:inline">
                        · {operatorName}
                    </span>
                )}
            </button>
            {onConstellationToggle && (
                <button
                    type="button"
                    onClick={onConstellationToggle}
                    aria-label="Open agent constellation (A)"
                    title="Agent constellation (A)"
                    className={ChromeButton}
                >
                    <Icons.Sparkles className="size-4" aria-hidden />
                </button>
            )}
            <CopilotToggle
                open={drawerOpen}
                onClick={() => {
                    onDrawerToggle();
                }}
                controlsId={drawerControlsId}
            />
        </header>
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
