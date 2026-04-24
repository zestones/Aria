/**
 * LineChart — recharts-backed area chart for time-series.
 *
 * Drop-in replacement for the previous pure-SVG implementation. Same props
 * surface so callers (EquipmentPage, …) stay unchanged. Uses recharts so
 * we get smooth monotone interpolation, a real time XAxis, hover tooltip,
 * and a softly tinted area fill — all token-driven.
 *
 * The threshold band (when supplied) is drawn behind the line as a
 * `ReferenceArea`, which is the recharts idiom for "this Y range is
 * meaningful".
 */

import { useId, useMemo } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

export interface LineChartPoint {
    /** Unix milliseconds (preferred) or any monotonically-increasing scalar. */
    x: number;
    y: number;
}

export interface LineChartProps {
    data: readonly LineChartPoint[];
    width?: number;
    height?: number;
    /** Optional `[low, high]` threshold band — drawn as a tinted stripe. */
    thresholdBand?: [number, number] | null;
    /** Stroke color (CSS var or hex). */
    color?: string;
    /** Accessible label. */
    "aria-label"?: string;
    className?: string;
}

function formatTimeTick(value: number): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatTickValue(v: number): string {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
}

interface TooltipPayload {
    payload?: { x: number; y: number };
    value?: number;
}
interface ChartTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
        <div className="rounded-md border border-border bg-card px-2 py-1.5 shadow-card">
            <div className="font-mono text-[10px] text-text-tertiary">{formatTimeTick(p.x)}</div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                {formatTickValue(p.y)}
            </div>
        </div>
    );
}

export function LineChart({
    data,
    height = 160,
    thresholdBand = null,
    color = "var(--primary)",
    "aria-label": ariaLabel,
    className = "",
}: LineChartProps) {
    const gradientId = useId();
    const chartData = useMemo(() => data.map((d) => ({ x: d.x, y: d.y })), [data]);

    if (chartData.length < 2) {
        return (
            <div
                className={`flex items-center justify-center text-xs text-text-tertiary ${className}`}
                style={{ height }}
            >
                Not enough data points yet.
            </div>
        );
    }

    const ys = chartData.map((d) => d.y);
    const yMinRaw = Math.min(...ys, ...(thresholdBand ? [thresholdBand[0]] : []));
    const yMaxRaw = Math.max(...ys, ...(thresholdBand ? [thresholdBand[1]] : []));
    const yPad = (yMaxRaw - yMinRaw) * 0.08 || 1;
    const yDomain: [number, number] = [yMinRaw - yPad, yMaxRaw + yPad];

    return (
        <div
            className={`w-full ${className}`}
            style={{ height }}
            role="img"
            aria-label={ariaLabel ?? "trend chart"}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" vertical={false} />
                    {thresholdBand && (
                        <ReferenceArea
                            y1={thresholdBand[0]}
                            y2={thresholdBand[1]}
                            fill="var(--warning, #f59e0b)"
                            fillOpacity={0.08}
                            stroke="none"
                            ifOverflow="extendDomain"
                        />
                    )}
                    <XAxis
                        dataKey="x"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={formatTimeTick}
                        tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        minTickGap={48}
                    />
                    <YAxis
                        domain={yDomain}
                        tickFormatter={formatTickValue}
                        tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                    />
                    <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ stroke: "var(--border)", strokeDasharray: "2 3" }}
                    />
                    <Area
                        type="monotone"
                        dataKey="y"
                        stroke={color}
                        strokeWidth={1.75}
                        fill={`url(#${gradientId})`}
                        isAnimationActive
                        animationDuration={400}
                        animationEasing="ease-out"
                        dot={false}
                        activeDot={{ r: 3, stroke: color, strokeWidth: 1, fill: "var(--card)" }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
