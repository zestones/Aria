/**
 * Mirrors `backend/modules/work_order/schemas.py::WorkOrderOut`. Keep the
 * shape in sync manually — the API envelope is unwrapped by `apiFetch`.
 */
export interface WorkOrder {
    id: number;
    cell_id: number;
    cell_name?: string | null;
    title: string;
    description?: string | null;
    priority: string;
    status: string;
    estimated_duration_min?: number | null;
    required_parts?: unknown;
    required_skills?: unknown;
    suggested_window_start?: string | null;
    suggested_window_end?: string | null;
    created_by?: string | null;
    assigned_to?: number | null;
    assigned_to_username?: string | null;
    triggered_by_signal_def_id?: number | null;
    triggered_by_alert?: string | null;
    rca_summary?: string | null;
    recommended_actions?: unknown;
    generated_by_agent: boolean;
    trigger_anomaly_time?: string | null;
    created_at: string;
    completed_at?: string | null;
}

export type WorkOrderPriority = "low" | "medium" | "high" | "critical";
export type WorkOrderStatus =
    | "detected"
    | "analyzed"
    | "open"
    | "in_progress"
    | "completed"
    | "cancelled";

export const PRIORITY_RANK: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
