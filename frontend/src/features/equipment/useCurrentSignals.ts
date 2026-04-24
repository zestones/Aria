/**
 * Live snapshot of every signal definition for a single cell.
 *
 * Polls `GET /signals/current?cell_ids=N` every 5 s. Returns the rows in
 * `display_name` order so the table is stable across refetches.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type CurrentSignal, getCurrentSignals } from "../../services/signals";

const REFRESH_MS = 5_000;

export interface UseCurrentSignalsResult {
    signals: CurrentSignal[];
    isLoading: boolean;
    isError: boolean;
}

export function useCurrentSignals(cellId: number | null | undefined): UseCurrentSignalsResult {
    const enabled = typeof cellId === "number";

    const query = useQuery<CurrentSignal[]>({
        queryKey: ["signals", "current", cellId],
        queryFn: () => getCurrentSignals([cellId as number]),
        enabled,
        refetchInterval: REFRESH_MS,
        staleTime: REFRESH_MS / 2,
    });

    const signals = useMemo(() => {
        const list = [...(query.data ?? [])];
        list.sort((a, b) =>
            (a.display_name ?? a.signal_name ?? "").localeCompare(
                b.display_name ?? b.signal_name ?? "",
            ),
        );
        return list;
    }, [query.data]);

    return { signals, isLoading: query.isPending && enabled, isError: query.isError };
}
