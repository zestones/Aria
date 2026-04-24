/**
 * Signals service — definitions, time-series data and current-value endpoints.
 */

import { apiFetch } from "../../lib/api";

export interface SignalDefinition {
    id: number;
    cell_id: number;
    display_name: string;
    unit_name: string | null;
    signal_type_name?: string | null;
}

export interface SignalPoint {
    time: string;
    raw_value: number;
}

export interface CurrentSignal {
    cell_id: number;
    cell_name: string;
    signal_def_id: number;
    signal_name: string;
    display_name?: string;
    unit_name?: string;
    raw_value: number;
    time: string;
}

export function getSignalDefinition(id: number): Promise<SignalDefinition> {
    return apiFetch<SignalDefinition>(`/signals/definitions/${id}`);
}

export function getSignalData(
    id: number,
    range: { window_start: string; window_end: string },
): Promise<SignalPoint[]> {
    return apiFetch<SignalPoint[]>(`/signals/data/${id}`, { params: { ...range } });
}

export function getCurrentSignals(cellIds: number[]): Promise<CurrentSignal[]> {
    return apiFetch<CurrentSignal[]>("/signals/current", { params: { cell_ids: cellIds } });
}
