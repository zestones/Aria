/**
 * TanStack Query wrappers around the work-orders REST endpoints. The list
 * query is also the cache the WS stream (`useWorkOrdersStream`) invalidates
 * on `work_order_ready` / `rca_ready` — same key shape here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    deleteWorkOrder,
    getWorkOrder,
    listWorkOrders,
    updateWorkOrder,
    type WorkOrderUpdatePayload,
} from "../../services/work-orders";
import type { WorkOrder } from "./types";

export function useWorkOrders() {
    return useQuery<WorkOrder[]>({
        queryKey: ["work-orders"],
        queryFn: () => listWorkOrders(500),
        staleTime: 10_000,
    });
}

export function useWorkOrder(id: number | null | undefined) {
    const enabled = typeof id === "number" && Number.isFinite(id);
    return useQuery<WorkOrder>({
        queryKey: ["work-order", id],
        queryFn: () => getWorkOrder(id as number),
        enabled,
        staleTime: 10_000,
    });
}

export function useUpdateWorkOrder(id: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: WorkOrderUpdatePayload) => updateWorkOrder(id, payload),
        onSuccess: (data) => {
            qc.setQueryData(["work-order", id], data);
            qc.invalidateQueries({ queryKey: ["work-orders"] });
        },
    });
}

export function useDeleteWorkOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteWorkOrder(id),
        onSuccess: (_data, id) => {
            qc.removeQueries({ queryKey: ["work-order", id] });
            qc.invalidateQueries({ queryKey: ["work-orders"] });
        },
    });
}
