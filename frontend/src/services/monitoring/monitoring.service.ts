/**
 * Monitoring service — current cell status snapshots.
 */

import { apiFetch } from "../../lib/api";

export interface CellStatus {
    cell_id: number;
    cell_name: string;
    line_name?: string;
    status_name?: string;
    status_category?: string;
    is_productive?: boolean;
    last_status_change?: string;
}

export function getCurrentStatus(): Promise<CellStatus[]> {
    return apiFetch<CellStatus[]>("/monitoring/status/current");
}
