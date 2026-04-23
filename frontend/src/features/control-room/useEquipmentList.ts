import { useMemo } from "react";
import {
    type EquipmentSelection,
    type FlatCell,
    flattenTree,
    useHierarchyTree,
} from "../../lib/hierarchy";

/**
 * One equipment entry surfaced in the control room grid. The shape is
 * deliberately minimal and generic — no pump/tank/valve assumption. Additional
 * fields (status, metrics) land via M7.1b once live signals are wired.
 *
 * M7.1 refactor (issue #40): `status` is hardcoded to `nominal` for every
 * cell — it is the only visual live-state signal (rendered as a left rail).
 */
export interface EquipmentEntry {
    /** Stable identifier — `cell:<cellId>`, safe as React key and selection key. */
    id: string;
    /** Primary label, shown large in the card (sentence case, from backend). */
    label: string;
    /** Sub-label, shown below the label — line path for context. */
    sublabel: string;
    /** Raw numeric cell id, used to open the inspector / future deep links. */
    cellId: number;
    /** Parent line id — exposed for future actions (open line view, etc.). */
    lineId: number;
    /** Live status. Hardcoded `nominal` in M7.1; live wiring in M7.1b. */
    status: "nominal" | "warning" | "critical" | "unknown";
}

/**
 * Scope the equipment list to the user's current selection. Ordering is
 * narrow → wide: line beats area beats site. When nothing is selected the
 * whole enterprise catalog is returned.
 */
function filterCells(
    cells: FlatCell[],
    selection: EquipmentSelection | null | undefined,
): FlatCell[] {
    if (!selection) return cells;
    if (selection.lineId) return cells.filter((c) => c.lineId === selection.lineId);
    return cells;
}

/**
 * Project a `FlatCell` into the generic, equipment-agnostic `EquipmentEntry`
 * used by the grid. No assumptions on equipment type live here — the grid
 * only knows "cells with a label and a status".
 */
function toEntry(cell: FlatCell): EquipmentEntry {
    return {
        id: `cell:${cell.cellId}`,
        label: cell.cellName,
        sublabel: cell.lineName,
        cellId: cell.cellId,
        lineId: cell.lineId,
        status: "nominal",
    };
}

export interface UseEquipmentListResult {
    entries: EquipmentEntry[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Fetch the hierarchy tree and flatten it into a generic list of equipment
 * entries scoped to the current selection. Driven entirely by backend data —
 * the grid has zero knowledge of what kind of machine it is rendering.
 *
 * Calls `/hierarchy/tree` (via the existing `useHierarchyTree` wrapper, so
 * TanStack Query deduplicates with the TopBar equipment picker).
 */
export function useEquipmentList(
    selection: EquipmentSelection | null | undefined,
): UseEquipmentListResult {
    const query = useHierarchyTree();
    const entries = useMemo(() => {
        const flat = flattenTree(query.data);
        const scoped = filterCells(flat, selection);
        return scoped.filter((c) => !c.cellDisabled).map(toEntry);
    }, [query.data, selection]);

    return {
        entries,
        isLoading: query.isLoading,
        error: (query.error as Error | null) ?? null,
    };
}
