/**
 * TanStack Query wrappers around the work-orders REST endpoints. The list
 * query is also the cache the WS stream (`useWorkOrdersStream`) invalidates
 * on `work_order_ready` / `rca_ready` — same key shape here.
 */

import { useQuery } from "@tanstack/react-query";
import { getWorkOrder, listWorkOrders } from "../../services/work-orders";
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
