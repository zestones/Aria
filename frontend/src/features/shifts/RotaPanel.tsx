/**
 * Rota panel — who is on each shift for today + the next few days.
 *
 * The server exposes `GET /shifts/assignments?assigned_date=YYYY-MM-DD`
 * (single-date), so this panel fans out one query per day via
 * {@link useRotaAssignments}. Each day becomes one row; within a row
 * we group the assignments by shift_id so the three shifts line up in
 * the same cell order day over day.
 */

import { useMemo } from "react";
import { Card, Hairline, Icons } from "../../components/ui";
import type { ShiftAssignment } from "../../services/shift";
import { type RotaDay, useRotaAssignments } from "./useShifts";
import { formatRotaDate, formatShiftTime } from "./utils";

interface RotaPanelProps {
    /** Number of future days to include *after* today. Default 3 → 4 rows. */
    daysAhead?: number;
}

interface ShiftColumn {
    shiftId: number;
    shiftName: string;
    startTime: string;
    endTime: string;
}

/**
 * Derive a stable column order from the union of shifts we have seen
 * across all queried days, sorted by start time. A plant with three
 * shifts per day produces three columns; a plant with a single shift
 * produces one.
 */
function collectShiftColumns(days: RotaDay[]): ShiftColumn[] {
    const byId = new Map<number, ShiftColumn>();
    for (const day of days) {
        for (const a of day.assignments) {
            if (byId.has(a.shift_id)) continue;
            byId.set(a.shift_id, {
                shiftId: a.shift_id,
                shiftName: a.shift_name ?? `Shift #${a.shift_id}`,
                // The assignment row doesn't carry start/end, so we leave them
                // blank and rely on the column header's shift name.
                startTime: "",
                endTime: "",
            });
        }
    }
    return [...byId.values()].sort((a, b) => a.shiftName.localeCompare(b.shiftName));
}

function assignmentsByShift(assignments: ShiftAssignment[], shiftId: number): ShiftAssignment[] {
    return assignments.filter((a) => a.shift_id === shiftId);
}

function operatorLabel(assignments: ShiftAssignment[]): string {
    if (assignments.length === 0) return "Unassigned";
    const names = new Set<string>();
    for (const a of assignments) {
        const name = a.full_name ?? a.username;
        if (name) names.add(name);
    }
    if (names.size === 0) return "Unassigned";
    return [...names].join(", ");
}

export function RotaPanel({ daysAhead = 3 }: RotaPanelProps = {}) {
    const days = useRotaAssignments(daysAhead);
    const columns = useMemo(() => collectShiftColumns(days), [days]);
    const isLoadingAny = days.some((d) => d.isLoading);
    const hasAny = days.some((d) => d.assignments.length > 0);

    return (
        <Card padding="lg">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Rota
                    </div>
                    <h3 className="text-base font-medium tracking-[-0.01em] text-foreground">
                        Who is on duty
                    </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icons.Users className="size-3.5" aria-hidden /> Next {daysAhead + 1} days
                </span>
            </div>
            <Hairline />

            {isLoadingAny && !hasAny ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Icons.Loader2 className="size-4 animate-spin" aria-hidden /> Loading rota…
                </div>
            ) : columns.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">
                    No shift assignments in the window.
                </div>
            ) : (
                <div className="mt-3 overflow-x-auto">
                    <table
                        className="w-full min-w-[520px] border-separate"
                        style={{ borderSpacing: 0 }}
                    >
                        <thead>
                            <tr>
                                <th className="pb-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Day
                                </th>
                                {columns.map((col) => (
                                    <th
                                        key={col.shiftId}
                                        className="pb-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                                    >
                                        {col.shiftName}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((day) => (
                                <tr key={day.isoDate} className="border-t border-border-muted">
                                    <td className="py-3 pr-3 align-top font-mono text-xs text-foreground">
                                        {formatRotaDate(day.isoDate)}
                                        <div className="font-mono text-[10px] text-muted-foreground">
                                            {day.isoDate}
                                        </div>
                                    </td>
                                    {columns.map((col) => {
                                        const rows = assignmentsByShift(
                                            day.assignments,
                                            col.shiftId,
                                        );
                                        return (
                                            <td
                                                key={col.shiftId}
                                                className="py-3 pr-3 align-top text-sm text-foreground"
                                            >
                                                {rows.length === 0 ? (
                                                    <span className="text-muted-foreground">—</span>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>{operatorLabel(rows)}</span>
                                                        {rows[0]?.cell_name && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {rows
                                                                    .map((r) => r.cell_name)
                                                                    .filter(Boolean)
                                                                    .join(" · ")}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// Tiny helper exported for tests.
export { formatShiftTime };
