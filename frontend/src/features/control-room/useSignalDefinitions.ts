/**
 * Signal-definition lookup for the anomaly banner (M7.3).
 *
 * Fetches `/signals/definitions?cell_id=X` once per cell (quasi-static data)
 * and exposes a synchronous `resolve(id)` helper. Callers fall back to
 * `Signal #{id}` when the lookup returns null (loading, error, or unknown id).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../../lib/api";

interface SignalDefinition {
    id: number;
    cell_id: number;
    display_name: string;
    tag_name?: string | null;
}

export interface UseSignalDefinitionsResult {
    /** Map `signal_def_id` → display label, or `null` if not yet loaded / unknown. */
    resolve: (signalDefId: number) => string | null;
    isLoading: boolean;
    isError: boolean;
}

export function useSignalDefinitions(
    cellId: number | null | undefined,
): UseSignalDefinitionsResult {
    const enabled = typeof cellId === "number";

    const query = useQuery<SignalDefinition[]>({
        queryKey: ["signals", "definitions", cellId],
        queryFn: () =>
            apiFetch<SignalDefinition[]>("/signals/definitions", {
                params: { cell_id: cellId },
            }),
        enabled,
        // Definitions are quasi-static — a single fetch per session is fine.
        staleTime: Number.POSITIVE_INFINITY,
    });

    const index = useMemo(() => {
        const map = new Map<number, string>();
        for (const def of query.data ?? []) {
            const label = def.tag_name ?? def.display_name;
            map.set(def.id, label);
        }
        return map;
    }, [query.data]);

    const resolve = (signalDefId: number) => index.get(signalDefId) ?? null;

    return {
        resolve,
        isLoading: query.isPending,
        isError: query.isError,
    };
}
