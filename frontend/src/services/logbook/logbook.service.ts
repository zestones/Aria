/**
 * Logbook service — operator entries.
 */

import { apiFetch } from "../../lib/api";

export interface LogbookEntry {
    id: number;
    cell_id: number;
    cell_name?: string;
    category: string;
    severity: string;
    title: string;
    body?: string;
    created_at: string;
    author_username?: string;
}

export interface LogbookQuery {
    window_start: string;
    window_end: string;
    limit?: number;
}

export function listLogbookEntries(query: LogbookQuery): Promise<LogbookEntry[]> {
    return apiFetch<LogbookEntry[]>("/logbook", { params: { ...query } });
}
