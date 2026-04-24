import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHierarchyTree } from "../services/hierarchy";

export type {
    AreaNode,
    CellNode,
    EnterpriseNode,
    HierarchyTree,
    LineNode,
    SiteNode,
} from "../services/hierarchy";

import type { HierarchyTree } from "../services/hierarchy";

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
        queryFn: () => getHierarchyTree(),
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

// ---------------------------------------------------------------------------
// Tree-view helpers (ISA-95, 5 levels: enterprise / site / area / line / cell)
// ---------------------------------------------------------------------------

export type TreeLevel = "enterprise" | "site" | "area" | "line" | "cell";

/** A unique key for any node, safe to use as React key / Set member. */
export type NodeKey = string;

export function nodeKey(level: TreeLevel, id: number): NodeKey {
    return `${level}:${id}`;
}

export interface TreeNode {
    key: NodeKey;
    level: TreeLevel;
    id: number;
    name: string;
    disabled: boolean;
    /** 1-based depth for aria-level (enterprise=1, cell=5). */
    depth: 1 | 2 | 3 | 4 | 5;
    /** Recursive count of enabled cell descendants (0 for cells themselves). */
    cellCount: number;
    /** Full path for search matching, lowercase, joined by " / ". */
    haystack: string;
    /** Parent key or null for roots. */
    parentKey: NodeKey | null;
    /** Keys of the ancestors, in order root → direct parent. */
    ancestors: NodeKey[];
    /** Cell-level payload — only set when level === "cell". */
    cell?: FlatCell;
}

export interface TreeIndex {
    /** All nodes indexed by their key. */
    byKey: Map<NodeKey, TreeNode>;
    /** Children keys for every node (empty array for leaves). */
    childrenOf: Map<NodeKey, NodeKey[]>;
    /** Root keys in their source order. */
    roots: NodeKey[];
}

export function buildTreeIndex(tree: HierarchyTree | undefined): TreeIndex {
    const byKey = new Map<NodeKey, TreeNode>();
    const childrenOf = new Map<NodeKey, NodeKey[]>();
    const roots: NodeKey[] = [];
    if (!tree) return { byKey, childrenOf, roots };

    for (const enterprise of tree) {
        const eKey = nodeKey("enterprise", enterprise.id);
        roots.push(eKey);
        const siteKeys: NodeKey[] = [];

        let eCount = 0;
        for (const site of enterprise.sites) {
            const sKey = nodeKey("site", site.id);
            siteKeys.push(sKey);
            const areaKeys: NodeKey[] = [];

            let sCount = 0;
            for (const area of site.areas) {
                const aKey = nodeKey("area", area.id);
                areaKeys.push(aKey);
                const lineKeys: NodeKey[] = [];

                let aCount = 0;
                for (const line of area.lines) {
                    const lKey = nodeKey("line", line.id);
                    lineKeys.push(lKey);
                    const cellKeys: NodeKey[] = [];

                    let lCount = 0;
                    for (const cell of line.cells) {
                        const cKey = nodeKey("cell", cell.id);
                        cellKeys.push(cKey);
                        const path = `${enterprise.name} / ${site.name} / ${area.name} / ${line.name} / ${cell.name}`;
                        const flat: FlatCell = {
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
                        };
                        byKey.set(cKey, {
                            key: cKey,
                            level: "cell",
                            id: cell.id,
                            name: cell.name,
                            disabled: cell.disabled,
                            depth: 5,
                            cellCount: 0,
                            haystack: path.toLowerCase(),
                            parentKey: lKey,
                            ancestors: [eKey, sKey, aKey, lKey],
                            cell: flat,
                        });
                        childrenOf.set(cKey, []);
                        if (!cell.disabled && !line.disabled && !area.disabled && !site.disabled) {
                            lCount += 1;
                        }
                    }
                    childrenOf.set(lKey, cellKeys);
                    const lPath = `${enterprise.name} / ${site.name} / ${area.name} / ${line.name}`;
                    byKey.set(lKey, {
                        key: lKey,
                        level: "line",
                        id: line.id,
                        name: line.name,
                        disabled: line.disabled,
                        depth: 4,
                        cellCount: lCount,
                        haystack: lPath.toLowerCase(),
                        parentKey: aKey,
                        ancestors: [eKey, sKey, aKey],
                    });
                    aCount += lCount;
                }
                childrenOf.set(aKey, lineKeys);
                const aPath = `${enterprise.name} / ${site.name} / ${area.name}`;
                byKey.set(aKey, {
                    key: aKey,
                    level: "area",
                    id: area.id,
                    name: area.name,
                    disabled: area.disabled,
                    depth: 3,
                    cellCount: aCount,
                    haystack: aPath.toLowerCase(),
                    parentKey: sKey,
                    ancestors: [eKey, sKey],
                });
                sCount += aCount;
            }
            childrenOf.set(sKey, areaKeys);
            const sPath = `${enterprise.name} / ${site.name}`;
            byKey.set(sKey, {
                key: sKey,
                level: "site",
                id: site.id,
                name: site.name,
                disabled: site.disabled,
                depth: 2,
                cellCount: sCount,
                haystack: sPath.toLowerCase(),
                parentKey: eKey,
                ancestors: [eKey],
            });
            eCount += sCount;
        }
        childrenOf.set(eKey, siteKeys);
        byKey.set(eKey, {
            key: eKey,
            level: "enterprise",
            id: enterprise.id,
            name: enterprise.name,
            disabled: enterprise.disabled,
            depth: 1,
            cellCount: eCount,
            haystack: enterprise.name.toLowerCase(),
            parentKey: null,
            ancestors: [],
        });
    }

    return { byKey, childrenOf, roots };
}

