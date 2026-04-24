/**
 * Hierarchy service — ISA-95 enterprise/site/area/line/cell tree.
 *
 * Single source of truth for the wire types of `GET /hierarchy/tree`.
 * UI-derived types (FlatCell, GroupedLine, TreeIndex) live in `lib/hierarchy.ts`.
 */

import { apiFetch } from "../../lib/api";

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

export function getHierarchyTree(): Promise<HierarchyTree> {
    return apiFetch<HierarchyTree>("/hierarchy/tree");
}
