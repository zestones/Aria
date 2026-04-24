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
