/**
 * Work-orders service — REST wrappers for `/work-orders`.
 * Hooks live in `features/work-orders/useWorkOrders.ts`.
 */

import type { WorkOrder } from "../../features/work-orders/types";
import { apiFetch } from "../../lib/api";

export function listWorkOrders(limit = 500): Promise<WorkOrder[]> {
    return apiFetch<WorkOrder[]>("/work-orders", { params: { limit } });
}

export function getWorkOrder(id: number): Promise<WorkOrder> {
    return apiFetch<WorkOrder>(`/work-orders/${id}`);
}

/**
 * Subset of `WorkOrderUpdate` (backend) that the user can edit from the
 * detail page. Server merges via PATCH-like semantics (PUT with `exclude_unset`).
 */
export interface WorkOrderUpdatePayload {
    title?: string;
    description?: string | null;
    priority?: "low" | "medium" | "high" | "critical";
    status?: "detected" | "analyzed" | "open" | "in_progress" | "completed" | "cancelled";
    estimated_duration_min?: number | null;
    required_parts?: string[] | null;
    required_skills?: string[] | null;
    recommended_actions?: string[] | null;
    suggested_window_start?: string | null;
    suggested_window_end?: string | null;
    assigned_to?: number | null;
    completed_at?: string | null;
    rca_summary?: string | null;
}

export function updateWorkOrder(id: number, payload: WorkOrderUpdatePayload): Promise<WorkOrder> {
    return apiFetch<WorkOrder>(`/work-orders/${id}`, { method: "PUT", body: payload });
}

export function deleteWorkOrder(id: number): Promise<null> {
    return apiFetch<null>(`/work-orders/${id}`, { method: "DELETE" });
}
