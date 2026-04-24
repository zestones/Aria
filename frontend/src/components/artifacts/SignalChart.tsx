/**
 * SignalChart — M8.1 real artifact + predictive forecast overlay.
 *
 * Renders a live time-series area chart for a signal definition and a
 * forward-looking projection derived from a simple linear regression on the
 * tail of the series. The projection is rendered as a dashed line extending
 * past "now", and — when a threshold is present — the card displays the
 * estimated time until the threshold is crossed.
 *
 * - Pulls `{display_name, unit_name}` once (staleTime: Infinity — definitions
 *   are quasi-static) and series data every 30 s (matches the telemetry beat).
 * - Downsamples to 200 points client-side so Recharts stays responsive on
 *   long windows (hacks of 86 k points at 1 Hz are not useful in a tooltip).
 * - Tokens only (DS vars). No drop-shadow, no glow, no animation loop —
 *   DESIGN_PLAN_v2 §9 anti-patterns.
 */

import { useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import {
    Area,
    AreaChart,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    getSignalData,
    getSignalDefinition,
    type SignalDefinition,
    type SignalPoint,
} from "../../services/signals";
import type { SignalChartProps } from "./schemas";

// ---------- Helpers ----------

/** Keeps at most `maxPoints` by strided downsampling. */
function downsample<T>(arr: T[], maxPoints = 200): T[] {
    if (arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    return arr.filter((_, i) => i % step === 0);
}

function formatTimeLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatTooltipTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatValue(v: number): string {
    // 3 significant digits is enough for operator context.
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 100) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

function findValueAtTime(series: SignalPoint[] | undefined, iso: string): number | null {
    if (!series || series.length === 0) return null;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return null;
    let best: SignalPoint | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const p of series) {
        const t = new Date(p.time).getTime();
        if (Number.isNaN(t)) continue;
        const delta = Math.abs(t - target);
        if (delta < bestDelta) {
            best = p;
            bestDelta = delta;
        }
    }
    return best ? best.raw_value : null;
}

function formatEtaBadge(hours: number): string {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
    return `${(hours / 24).toFixed(hours < 24 * 10 ? 1 : 0)} days`;
}

// ---------- Forecast (linear regression on the tail) ----------

interface ForecastPoint {
    time: string;
    raw_value: number | null;
    projected_value: number | null;
}

interface Forecast {
    combined: (SignalPoint | ForecastPoint)[];
    etaHours: number | null;
    trend: "rising" | "falling" | "flat";
    horizonHours: number;
    lastRealTime: string | null;
}

function computeForecast(
    series: SignalPoint[],
    threshold: number | undefined,
    windowHours: number,
): Forecast {
    const horizonHours = Math.min(12, Math.max(1, windowHours * 0.5));

    // Inject `projected_value: null` on every real point so Recharts can graph
    // the projected Area over the same dataset.
    const realPoints: ForecastPoint[] = series.map((p) => ({
        time: p.time,
        raw_value: p.raw_value,
        projected_value: null,
    }));

    if (series.length < 10) {
        return {
            combined: realPoints,
            etaHours: null,
            trend: "flat",
            horizonHours,
            lastRealTime: series.at(-1)?.time ?? null,
        };
    }

    // Use the last ~30% of the series (minimum 5 points) to estimate slope.
    const tailCount = Math.max(5, Math.floor(series.length * 0.3));
    const tail = series.slice(-tailCount);
    const t0 = new Date(tail[0].time).getTime();
    if (Number.isNaN(t0)) {
        return {
            combined: realPoints,
            etaHours: null,
            trend: "flat",
            horizonHours,
            lastRealTime: series.at(-1)?.time ?? null,
        };
    }

    // Simple ordinary least squares: y = slope * x + intercept (x in hours).
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let n = 0;
    for (const p of tail) {
        const t = new Date(p.time).getTime();
        if (Number.isNaN(t) || !Number.isFinite(p.raw_value)) continue;
        const x = (t - t0) / (1000 * 60 * 60);
        const y = p.raw_value;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
        n += 1;
    }
    const denom = n * sumXX - sumX * sumX;
    if (n < 3 || Math.abs(denom) < 1e-9) {
        return {
            combined: realPoints,
            etaHours: null,
            trend: "flat",
            horizonHours,
            lastRealTime: series.at(-1)?.time ?? null,
        };
    }
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const lastReal = series.at(-1) ?? null;
    if (!lastReal) {
        return {
            combined: realPoints,
            etaHours: null,
            trend: "flat",
            horizonHours,
            lastRealTime: null,
        };
    }
    const lastT = new Date(lastReal.time).getTime();
    const lastX = (lastT - t0) / (1000 * 60 * 60);
    const lastProjected = slope * lastX + intercept;

    // Determine "noteworthy" trend: > 1% of last value per hour of drift.
    const driftScale = Math.max(1e-6, Math.abs(lastReal.raw_value) * 0.01);
    const trend: Forecast["trend"] =
        Math.abs(slope) < driftScale ? "flat" : slope > 0 ? "rising" : "falling";

    // Generate 20 projected steps into the future.
    const steps = 20;
    const projected: ForecastPoint[] = [];
    for (let i = 1; i <= steps; i++) {
        const hOffset = (horizonHours * i) / steps;
        const projTimeMs = lastT + hOffset * 3600 * 1000;
        const projValue = lastProjected + slope * hOffset;
        projected.push({
            time: new Date(projTimeMs).toISOString(),
            raw_value: null,
            projected_value: projValue,
        });
    }

    // Seam point: make the last real point also carry `projected_value` so the
    // two series visually connect without a gap at "now".
    if (realPoints.length > 0) {
        const seam = realPoints[realPoints.length - 1];
        realPoints[realPoints.length - 1] = {
            ...seam,
            projected_value: lastProjected,
        };
    }

    // ETA to threshold: linear solve lastProjected + slope * t = threshold.
    let etaHours: number | null = null;
    if (threshold !== undefined && Math.abs(slope) > 1e-9) {
        const delta = threshold - lastProjected;
        const t = delta / slope;
        const sameDirection = Math.sign(delta) === Math.sign(slope);
        if (sameDirection && t > 0 && t < horizonHours * 6) {
            etaHours = t;
        }
    }

    return {
        combined: [...realPoints, ...projected],
        etaHours,
        trend,
        horizonHours,
        lastRealTime: lastReal.time,
    };
}

// ---------- Fetchers ----------

function fetchSignalDef(id: number): Promise<SignalDefinition> {
    return getSignalDefinition(id);
}

function fetchSignalData(id: number, windowHours: number): Promise<SignalPoint[]> {
    const end = new Date();
    const start = new Date(end.getTime() - windowHours * 3600 * 1000);
    return getSignalData(id, {
        window_start: start.toISOString(),
        window_end: end.toISOString(),
    });
}

// ---------- Tooltip ----------

interface TooltipPayloadItem {
    payload?: ForecastPoint;
    value?: number;
    dataKey?: string;
}
interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    unitName?: string | null;
}

