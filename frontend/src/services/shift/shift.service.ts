/**
 * Shift service — current production shift + rota assignments.
 *
 * Mirrors `backend/modules/shift/schemas.py`:
 *   - `ShiftOut`             → {@link Shift}
 *   - `ShiftAssignmentOut`   → {@link ShiftAssignment}
 *   - `CurrentShiftDTO`      → {@link CurrentShift}
 *
 * The list endpoint accepts `assigned_date`, `cell_id`, and `user_id` as
 * individual query params — callers that need a range issue one request per
 * date and compose the results client-side (see
 * `features/shifts/useShifts.ts`).
 */

import { apiFetch } from "../../lib/api";

export interface Shift {
    id: number;
    name: string;
    /** Time-only ISO string, e.g. `"06:00:00"`. */
    start_time: string;
    /** Time-only ISO string, e.g. `"14:00:00"`. */
    end_time: string;
    created_at: string;
}

export interface ShiftAssignment {
    id: number;
    shift_id: number;
    shift_name?: string;
    user_id: number;
    username?: string;
    full_name?: string;
    cell_id?: number;
    cell_name?: string;
    /** ISO date, e.g. `"2026-04-24"`. */
    assigned_date: string;
    created_at: string;
}

export interface CurrentShift {
    shift: Shift | null;
    assignments: ShiftAssignment[];
    /** Backend's view of `NOW()` at the moment of the request, UTC ISO. */
    server_time: string;
}

export interface ShiftAssignmentsQuery {
    assigned_date?: string;
    cell_id?: number;
    user_id?: number;
}

export function listShifts(): Promise<Shift[]> {
    return apiFetch<Shift[]>("/shifts");
}

export function getCurrentShift(): Promise<CurrentShift> {
    return apiFetch<CurrentShift>("/shifts/current");
}

export function listShiftAssignments(
    query: ShiftAssignmentsQuery = {},
): Promise<ShiftAssignment[]> {
    return apiFetch<ShiftAssignment[]>("/shifts/assignments", { params: { ...query } });
}
