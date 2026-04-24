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

// ---------------------------------------------------------------------------
// CRUD records — `EntityOut` shape returned by `POST /hierarchy/{kind}` etc.
// Fields mirror `backend/modules/hierarchy/schemas.py`.
//
// NOTE: write endpoints return `disable` (matching the SQL column name);
// the `/tree` endpoint normalizes that to `disabled` for the UI.
// ---------------------------------------------------------------------------

export interface EnterpriseRecord {
    id: number;
    name: string;
    disable: boolean;
    created_at: string;
    updated_at?: string | null;
}

export interface SiteRecord extends EnterpriseRecord {
    parentid: number;
}

export interface AreaRecord extends EnterpriseRecord {
    parentid: number;
}

export interface LineRecord extends EnterpriseRecord {
    parentid: number;
}

export interface CellRecord extends EnterpriseRecord {
    parentid: number;
    ideal_cycle_time_seconds?: number | null;
}

export function createEnterprise(name: string): Promise<EnterpriseRecord> {
    return apiFetch<EnterpriseRecord>("/hierarchy/enterprises", {
        method: "POST",
        body: { name },
    });
}

export function createSite(name: string, parentid: number): Promise<SiteRecord> {
    return apiFetch<SiteRecord>("/hierarchy/sites", {
        method: "POST",
        body: { name, parentid },
    });
}

export function createArea(name: string, parentid: number): Promise<AreaRecord> {
    return apiFetch<AreaRecord>("/hierarchy/areas", {
        method: "POST",
        body: { name, parentid },
    });
}

export function createLine(name: string, parentid: number): Promise<LineRecord> {
    return apiFetch<LineRecord>("/hierarchy/lines", {
        method: "POST",
        body: { name, parentid },
    });
}

export interface CreateCellPayload {
    name: string;
    parentid: number;
    ideal_cycle_time_seconds?: number | null;
}

export function createCell(payload: CreateCellPayload): Promise<CellRecord> {
    return apiFetch<CellRecord>("/hierarchy/cells", {
        method: "POST",
        body: payload,
    });
}
