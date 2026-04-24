/**
 * Equipment KB lookup for a single cell. Surfaces enough metadata for the
 * detail panel (manufacturer, model, completeness score, threshold count).
 *
 * Returns `null` when the cell has no KB row yet — the detail panel renders
 * an "Onboard equipment" CTA in that case.
 */

import { useQuery } from "@tanstack/react-query";
import { getEquipmentKb } from "../../services/kb";
import type { EquipmentKbOut } from "../onboarding";

export interface UseEquipmentKbResult {
    kb: EquipmentKbOut | null;
    isLoading: boolean;
    isError: boolean;
}

export function useEquipmentKb(cellId: number | null | undefined): UseEquipmentKbResult {
    const enabled = typeof cellId === "number";
    const query = useQuery<EquipmentKbOut | null>({
        queryKey: ["kb", "equipment", cellId],
        queryFn: async () => {
            try {
                return await getEquipmentKb(cellId as number);
            } catch (err) {
                // 404 = no KB yet, normal state
                if (err instanceof Error && /404/.test(err.message)) return null;
                throw err;
            }
        },
        enabled,
        staleTime: 30_000,
    });
    return {
        kb: query.data ?? null,
        isLoading: query.isPending && enabled,
        isError: query.isError,
    };
}
