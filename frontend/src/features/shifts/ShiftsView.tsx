/**
 * Top-level composition for the Shifts page.
 *
 * Layout (mirrors `docs/planning/M9-polish-e2e/demo-plant-design.md §9`):
 *   ┌─────────────────────────────────────────────┐
 *   │ Section header (page title)                │
 *   │ ─────────────────────────────────────────── │
 *   │ Shift header  (current shift + operator)    │
 *   │ Rota panel    (today + next days)           │
 *   │ Activity panel (this shift so far)          │
 *   │ Logbook panel (last 48h, shift-segmented)   │
 *   └─────────────────────────────────────────────┘
 *
 * All data is read-only — authoring surfaces remain on `/logbook`.
 */

import { useMemo } from "react";
import { SectionHeader } from "../../components/ui";
import { RotaPanel } from "./RotaPanel";
import { ShiftActivityPanel } from "./ShiftActivityPanel";
import { ShiftHeader } from "./ShiftHeader";
import { ShiftLogbookPanel } from "./ShiftLogbookPanel";
import { useCurrentShift, useShiftLogbook } from "./useShifts";
import { computeShiftStart } from "./utils";

const LOGBOOK_WINDOW_HOURS = 48;

export function ShiftsView() {
    const current = useCurrentShift();
    const shiftStart = useMemo(() => computeShiftStart(current.data), [current.data]);

    // Reading window for the logbook panel: the last 48 h — *not* only
    // the current shift — so we can show a "earlier" section for context.
    const windowStart = useMemo(() => {
        // Anchor to the backend's `server_time` when available so we stay in
        // sync with the plant clock, not the browser clock.
        const anchor = current.data?.server_time
            ? new Date(current.data.server_time).getTime()
            : Date.now();
        return new Date(anchor - LOGBOOK_WINDOW_HOURS * 3600_000).toISOString();
    }, [current.data?.server_time]);

    const logbook = useShiftLogbook({ windowStart });

    return (
        <main className="flex min-h-0 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-1">
                <SectionHeader label="Shifts" size="lg" />
                <p className="text-sm text-muted-foreground">
                    Current shift, rota, and what the operators have been noting.
                </p>
            </div>
            <ShiftHeader
                data={current.data}
                isLoading={current.isLoading}
                isError={current.isError}
            />
            <ShiftActivityPanel
                shiftStart={shiftStart}
                logbookEntries={logbook.data}
                isLogbookLoading={logbook.isLoading}
            />
            <RotaPanel daysAhead={3} />
            <ShiftLogbookPanel
                shiftStart={shiftStart}
                entries={logbook.data}
                isLoading={logbook.isLoading}
                isError={logbook.isError}
            />
        </main>
    );
}
