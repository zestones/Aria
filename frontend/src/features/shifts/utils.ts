/**
 * Shared formatters + window math for the Shifts feature.
 *
 * All of this is local to the feature so no other surface picks up
 * shift-specific formatting helpers by mistake.
 */

import type { CurrentShift, Shift, ShiftAssignment } from "../../services/shift";

/** "06:00:00" → "06:00". Accepts partial inputs defensively. */
export function formatShiftTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    // Backend emits `HH:MM:SS`. We only ever need the `HH:MM` prefix.
    return iso.slice(0, 5);
}

export function formatShiftRange(shift: Shift | null | undefined): string {
    if (!shift) return "—";
    return `${formatShiftTime(shift.start_time)} → ${formatShiftTime(shift.end_time)}`;
}

/**
 * Compute the UTC instant at which the current shift began, using the
 * backend's `server_time` as the "now" anchor so the Shift page stays
 * coherent even when the operator's laptop clock drifts from the plant clock.
 *
 * Handles the overnight case: a shift like `22:00 → 06:00` started the day
 * before when `server_time` is past midnight.
 */
export function computeShiftStart(current: CurrentShift | undefined): Date | null {
    if (!current?.shift) return null;
    const server = new Date(current.server_time);
    if (Number.isNaN(server.getTime())) return null;

    const [sh, sm] = current.shift.start_time.split(":").map((s) => Number.parseInt(s, 10));
    const [eh, em] = current.shift.end_time.split(":").map((s) => Number.parseInt(s, 10));
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return null;

    const start = new Date(server);
    start.setUTCHours(sh, sm, 0, 0);

    const wraps = eh < sh || (eh === sh && em <= sm);
    // Overnight shift that has already wrapped past midnight: the shift
    // actually started yesterday.
    const pastWrap =
        wraps &&
        (server.getUTCHours() < sh || (server.getUTCHours() === sh && server.getUTCMinutes() < sm));
    if (pastWrap) start.setUTCDate(start.getUTCDate() - 1);
    return start;
}

/** Same as {@link computeShiftStart} but returns the end-of-shift instant. */
export function computeShiftEnd(current: CurrentShift | undefined): Date | null {
    const start = computeShiftStart(current);
    if (!start || !current?.shift) return null;
    const [sh, sm] = current.shift.start_time.split(":").map((s) => Number.parseInt(s, 10));
    const [eh, em] = current.shift.end_time.split(":").map((s) => Number.parseInt(s, 10));
    const end = new Date(start);
    // Overnight shift (end <= start as time-of-day) wraps by 24h.
    const wraps = eh < sh || (eh === sh && em <= sm);
    end.setUTCHours(eh, em, 0, 0);
    if (wraps) end.setUTCDate(end.getUTCDate() + 1);
    return end;
}

/**
 * Return a compact "Xh Ym remaining" / "just started" / "ending now" label
 * for the running shift. `nowMs` is parameterised for testability.
 */
export function formatTimeRemaining(
    current: CurrentShift | undefined,
    nowMs: number = Date.now(),
): string {
    const end = computeShiftEnd(current);
    if (!end) return "—";
    const deltaMs = end.getTime() - nowMs;
    if (deltaMs <= 0) return "shift ended";
    const deltaMin = Math.round(deltaMs / 60_000);
    if (deltaMin < 2) return "ending now";
    if (deltaMin < 60) return `${deltaMin}m remaining`;
    const h = Math.floor(deltaMin / 60);
    const m = deltaMin % 60;
    return m === 0 ? `${h}h remaining` : `${h}h ${m}m remaining`;
}

/** First matching assignment's operator name, with graceful fallback. */
export function pickOperator(assignments: ShiftAssignment[]): {
    fullName: string | null;
    username: string | null;
} {
    const first = assignments.find((a) => a.full_name || a.username) ?? null;
    return {
        fullName: first?.full_name ?? null,
        username: first?.username ?? null,
    };
}

export function operatorDisplay(assignments: ShiftAssignment[]): string {
    const picked = pickOperator(assignments);
    return picked.fullName ?? picked.username ?? "Unassigned";
}

export function formatRotaDate(iso: string, nowMs: number = Date.now()): string {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    const today = new Date(nowMs);
    today.setUTCHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
    });
}

/** ISO date (YYYY-MM-DD) for a given offset from now, anchored in UTC. */
export function isoDateOffsetDays(offsetDays: number, fromMs: number = Date.now()): string {
    const d = new Date(fromMs);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

export function formatLogbookTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}
