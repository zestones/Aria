/**
 * WorkOrderCard — M8.3 real artifact.
 *
 * Compact summary of a work order streamed inline in chat by the WorkOrder
 * agent (Scene 4). Fetches the full WO via react-query, renders priority,
 * title, equipment, and a one-line root-cause excerpt, and offers a
 * "Open printable view" CTA that navigates to the dedicated route.
 */

import { useQuery } from "@tanstack/react-query";
import type { WorkOrder } from "../../../features/work-orders/types";
import { getWorkOrder } from "../../../services/work-orders/work-orders.service";
import { Badge, Button, Card, CardTitle, Icons } from "../../ui";
import type { WorkOrderCardProps } from "../schemas";

type PriorityVariant = "nominal" | "warning" | "critical" | "default";

function priorityVariant(priority: string | null | undefined): PriorityVariant {
    const p = (priority ?? "medium").toLowerCase();
    if (p === "urgent" || p === "critical" || p === "high") return "critical";
    if (p === "medium") return "warning";
    if (p === "low") return "nominal";
    return "default";
}

function formatWoNumber(id: number): string {
    return `WO-${String(id).padStart(4, "0")}`;
}

export function WorkOrderCard(props: WorkOrderCardProps) {
    const { cell_id, work_order_id, printable } = props;

    const {
        data: wo,
        isLoading,
        isError,
    } = useQuery<WorkOrder>({
        queryKey: ["work-order", work_order_id],
        queryFn: () => getWorkOrder(work_order_id),
        staleTime: 30_000,
    });

    if (isLoading) {
        return (
            <Card className="w-full max-w-[440px]" padding="md">
                <div className="flex h-24 items-center justify-center">
                    <span className="text-xs text-muted-foreground">Loading work order…</span>
                </div>
            </Card>
        );
    }

    if (isError || !wo) {
        return (
            <Card className="w-full max-w-[440px]" padding="md" rail="critical">
                <CardTitle className="text-base">{formatWoNumber(work_order_id)}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                    Unable to load work order for cell {cell_id}.
                </p>
            </Card>
        );
    }

    const summary = (wo.rca_summary || wo.description || "").trim();
    const summaryShort = summary.length > 140 ? `${summary.slice(0, 137)}…` : summary;
    const cellLabel = wo.cell_name || `Cell ${cell_id}`;
    const variant = priorityVariant(wo.priority);
    const printHref = `/work-orders/${wo.id}?print=1`;
    const railTone =
        variant === "critical" ? "critical" : variant === "warning" ? "warning" : "nominal";

    return (
        <Card className="w-full max-w-[440px]" padding="md" rail={railTone} railPulse={false}>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatWoNumber(wo.id)}
                        </span>
                        <Badge variant={variant} size="sm">
                            {(wo.priority || "medium").toLowerCase()}
                        </Badge>
                        <Badge variant="agent" agent="work_order" size="sm">
                            Work Order
                        </Badge>
                        {printable && (
                            <span className="text-[10px] font-medium uppercase tracking-widest text-success">
                                · Ready to print
                            </span>
                        )}
                    </div>
                    <CardTitle className="text-base">{wo.title}</CardTitle>
                </div>
            </div>

            <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icons.Cpu className="h-4 w-4 shrink-0" />
                    <span className="truncate">{cellLabel}</span>
                </div>
                {summaryShort && (
                    <p className="text-sm leading-snug text-foreground">{summaryShort}</p>
                )}
            </div>

            <div className="flex gap-2 border-t border-border-muted pt-3">
                <a href={printHref} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="default" size="sm" className="w-full">
                        <Icons.Printer className="h-4 w-4" aria-hidden />
                        <span>Open printable view</span>
                    </Button>
                </a>
            </div>
        </Card>
    );
}
