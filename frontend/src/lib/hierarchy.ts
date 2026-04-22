import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "./api";

export interface CellNode {
    id: number;
    name: string;
    disabled: boolean;
    parent_id: number;
}

export interface LineNode {
    id: number;
    name: string;
    disabled: boolean;
    parent_id: number;
    cells: CellNode[];
}

export interface AreaNode {
    id: number;
    name: string;
    disabled: boolean;
    parent_id: number;
    lines: LineNode[];
}

export interface SiteNode {
    id: number;
    name: string;
    disabled: boolean;
    parent_id: number;
    areas: AreaNode[];
}

export interface EnterpriseNode {
    id: number;
    name: string;
    disabled: boolean;
    sites: SiteNode[];
}

export type HierarchyTree = EnterpriseNode[];

export interface EquipmentSelection {
    cellId: number;
    cellName: string;
    lineId: number;
    lineName: string;
    areaName: string;
    siteName: string;
}

export interface FlatCell {
    cellId: number;
    cellName: string;
    cellDisabled: boolean;
    lineId: number;
    lineName: string;
    lineDisabled: boolean;
    areaId: number;
    areaName: string;
    areaDisabled: boolean;
    siteId: number;
    siteName: string;
    enterpriseName: string;
    /** Searchable breadcrumb — ` ` joined lowercase. */
    haystack: string;
    /** Deep label e.g. `Aqua / Field / Treatment / Line-01 / Cell-02`. */
    path: string;
}

export interface GroupedLine {
    lineId: number;
    lineName: string;
    areaName: string;
    siteName: string;
    cells: FlatCell[];
}

export function useHierarchyTree() {
    return useQuery({
        queryKey: ["hierarchy", "tree"],
        queryFn: () => apiFetch<HierarchyTree>("/hierarchy/tree"),
        staleTime: 60_000,
    });
}

export function flattenTree(tree: HierarchyTree | undefined): FlatCell[] {
    if (!tree) return [];
    const out: FlatCell[] = [];
    for (const enterprise of tree) {
        for (const site of enterprise.sites) {
            for (const area of site.areas) {
                for (const line of area.lines) {
                    for (const cell of line.cells) {
                        const path = `${enterprise.name} / ${site.name} / ${area.name} / ${line.name} / ${cell.name}`;
                        out.push({
                            cellId: cell.id,
                            cellName: cell.name,
                            cellDisabled: cell.disabled,
                            lineId: line.id,
                            lineName: line.name,
                            lineDisabled: line.disabled,
                            areaId: area.id,
                            areaName: area.name,
                            areaDisabled: area.disabled,
                            siteId: site.id,
                            siteName: site.name,
                            enterpriseName: enterprise.name,
                            haystack: path.toLowerCase(),
                            path,
                        });
                    }
                }
            }
        }
    }
    return out;
}

export function searchCells(cells: FlatCell[], query: string): FlatCell[] {
    const q = query.trim().toLowerCase();
    if (!q) return cells;
    const tokens = q.split(/\s+/).filter(Boolean);
    return cells.filter((c) => tokens.every((t) => c.haystack.includes(t)));
}

export function groupByLine(cells: FlatCell[]): GroupedLine[] {
    const map = new Map<number, GroupedLine>();
    for (const c of cells) {
        const existing = map.get(c.lineId);
        if (existing) {
            existing.cells.push(c);
        } else {
            map.set(c.lineId, {
                lineId: c.lineId,
                lineName: c.lineName,
                areaName: c.areaName,
                siteName: c.siteName,
                cells: [c],
            });
        }
    }
    return Array.from(map.values());
}

export function useFlatHierarchy(query: string) {
    const tree = useHierarchyTree();
    const all = useMemo(() => flattenTree(tree.data), [tree.data]);
    const filtered = useMemo(() => searchCells(all, query), [all, query]);
    const groups = useMemo(() => groupByLine(filtered), [filtered]);
    return {
        isLoading: tree.isLoading,
        isFetching: tree.isFetching,
        error: tree.error,
        all,
        filtered,
        groups,
        refetch: tree.refetch,
    };
}

export function findCell(
    tree: HierarchyTree | undefined,
    cellId: number,
): EquipmentSelection | null {
    if (!tree) return null;
    for (const enterprise of tree) {
        for (const site of enterprise.sites) {
            for (const area of site.areas) {
                for (const line of area.lines) {
                    for (const cell of line.cells) {
                        if (cell.id === cellId) {
                            return {
                                cellId: cell.id,
                                cellName: cell.name,
                                lineId: line.id,
                                lineName: line.name,
                                areaName: area.name,
                                siteName: site.name,
                            };
                        }
                    }
                }
            }
        }
    }
    return null;
}
