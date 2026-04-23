/**
 * SignalChart — M8.1 real artifact.
 *
 * Renders a live time-series area chart for a signal definition. Mounted inline
 * inside chat messages when the Q&A agent emits `render_signal_chart`.
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
import { apiFetch } from "../../lib/api";
import type { SignalChartProps } from "../schemas";

// ---------- Types ----------

interface SignalDefinition {
    id: number;
    cell_id: number;
    display_name: string;
    unit_name: string | null;
    signal_type_name?: string | null;
}

interface SignalPoint {
    time: string;
    raw_value: number;
}

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

// ---------- Fetchers (use centralised apiFetch) ----------

function fetchSignalDef(id: number): Promise<SignalDefinition> {
    return apiFetch<SignalDefinition>(`/signals/definitions/${id}`);
}

function fetchSignalData(id: number, windowHours: number): Promise<SignalPoint[]> {
    const end = new Date();
    const start = new Date(end.getTime() - windowHours * 3600 * 1000);
    return apiFetch<SignalPoint[]>(`/signals/data/${id}`, {
        params: {
            window_start: start.toISOString(),
            window_end: end.toISOString(),
        },
    });
}

// ---------- Tooltip ----------

interface TooltipPayload {
    payload?: SignalPoint;
    value?: number;
}
interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
    unitName?: string | null;
}

function CustomTooltip({ active, payload, unitName }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
        <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-2 py-1.5 text-[var(--ds-text-xs)] shadow-[var(--ds-shadow-overlay)]">
            <div className="font-mono text-[var(--ds-fg-muted)]">
                {formatTooltipTime(point.time)}
            </div>
            <div className="mt-0.5 text-[var(--ds-fg-primary)]">
                <span className="font-mono">{formatValue(point.raw_value)}</span>
                {unitName ? (
                    <span className="ml-1 text-[var(--ds-fg-muted)]">{unitName}</span>
                ) : null}
            </div>
        </div>
    );
}

// ---------- Main component ----------

export function SignalChart(props: SignalChartProps) {
    const { cell_id, signal_def_id, window_hours = 24, mark_anomaly_at, threshold } = props;

    const gradientId = useId();

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

    const chartData = useMemo(() => downsample(series ?? []), [series]);
    const unitName = definition?.unit_name ?? null;
    const displayName = definition?.display_name ?? `Signal #${signal_def_id}`;

    // Loading — sober text, no shimmer (§9).
    if (isLoading) {
        return (
            <div className="flex h-[200px] w-full max-w-[400px] items-center justify-center rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)]">
                <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                    Loading signal…
                </span>
            </div>
        );
    }

    // Error / empty — inline card, retry handled by TanStack Query.
    if (isError || !series || series.length === 0) {
        return (
            <div className="w-full max-w-[400px] rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] p-3">
                <div className="mb-1 text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)]">
                    {displayName}
                </div>
                <div className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                    No data for signal #{signal_def_id} in the last {window_hours}h.
                </div>
            </div>
        );
    }

    const anomalyValue = mark_anomaly_at ? findValueAtTime(series, mark_anomaly_at) : null;

    return (
        <div className="w-full max-w-[400px] rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)]">
                    {displayName}
                </span>
                <span className="font-mono text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                    Last {window_hours}h · Cell {cell_id}
                </span>
            </div>

            <div
                className="h-[160px] w-full"
                data-testid="signal-chart-container"
                role="img"
                aria-label={`${displayName} — ${series.length} samples over the last ${window_hours} hours`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity={0.3} />
                                <stop
                                    offset="100%"
                                    stopColor="var(--ds-accent)"
                                    stopOpacity={0.05}
                                />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="time"
                            tickFormatter={formatTimeLabel}
                            tick={{
                                fill: "var(--ds-fg-subtle)",
                                fontSize: 10,
                                fontFamily: "var(--ds-font-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--ds-border)" }}
                            minTickGap={40}
                        />
                        <YAxis
                            tick={{
                                fill: "var(--ds-fg-subtle)",
                                fontSize: 10,
                                fontFamily: "var(--ds-font-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--ds-border)" }}
                            width={36}
                            unit={unitName ?? undefined}
                        />
                        <Tooltip
                            content={<CustomTooltip unitName={unitName} />}
                            cursor={{
                                stroke: "var(--ds-border-strong)",
                                strokeDasharray: "2 2",
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="raw_value"
                            stroke="var(--ds-accent)"
                            strokeWidth={1.5}
                            fill={`url(#${gradientId})`}
                            isAnimationActive={false}
                            dot={false}
                            activeDot={{
                                r: 3,
                                fill: "var(--ds-accent)",
                                stroke: "var(--ds-bg-surface)",
                                strokeWidth: 1,
                            }}
                        />
                        {threshold !== undefined && (
                            <ReferenceLine
                                y={threshold}
                                stroke="var(--ds-status-warning)"
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
                                fill="var(--ds-status-critical)"
                                stroke="var(--ds-status-critical)"
                                ifOverflow="extendDomain"
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
