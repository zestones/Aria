/**
 * Engineer-view data hooks for the Equipment page. Each hook owns one
 * window-bounded query and returns chart-ready shapes — the page doesn't
 * touch raw API responses.
 *
 * Endpoints used (no new backend work):
 *   - GET /signals/data/{signal_def_id}    — raw time-series, Sonnet sampling
 *   - GET /kpi/oee/trend                   — bucketed OEE for stacked area
 *   - GET /monitoring/events/machine-status — downtime Pareto (sum durations
 *                                             where status_category=unplanned_stop)
 *   - GET /monitoring/events/production    — quality Pareto (count where
 *                                             is_conformant=false, group by
 *                                             quality_name)
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../../lib/api";
import { getSignalData } from "../../services/signals";

const REFRESH_MS = 30_000;

export type TrendWindow = "1h" | "24h";

export function windowRange(window: TrendWindow, nowMs: number = Date.now()) {
    // Anchor to whole minutes so identical params dedupe in the cache.
    const end = new Date(Math.floor(nowMs / 60_000) * 60_000);
    const ms = window === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const start = new Date(end.getTime() - ms);
    return { start: start.toISOString(), end: end.toISOString() };
}

// ─── Signal trend ──────────────────────────────────────────────────────────

export interface SignalTrendPoint {
    x: number; // unix ms
    y: number;
}

export function useSignalTrend(signalDefId: number | null, window: TrendWindow) {
    const range = windowRange(window);
    const enabled = typeof signalDefId === "number";

    const query = useQuery({
        queryKey: ["signals", "data", signalDefId, range.start, range.end],
        queryFn: () =>
            getSignalData(signalDefId as number, {
                window_start: range.start,
                window_end: range.end,
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    const points = useMemo<SignalTrendPoint[]>(() => {
        return (query.data ?? []).map((p) => ({
            x: new Date(p.time).getTime(),
            y: p.raw_value,
        }));
    }, [query.data]);

    return { points, isLoading: query.isPending && enabled, isError: query.isError };
}

// ─── OEE trend ─────────────────────────────────────────────────────────────

export interface OeeTrendPoint {
    bucket: string;
    cell_id: number;
    availability: number | null;
    performance: number | null;
    quality: number | null;
    oee: number | null;
}

export function useOeeTrend(cellId: number | null, window: TrendWindow) {
    const range = windowRange(window);
    const enabled = typeof cellId === "number";

    const query = useQuery<OeeTrendPoint[]>({
        queryKey: ["kpi", "oee", "trend-detail", cellId, window, range.start, range.end],
        queryFn: () =>
            apiFetch<OeeTrendPoint[]>("/kpi/oee/trend", {
                params: {
                    cell_ids: [cellId as number],
                    window_start: range.start,
                    window_end: range.end,
                    bucket: window === "1h" ? "5 minute" : "1 hour",
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    return {
        points: query.data ?? [],
        isLoading: query.isPending && enabled,
        isError: query.isError,
    };
}

// ─── Downtime Pareto ───────────────────────────────────────────────────────

interface MachineStatusEvent {
    time: string;
    status_name: string;
    status_category: string;
    duration_seconds: number | null;
}

export interface DowntimeParetoEntry {
    label: string;
    seconds: number;
}

export function useDowntimePareto(cellId: number | null, window: TrendWindow) {
    const range = windowRange(window);
    const enabled = typeof cellId === "number";

    const query = useQuery<MachineStatusEvent[]>({
        queryKey: ["monitoring", "downtime-pareto", cellId, range.start, range.end],
        queryFn: () =>
            apiFetch<MachineStatusEvent[]>("/monitoring/events/machine-status", {
                params: {
                    cell_ids: [cellId as number],
                    window_start: range.start,
                    window_end: range.end,
                    limit: 5000,
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    const entries = useMemo<DowntimeParetoEntry[]>(() => {
        const totals = new Map<string, number>();
        for (const ev of query.data ?? []) {
            if (ev.status_category !== "unplanned_stop") continue;
            const dur = ev.duration_seconds ?? 0;
            if (dur <= 0) continue;
            totals.set(ev.status_name, (totals.get(ev.status_name) ?? 0) + dur);
        }
        return Array.from(totals.entries())
            .map(([label, seconds]) => ({ label, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 8);
    }, [query.data]);

    return {
        entries,
        isLoading: query.isPending && enabled,
        isError: query.isError,
    };
}

// ─── Quality Pareto ────────────────────────────────────────────────────────

interface ProductionEvent {
    time: string;
    quality_name: string;
    is_conformant: boolean;
}

export interface QualityParetoEntry {
    label: string;
    count: number;
}

export function useQualityPareto(cellId: number | null, window: TrendWindow) {
    const range = windowRange(window);
    const enabled = typeof cellId === "number";

    const query = useQuery<ProductionEvent[]>({
        queryKey: ["monitoring", "quality-pareto", cellId, range.start, range.end],
        queryFn: () =>
            apiFetch<ProductionEvent[]>("/monitoring/events/production", {
                params: {
                    cell_ids: [cellId as number],
                    window_start: range.start,
                    window_end: range.end,
                    limit: 5000,
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    const entries = useMemo<QualityParetoEntry[]>(() => {
        const totals = new Map<string, number>();
        for (const ev of query.data ?? []) {
            if (ev.is_conformant) continue;
            totals.set(ev.quality_name, (totals.get(ev.quality_name) ?? 0) + 1);
        }
        return Array.from(totals.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [query.data]);

    return {
        entries,
        isLoading: query.isPending && enabled,
        isError: query.isError,
    };
}

// ─── Signal-definition list (for the trend picker) ─────────────────────────

export interface SignalDefSummary {
    id: number;
    cell_id: number;
    display_name: string;
    unit_name: string | null;
}

export function useSignalDefList(cellId: number | null) {
    const enabled = typeof cellId === "number";
    const query = useQuery<SignalDefSummary[]>({
        queryKey: ["signals", "definitions", "summary", cellId],
        queryFn: () =>
            apiFetch<SignalDefSummary[]>("/signals/definitions", {
                params: { cell_id: cellId as number },
            }),
        enabled,
        staleTime: Number.POSITIVE_INFINITY,
    });

    const definitions = useMemo(() => {
        const list = [...(query.data ?? [])];
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        return list;
    }, [query.data]);

    return {
        definitions,
        isLoading: query.isPending && enabled,
        isError: query.isError,
    };
}
