/**
 * KPI bar — four compact live tiles rendered inside the TopBar kpi slot.
 * M7.2 (#41).
 *
 * Tiles: OEE % (with 24h sparkline), MTBF, MTTR, Anomalies 24h. Data arrives
 * via `useKpiData`, which consolidates four TanStack queries on a 15 s refresh
 * cycle. Each tile briefly outlines itself in accent when its numeric value
 * changes — a calm, CSS-only flash (no shimmer, no count-up animation).
 *
 * Scope discipline:
 *  - Respects DESIGN_PLAN v2 §9 anti-patterns (no skeleton, no shimmer,
 *    no glow, no gradient, no backdrop blur, no emoji).
 *  - Uses tokens exclusively (zero hex).
 *  - No new dependency. Sparkline is a local SVG helper.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { StatusDot } from "../../components/ui";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { Sparkline } from "./Sparkline";
import { useKpiData } from "./useKpiData";

const FLASH_MS = 300;

export interface KpiBarProps {
    selection: EquipmentSelection | null;
}

export function KpiBar({ selection }: KpiBarProps) {
    const data = useKpiData(selection?.cellId ?? null);

    return (
        <section
            className="flex h-full min-w-0 items-center gap-4 sm:gap-5 md:gap-6 overflow-hidden"
            aria-label="Key performance indicators"
            data-kpi-bar=""
        >
            <KpiTile
                label="OEE"
                value={formatOee(data.oee.value)}
                rawValue={data.oee.value}
                isLoading={data.oee.isLoading}
                isError={data.oee.isError}
                sparkline={
                    <Sparkline
                        values={data.oee.trend ?? undefined}
                        aria-label="OEE trend last 24h"
                    />
                }
                data-kpi="oee"
            />
            <KpiTile
                label="MTBF"
                value={formatDuration(data.mtbf.value, "hours")}
                rawValue={data.mtbf.value}
                isLoading={data.mtbf.isLoading}
                isError={data.mtbf.isError}
                className="hidden lg:flex"
                data-kpi="mtbf"
            />
            <KpiTile
                label="MTTR"
                value={formatDuration(data.mttr.value, "minutes")}
                rawValue={data.mttr.value}
                isLoading={data.mttr.isLoading}
                isError={data.mttr.isError}
                className="hidden lg:flex"
                data-kpi="mttr"
            />
            <KpiTile
                label="Anomalies 24h"
                value={formatCount(data.anomalies.value)}
                rawValue={data.anomalies.value}
                isLoading={data.anomalies.isLoading}
                isError={data.anomalies.isError}
                data-kpi="anomalies"
            />
        </section>
    );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface KpiTileProps {
    label: string;
    value: string;
    rawValue: number | null;
    isLoading: boolean;
    isError: boolean;
    sparkline?: ReactNode;
    className?: string;
    "data-kpi": string;
}

function KpiTile({
    label,
    value,
    rawValue,
    isLoading,
    isError,
    sparkline,
    className = "",
    "data-kpi": dataKpi,
}: KpiTileProps) {
    const flashing = useFlashOnChange(rawValue);

    let state: "loading" | "error" | "ready" = "ready";
    if (isError) state = "error";
    else if (isLoading || rawValue == null) state = "loading";

    const displayValue = state === "ready" ? value : "—";

    return (
        <div
            className={`flex min-w-0 flex-none items-center gap-2.5 rounded-[var(--ds-radius-sm)] px-1.5 py-1 ${className}`}
            data-kpi={dataKpi}
            data-kpi-state={state}
            data-flashing={flashing ? "true" : undefined}
            style={{
                outline: flashing ? "1px solid var(--ds-accent)" : "1px solid transparent",
                outlineOffset: "1px",
                transition: `outline-color var(--ds-motion-fast) var(--ds-ease-out)`,
            }}
        >
            <div className="flex min-w-0 flex-col leading-none">
                <span className="flex items-center gap-1 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                    {label}
                    {state === "error" && (
                        <StatusDot status="critical" size={4} aria-label={`${label} unavailable`} />
                    )}
                </span>
                <span
                    className="mt-1 font-medium tabular-nums text-[var(--ds-fg-primary)]"
                    style={{
                        fontFamily: "var(--ds-font-mono)",
                        fontSize: "var(--ds-text-md)",
                        lineHeight: 1.1,
                    }}
                >
                    {displayValue}
                </span>
            </div>
            {sparkline ? (
                <span className="flex-none" aria-hidden={state !== "ready"}>
                    {state === "ready" ? (
                        sparkline
                    ) : (
                        <span style={{ display: "inline-block", width: 60, height: 20 }} />
                    )}
                </span>
            ) : null}
        </div>
    );
}

/**
 * Toggles `flashing` for FLASH_MS whenever `value` changes between renders.
 * Skips the initial mount so we don't flash for steady-state reads.
 */
function useFlashOnChange(value: number | null): boolean {
    const [flashing, setFlashing] = useState(false);
    const prevRef = useRef<number | null | undefined>(undefined);

    useEffect(() => {
        const prev = prevRef.current;
        prevRef.current = value;
        // First observation — no flash.
        if (prev === undefined) return;
        if (prev === value) return;
        // Only flash once both samples are real numbers; arriving-from-loading
        // would feel like decorative motion on first paint.
        if (prev == null || value == null) return;

        setFlashing(true);
        const id = window.setTimeout(() => setFlashing(false), FLASH_MS);
        return () => window.clearTimeout(id);
    }, [value]);

    return flashing;
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

export function formatOee(pct: number | null): string {
    if (pct == null || !Number.isFinite(pct)) return "—";
    return `${pct.toFixed(1)}%`;
}

export function formatDuration(seconds: number | null, preferred: "hours" | "minutes"): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
    if (seconds === 0) return preferred === "hours" ? "0h" : "0min";

    const totalMinutes = seconds / 60;
    const totalHours = totalMinutes / 60;

    if (preferred === "hours") {
        // MTBF: `142h` until a full week, then switch to `Nd Mh`.
        if (totalHours >= 168) {
            const days = Math.floor(totalHours / 24);
            const hours = Math.floor(totalHours - days * 24);
            return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        }
        if (totalHours >= 1) {
            return `${Math.round(totalHours)}h`;
        }
        const mins = Math.max(1, Math.round(totalMinutes));
        return `${mins}min`;
    }

    // MTTR — prefer minutes.
    if (totalHours >= 1) {
        const hours = Math.floor(totalHours);
        const mins = Math.round(totalMinutes - hours * 60);
        return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    const mins = Math.max(1, Math.round(totalMinutes));
    return `${mins}min`;
}

export function formatCount(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return "—";
    return `${Math.round(n)}`;
}
