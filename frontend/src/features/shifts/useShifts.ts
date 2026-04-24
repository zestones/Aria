/**
 * TanStack Query wrappers for the Shifts feature.
 *
 * - {@link useCurrentShift}         — `/shifts/current`; header + time-remaining.
 * - {@link useRotaAssignments}      — today + next N days, one request per day
 *   (the backend takes a single `assigned_date` param). Fan-out is cheap and
 *   keeps the server handler dumb.
 * - {@link useShiftActivity}        — derives "this shift" counters from the
 *   existing `useWorkOrders` + `useLogbookEntries` queries so the panel does
 *   not introduce a fourth telemetry source.
 * - {@link useShiftLogbook}         — logbook entries inside a time window,
 *   thin wrapper around `listLogbookEntries`.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import { type LogbookEntry, listLogbookEntries } from "../../services/logbook";
import {
    type CurrentShift,
    getCurrentShift,
    listShiftAssignments,
    type ShiftAssignment,
} from "../../services/shift";
import { isoDateOffsetDays } from "./utils";

/** Cadence fast enough to flip when a shift boundary crosses live. */
const CURRENT_SHIFT_REFETCH_MS = 60_000;

export function useCurrentShift() {
    return useQuery<CurrentShift>({
        queryKey: ["shift", "current"],
        queryFn: getCurrentShift,
        staleTime: 30_000,
        refetchInterval: CURRENT_SHIFT_REFETCH_MS,
    });
}

export interface RotaDay {
    isoDate: string;
    assignments: ShiftAssignment[];
    isLoading: boolean;
    isError: boolean;
}

/**
 * Fetch shift assignments for today + `daysAhead` following days. We do
 * one query per date so TanStack caches per-day and we avoid a backend
 * change to accept a date range. `daysAhead=3` → 4 days total.
 */
export function useRotaAssignments(daysAhead: number = 3): RotaDay[] {
    const dates: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
        dates.push(isoDateOffsetDays(i));
    }
    const results = useQueries({
        queries: dates.map((isoDate) => ({
            queryKey: ["shift", "assignments", isoDate] as const,
            queryFn: () => listShiftAssignments({ assigned_date: isoDate }),
            staleTime: 60_000,
        })),
    });
    return dates.map((isoDate, idx) => {
        const r = results[idx];
        return {
            isoDate,
            assignments: r.data ?? [],
            isLoading: r.isLoading,
            isError: r.isError,
        };
    });
}

export interface ShiftLogbookParams {
    windowStart: string | null;
    limit?: number;
}

export function useShiftLogbook({ windowStart, limit = 200 }: ShiftLogbookParams) {
    return useQuery<LogbookEntry[]>({
        queryKey: ["shift", "logbook", windowStart, limit],
        queryFn: () =>
            listLogbookEntries({
                window_start: windowStart ?? undefined,
                limit,
            }),
        staleTime: 30_000,
        // Null window means we are still resolving the current shift — skip.
        enabled: windowStart !== null,
    });
}
