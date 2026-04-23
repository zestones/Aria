/**
 * Consolidated KPI data hook for the topbar KPI bar (M7.2).
 *
 * Combines four TanStack Query calls — OEE snapshot, OEE trend (sparkline),
 * maintenance (MTBF + MTTR), and machine-status events (anomaly count).
 *
 * All queries refetch every 15 s, match the shared API envelope (via
 * `apiFetch`), and are scoped to the currently selected cell. Disabled
 * entirely until a selection is available — the bar will show `—` placeholders
 * and no flash.
 *
 * Endpoints actually used (investigated from backend/modules/*.py):
 *  - GET /kpi/oee?cell_ids=&window_start=&window_end=
 *  - GET /kpi/oee/trend?cell_ids=&window_start=&window_end=&bucket=1 hour
 *  - GET /kpi/maintenance?cell_ids=&window_start=&window_end=
 *  - GET /monitoring/events/machine-status?cell_ids=&window_start=&window_end=
 *    (counted client-side where status_category === "unplanned_stop")
 *
 * There is no dedicated `/signals/anomalies` endpoint today — the anomaly
 * count is derived from unplanned-stop events over the last 24 h. If an
 * explicit anomaly endpoint appears later, swap the derivation out.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../../lib/api";

const REFRESH_MS = 15_000;
const STALE_MS = 10_000;
const TREND_BUCKETS = 24; // 24 × 1h = last day

interface OeeSnapshot {
    availability: number | null;
    performance: number | null;
    quality: number | null;
    oee: number | null;
}

interface OeeBucket {
    bucket: string;
    cell_id: number;
    availability: number | null;
    performance: number | null;
    quality: number | null;
    oee: number | null;
}

interface MaintenanceKpi {
    mtbf_seconds: number | null;
    mttr_seconds: number | null;
}

interface MachineStatusEvent {
    time: string;
    status_category: string;
}

export interface KpiSnapshot {
    oee: {
        value: number | null;
        trend: number[] | null;
        isLoading: boolean;
        isError: boolean;
    };
    mtbf: {
        value: number | null;
        isLoading: boolean;
        isError: boolean;
    };
    mttr: {
        value: number | null;
        isLoading: boolean;
        isError: boolean;
    };
    anomalies: {
        value: number | null;
        isLoading: boolean;
        isError: boolean;
    };
}

/**
 * Anchor the window to whole minutes so repeated refetches reuse query cache
 * entries instead of busting them every 15 s.
 */
function windowFor24h(nowMs: number): { start: string; end: string } {
    const end = new Date(Math.floor(nowMs / 60_000) * 60_000);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
}

export function useKpiData(cellId: number | null | undefined): KpiSnapshot {
    // Anchor the window to the current minute. TanStack dedupes by queryKey,
    // so a freshly-computed-but-stable value keeps the cache hot for the
    // next 60 s, and the 15 s `refetchInterval` is what actually drives
    // live updates.
    const windowRange = windowFor24h(Date.now());

    const enabled = typeof cellId === "number";
    const cellIds = enabled ? [cellId] : [];

    const oeeQuery = useQuery<OeeSnapshot>({
        queryKey: ["kpi", "oee", cellId, windowRange.start, windowRange.end],
        queryFn: () =>
            apiFetch<OeeSnapshot>("/kpi/oee", {
                params: {
                    cell_ids: cellIds,
                    window_start: windowRange.start,
                    window_end: windowRange.end,
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: STALE_MS,
    });

    const oeeTrendQuery = useQuery<OeeBucket[]>({
        queryKey: ["kpi", "oee", "trend", cellId, windowRange.start, windowRange.end],
        queryFn: () =>
            apiFetch<OeeBucket[]>("/kpi/oee/trend", {
                params: {
                    cell_ids: cellIds,
                    window_start: windowRange.start,
                    window_end: windowRange.end,
                    bucket: "1 hour",
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: STALE_MS,
    });

    const maintenanceQuery = useQuery<MaintenanceKpi>({
        queryKey: ["kpi", "maintenance", cellId, windowRange.start, windowRange.end],
        queryFn: () =>
            apiFetch<MaintenanceKpi>("/kpi/maintenance", {
                params: {
                    cell_ids: cellIds,
                    window_start: windowRange.start,
                    window_end: windowRange.end,
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: STALE_MS,
    });

    const anomaliesQuery = useQuery<MachineStatusEvent[]>({
        queryKey: ["kpi", "anomalies", cellId, windowRange.start, windowRange.end],
        queryFn: () =>
            apiFetch<MachineStatusEvent[]>("/monitoring/events/machine-status", {
                params: {
                    cell_ids: cellIds,
                    window_start: windowRange.start,
                    window_end: windowRange.end,
                    limit: 2000,
                },
            }),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: STALE_MS,
    });

    const oeeValue = typeof oeeQuery.data?.oee === "number" ? oeeQuery.data.oee * 100 : null;

    const trendValues = useMemo(() => {
        const rows = oeeTrendQuery.data;
        if (!rows || rows.length === 0) return null;
        const sorted = [...rows]
            .filter((r) => typeof r.oee === "number")
            .sort((a, b) => a.bucket.localeCompare(b.bucket))
            .map((r) => (r.oee as number) * 100);
        if (sorted.length < 2) return null;
        return sorted.slice(-TREND_BUCKETS);
    }, [oeeTrendQuery.data]);

    const mtbfValue =
        typeof maintenanceQuery.data?.mtbf_seconds === "number"
            ? maintenanceQuery.data.mtbf_seconds
            : null;

    const mttrValue =
        typeof maintenanceQuery.data?.mttr_seconds === "number"
            ? maintenanceQuery.data.mttr_seconds
            : null;

    const anomaliesValue = useMemo(() => {
        const rows = anomaliesQuery.data;
        if (!rows) return null;
        return rows.reduce(
            (acc, ev) => (ev.status_category === "unplanned_stop" ? acc + 1 : acc),
            0,
        );
    }, [anomaliesQuery.data]);

    return {
        oee: {
            value: oeeValue,
            trend: trendValues,
            isLoading: oeeQuery.isPending,
            isError: oeeQuery.isError,
        },
        mtbf: {
            value: mtbfValue,
            isLoading: maintenanceQuery.isPending,
            isError: maintenanceQuery.isError,
        },
        mttr: {
            value: mttrValue,
            isLoading: maintenanceQuery.isPending,
            isError: maintenanceQuery.isError,
        },
        anomalies: {
            value: anomaliesValue,
            isLoading: anomaliesQuery.isPending,
            isError: anomaliesQuery.isError,
        },
    };
}
