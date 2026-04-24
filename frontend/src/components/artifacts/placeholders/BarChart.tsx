/**
 * BarChart — M8.3 real artifact.
 *
 * Generic comparative bar chart for KPI breakdowns, downtime causes, etc.,
 * emitted by any agent (most often Sentinel/Investigator during context
 * framing). No animation loops per DESIGN.md §9 — `isAnimationActive=false`.
 */

import {
    Bar,
    BarChart as RechartsBarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card } from "../../ui";
import type { BarChartProps } from "../schemas";

function formatYAxisTick(value: number): string {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: { label: string; value: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    return (
        <div className="rounded-md border border-border bg-card px-2 py-1.5 shadow-card">
            <div className="text-xs font-medium text-foreground">{item.label}</div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {item.value}
            </div>
        </div>
    );
}

export function BarChart(props: BarChartProps) {
    const { title, x_label, y_label, bars, cell_id } = props;
    const data = bars.map((b) => ({ label: b.label, value: b.value }));

    return (
        <Card className="w-full max-w-[460px]" padding="md">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium tracking-[-0.01em] text-foreground">{title}</h3>
                {cell_id !== undefined && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                        Cell {cell_id}
                    </span>
                )}
            </div>

            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                        data={data}
                        margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                    >
                        <XAxis
                            dataKey="label"
                            tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                            interval={0}
                            angle={data.length > 4 ? -30 : 0}
                            textAnchor={data.length > 4 ? "end" : "middle"}
                            height={data.length > 4 ? 50 : 20}
                        />
                        <YAxis
                            tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                            tickFormatter={formatYAxisTick}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                            width={36}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                        />
                        <Bar
                            dataKey="value"
                            fill="var(--primary)"
                            isAnimationActive={false}
                            radius={[4, 4, 0, 0]}
                        />
                    </RechartsBarChart>
                </ResponsiveContainer>
            </div>

            {(x_label || y_label) && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{x_label}</span>
                    <span>{y_label}</span>
                </div>
            )}
        </Card>
    );
}
