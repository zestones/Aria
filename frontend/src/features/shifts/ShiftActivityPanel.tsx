/**
 * "This shift so far" panel — derived counters.
 *
 * Rather than introducing a fourth telemetry source, this panel reuses
 * existing caches:
 *   - Work orders      — `useWorkOrders()` (already widely consumed)
 *   - Logbook entries  — `useShiftLogbook(windowStart)`
 *   - Live forecasts   — `useForecastStream()` (in-memory FIFO since mount)
 *
 * Everything is filtered down to `entry_time >= shiftStart`. The counters
 * are intentionally small and legible — a dashboard, not an analytics page.
 */

import { useMemo } from "react";
import { Card, Hairline, Icons } from "../../components/ui";
import type { LogbookEntry } from "../../services/logbook";
import { useForecastStream } from "../control-room/useForecastStream";
import type { WorkOrder } from "../work-orders/types";
import { useWorkOrders } from "../work-orders/useWorkOrders";

interface ShiftActivityPanelProps {
    shiftStart: Date | null;
    logbookEntries: LogbookEntry[] | undefined;
    isLogbookLoading: boolean;
}

interface Metric {
    label: string;
    value: number | string;
    hint?: string;
}

function countWorkOrdersInShift(
    orders: WorkOrder[] | undefined,
    shiftStartMs: number,
    predicate?: (wo: WorkOrder) => boolean,
): number {
    if (!orders) return 0;
    return orders.filter((wo) => {
        const t = new Date(wo.created_at).getTime();
        if (Number.isNaN(t)) return false;
        if (t < shiftStartMs) return false;
        return predicate ? predicate(wo) : true;
    }).length;
}

function countLogbookInShift(
    entries: LogbookEntry[] | undefined,
    shiftStartMs: number,
    predicate?: (entry: LogbookEntry) => boolean,
): number {
    if (!entries) return 0;
    return entries.filter((e) => {
        const t = new Date(e.entry_time ?? e.created_at).getTime();
        if (Number.isNaN(t)) return false;
        if (t < shiftStartMs) return false;
        return predicate ? predicate(e) : true;
    }).length;
}

export function ShiftActivityPanel({
    shiftStart,
    logbookEntries,
    isLogbookLoading,
}: ShiftActivityPanelProps) {
    const workOrdersQuery = useWorkOrders();
    const forecastStream = useForecastStream();

    const metrics: Metric[] = useMemo(() => {
        const startMs = shiftStart ? shiftStart.getTime() : Number.POSITIVE_INFINITY;
        const agentWos = countWorkOrdersInShift(
            workOrdersQuery.data,
            startMs,
            (wo) => wo.generated_by_agent === true && wo.status !== "cancelled",
        );
        const manualWos = countWorkOrdersInShift(
            workOrdersQuery.data,
            startMs,
            (wo) => wo.generated_by_agent !== true,
        );
        const incidents = countLogbookInShift(
            logbookEntries,
            startMs,
            (e) => e.category === "incident" || e.severity === "critical",
        );
        const notes = countLogbookInShift(logbookEntries, startMs);
        return [
            {
                label: "Alerts caught by ARIA",
                value: agentWos,
                hint: "Work orders opened automatically by Sentinel or memory-scene triggers.",
            },
            {
                label: "Forecasts active now",
                value: forecastStream.count,
                hint: "Predicted breaches the operator has not yet dismissed.",
            },
            {
                label: "Manual work orders",
                value: manualWos,
                hint: "Opened by an operator or supervisor rather than an agent.",
            },
            {
                label: "Incidents logged",
                value: incidents,
                hint: "Logbook entries tagged incident or critical this shift.",
            },
            {
                label: "Logbook entries",
                value: notes,
                hint: "Total shift-notes entered this shift — routine observations included.",
            },
        ];
    }, [workOrdersQuery.data, logbookEntries, forecastStream.count, shiftStart]);

    const isLoading = !shiftStart || workOrdersQuery.isLoading || isLogbookLoading;

    return (
        <Card padding="lg">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        This shift so far
                    </div>
                    <h3 className="text-base font-medium tracking-[-0.01em] text-foreground">
                        Activity
                    </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icons.Activity className="size-3.5" aria-hidden /> Live
                </span>
            </div>
            <Hairline />

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {metrics.map((metric) => (
                    <div
                        key={metric.label}
                        className="flex flex-col gap-1 rounded-xl border border-border-muted bg-muted/40 px-3 py-3"
                        title={metric.hint}
                    >
                        <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            {metric.label}
                        </dt>
                        <dd className="font-mono text-2xl font-medium tabular-nums text-foreground">
                            {isLoading ? "—" : metric.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}
