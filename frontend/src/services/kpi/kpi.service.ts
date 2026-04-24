/**
 * KPI service — OEE rollups.
 */

import { apiFetch } from "../../lib/api";

export interface OeeRow {
    cell_id: number;
    cell_name?: string;
    oee: number;
    availability: number;
    performance: number;
    quality: number;
    good_pieces?: number;
    total_pieces?: number;
}

export interface OeeQuery {
    cell_ids: number[];
    window_start: string;
    window_end: string;
}

export function getOee(query: OeeQuery): Promise<OeeRow[]> {
    return apiFetch<OeeRow[]>("/kpi/oee", { params: { ...query } });
}
