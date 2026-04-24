/**
 * Live current-state map for every cell in scope.
 *
 * Polls `GET /monitoring/status/current` every 15 s. The endpoint returns
 * one row per cell with the latest `status_category` (productive,
 * unplanned_stop, planned_stop, …). We surface a compact map keyed by
 * `cell_id` so the equipment list and detail panel can read without a
 * second round-trip.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type CellStatus, getCurrentStatus } from "../../services/monitoring";

const REFRESH_MS = 15_000;

export type CellStatusMap = ReadonlyMap<number, CellStatus>;

export interface UseCellStatusesResult {
    map: CellStatusMap;
    isLoading: boolean;
    isError: boolean;
}

export function useCellStatuses(): UseCellStatusesResult {
    const query = useQuery<CellStatus[]>({
        queryKey: ["monitoring", "status", "current"],
        queryFn: () => getCurrentStatus(),
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    const map = useMemo<CellStatusMap>(() => {
        const m = new Map<number, CellStatus>();
        for (const row of query.data ?? []) m.set(row.cell_id, row);
        return m;
    }, [query.data]);

    return { map, isLoading: query.isPending, isError: query.isError };
}

/**
 * Translate the raw `status_category` string into the design-system
 * status tone used by `StatusDot` / `Badge`.
 */
export function statusFromCategory(
    category: string | null | undefined,
): "nominal" | "warning" | "critical" | "unknown" {
    if (!category) return "unknown";
    if (category === "productive") return "nominal";
    if (category === "planned_stop" || category === "changeover") return "warning";
    if (category === "unplanned_stop" || category === "fault") return "critical";
    return "unknown";
}