/**
 * Return the set of ancestor keys (enterprise → line) leading to the cell
 * matching the given selection, so they can be auto-expanded on open.
 */
export function ancestorsForCell(index: TreeIndex, cellId: number | null | undefined): NodeKey[] {
    if (cellId == null) return [];
    const key = nodeKey("cell", cellId);
    const node = index.byKey.get(key);
    if (!node) return [];
    return node.ancestors;
}

/**
 * Every non-leaf key (enterprise / site / area / line) — used to "expand all"
 * as the default UX when the operator has no current selection.
 */
export function allContainerKeys(index: TreeIndex): NodeKey[] {
    const out: NodeKey[] = [];
    for (const node of index.byKey.values()) {
        if (node.level !== "cell") out.push(node.key);
    }
    return out;
}

/**
 * Given a query, return:
 *  - matchingKeys: keys of nodes whose own name or path contains every token
 *    (cell-level match bubbles up by also adding its ancestors so they render)
 *  - visibleContainerKeys: containers that must stay visible (ancestors of any
 *    match). Callers decide whether to hide or dim non-matching siblings.
 *
 * An empty query returns empty sets (caller should treat as "no filter").
 */
export function searchTree(
    index: TreeIndex,
    query: string,
): { matchingKeys: Set<NodeKey>; visibleKeys: Set<NodeKey> } {
    const q = query.trim().toLowerCase();
    const matching = new Set<NodeKey>();
    const visible = new Set<NodeKey>();
    if (!q) return { matchingKeys: matching, visibleKeys: visible };
    const tokens = q.split(/\s+/).filter(Boolean);
    for (const node of index.byKey.values()) {
        if (tokens.every((t) => node.haystack.includes(t))) {
            matching.add(node.key);
            visible.add(node.key);
            for (const a of node.ancestors) visible.add(a);
        }
    }
    return { matchingKeys: matching, visibleKeys: visible };
}

/**
 * Walk the tree in depth-first, source-order, emitting only the nodes that
 * are visible (their parent chain is expanded, and — when a query is active
 * — they appear in `visibleKeys`). Used for keyboard navigation.
 */
export function flattenVisible(
    index: TreeIndex,
    expanded: Set<NodeKey>,
    visibleKeys: Set<NodeKey> | null,
): TreeNode[] {
    const out: TreeNode[] = [];
    const walk = (key: NodeKey) => {
        const node = index.byKey.get(key);
        if (!node) return;
        if (visibleKeys && !visibleKeys.has(key)) return;
        out.push(node);
        if (node.level === "cell") return;
        if (!expanded.has(key)) return;
        const kids = index.childrenOf.get(key) ?? [];
        for (const k of kids) walk(k);
    };
    for (const r of index.roots) walk(r);
    return out;
}
