/**
 * Logbook service — operator-authored shift entries.
 *
 * Mirrors `backend/modules/logbook/schemas.py`:
 *   - `LogbookEntryOut`     → {@link LogbookEntry}
 *   - `LogbookEntryCreate`  → {@link LogbookEntryCreatePayload}
 *
 * Roles: list is open to all authenticated users; create is restricted to
 * admin / operator (router enforces, the form gates the CTA client-side).
 */

import { apiFetch } from "../../lib/api";

export type LogbookCategory = "observation" | "maintenance" | "incident" | "changeover" | "note";
export type LogbookSeverity = "info" | "warning" | "critical";

export interface LogbookEntry {
    id: number;
    cell_id: number;
    cell_name?: string;
    author_id?: number;
    author_username?: string;
    entry_time: string;
    category: LogbookCategory | string;
    severity: LogbookSeverity | string;
    content: string;
    related_signal_def_id?: number;
    created_at: string;
}

export interface LogbookQuery {
    cell_id?: number;
    category?: LogbookCategory | string;
    severity?: LogbookSeverity | string;
    window_start?: string;
    window_end?: string;
    limit?: number;
}

export interface LogbookEntryCreatePayload {
    cell_id: number;
    category?: LogbookCategory;
    severity?: LogbookSeverity;
    content: string;
    related_signal_def_id?: number;
    /** ISO timestamp; backend defaults to now() when omitted. */
    entry_time?: string;
}

export function listLogbookEntries(query: LogbookQuery = {}): Promise<LogbookEntry[]> {
    return apiFetch<LogbookEntry[]>("/logbook", { params: { ...query } });
}

export function getLogbookEntry(entryId: number): Promise<LogbookEntry> {
    return apiFetch<LogbookEntry>(`/logbook/${entryId}`);
}

export function createLogbookEntry(payload: LogbookEntryCreatePayload): Promise<LogbookEntry> {
    return apiFetch<LogbookEntry>("/logbook", { method: "POST", body: payload });
}