function CustomTooltip({ active, payload, unitName }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const isProjected = point.raw_value === null && point.projected_value !== null;
    const displayValue = isProjected ? point.projected_value : point.raw_value;
    if (displayValue === null || displayValue === undefined) return null;
    return (
        <div className="rounded-md border border-border bg-muted px-2 py-1.5 text-xs shadow-card">
            <div className="font-mono text-muted-foreground">{formatTooltipTime(point.time)}</div>
            <div className="mt-0.5 text-foreground">
                <span className="font-mono">{formatValue(displayValue)}</span>
                {unitName ? <span className="ml-1 text-muted-foreground">{unitName}</span> : null}
                {isProjected && (
                    <span
                        className="ml-2 text-[10px] uppercase tracking-widest"
                        style={{ color: "var(--text-tertiary)" }}
                    >
                        projected
                    </span>
                )}
            </div>
        </div>
    );
}

// ---------- Main component ----------

export function SignalChart(props: SignalChartProps) {
    const { cell_id, signal_def_id, window_hours = 24, mark_anomaly_at, threshold } = props;

    const gradientId = useId();
    const projectedGradientId = useId();

    const { data: definition } = useQuery<SignalDefinition>({
        queryKey: ["signal-def", signal_def_id],
        queryFn: () => fetchSignalDef(signal_def_id),
        staleTime: Number.POSITIVE_INFINITY,
    });

    const {
        data: series,
        isLoading,
        isError,
    } = useQuery<SignalPoint[]>({
        queryKey: ["signal-data", signal_def_id, window_hours],
        queryFn: () => fetchSignalData(signal_def_id, window_hours),
        staleTime: 10_000,
        refetchInterval: 30_000,
    });

    const downsampled = useMemo(() => downsample(series ?? []), [series]);
    const forecast = useMemo(
        () => computeForecast(downsampled, threshold, window_hours),
        [downsampled, threshold, window_hours],
    );
    const unitName = definition?.unit_name ?? null;
    const displayName = definition?.display_name ?? `Signal #${signal_def_id}`;

    // Loading — sober text, no shimmer (§9).
    if (isLoading) {
        return (
            <div className="flex h-[240px] w-full items-center justify-center rounded-2xl border border-border bg-card shadow-card">
                <span className="text-xs text-muted-foreground">Loading signal…</span>
            </div>
        );
    }

    // Error / empty — inline card, retry handled by TanStack Query.
    if (isError || !series || series.length === 0) {
        return (
            <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="mb-1 text-sm font-medium text-foreground">{displayName}</div>
                <div className="text-xs text-text-tertiary">
                    No data for signal #{signal_def_id} in the last {window_hours}h.
                </div>
            </div>
        );
    }

    const anomalyValue = mark_anomaly_at ? findValueAtTime(series, mark_anomaly_at) : null;
    const etaTone =
        forecast.etaHours === null
            ? "var(--text-tertiary)"
            : forecast.etaHours <= 2
              ? "var(--destructive)"
              : forecast.etaHours <= 12
                ? "var(--warning)"
                : "var(--success)";

    return (
        <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{displayName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                    Last {window_hours}h · Cell {cell_id}
                </span>
            </div>

            <div
                className="h-[240px] w-full"
                data-testid="signal-chart-container"
                role="img"
                aria-label={`${displayName} — ${series.length} samples over the last ${window_hours} hours, with a ${forecast.horizonHours.toFixed(0)}h forward projection`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={forecast.combined}
                        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                    >
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id={projectedGradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="0%"
                                    stopColor="var(--accent-arc)"
                                    stopOpacity={0.18}
                                />
                                <stop
                                    offset="100%"
                                    stopColor="var(--accent-arc)"
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="time"
                            tickFormatter={formatTimeLabel}
                            tick={{
                                fill: "var(--text-tertiary)",
                                fontSize: 10,
                                fontFamily: "var(--font-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                            minTickGap={40}
                        />
                        <YAxis
                            tick={{
                                fill: "var(--text-tertiary)",
                                fontSize: 10,
                                fontFamily: "var(--font-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                            width={36}
                            unit={unitName ?? undefined}
                        />
                        <Tooltip
                            content={<CustomTooltip unitName={unitName} />}
                            cursor={{
                                stroke: "var(--input)",
                                strokeDasharray: "2 2",
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="raw_value"
                            stroke="var(--primary)"
                            strokeWidth={1.5}
                            fill={`url(#${gradientId})`}
                            isAnimationActive={false}
                            dot={false}
                            connectNulls={false}
                            activeDot={{
                                r: 3,
                                fill: "var(--primary)",
                                stroke: "var(--card)",
                                strokeWidth: 1,
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="projected_value"
                            stroke="var(--accent-arc)"
                            strokeWidth={1.25}
                            strokeDasharray="4 3"
                            fill={`url(#${projectedGradientId})`}
                            isAnimationActive={false}
                            dot={false}
                            connectNulls={false}
                            activeDot={{
                                r: 3,
                                fill: "var(--accent-arc)",
                                stroke: "var(--card)",
                                strokeWidth: 1,
                            }}
                        />
                        {forecast.lastRealTime && (
                            <ReferenceLine
                                x={forecast.lastRealTime}
                                stroke="var(--border)"
                                strokeDasharray="2 3"
                                strokeWidth={1}
                                ifOverflow="extendDomain"
                                label={{
                                    value: "now",
                                    position: "insideTop",
                                    fill: "var(--text-tertiary)",
                                    fontSize: 9,
                                    fontFamily: "var(--font-mono)",
                                    offset: 4,
                                }}
                            />
                        )}
                        {threshold !== undefined && (
                            <ReferenceLine
                                y={threshold}
                                stroke="var(--warning)"
                                strokeDasharray="4 4"
                                strokeWidth={1}
                                ifOverflow="extendDomain"
                            />
                        )}
                        {mark_anomaly_at && anomalyValue !== null && (
                            <ReferenceDot
                                x={mark_anomaly_at}
                                y={anomalyValue}
                                r={4}
                                fill="var(--destructive)"
                                stroke="var(--destructive)"
                                ifOverflow="extendDomain"
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className="inline-block h-0 w-4 border-t"
                        style={{
                            borderColor: "var(--accent-arc)",
                            borderTopStyle: "dashed",
                        }}
                    />
                    <span>
                        forecast · next {forecast.horizonHours.toFixed(0)}h · trend{" "}
                        <span className="text-foreground">{forecast.trend}</span>
                    </span>
                </span>
                {threshold !== undefined && forecast.etaHours !== null ? (
                    <span
                        className="font-mono font-semibold tabular-nums"
                        style={{ color: etaTone }}
                        title="Estimated time until the current drift crosses the threshold."
                    >
                        breach in ~{formatEtaBadge(forecast.etaHours)}
                    </span>
                ) : threshold !== undefined ? (
                    <span className="text-text-tertiary">no breach within horizon</span>
                ) : null}
            </div>
        </div>
    );
}
