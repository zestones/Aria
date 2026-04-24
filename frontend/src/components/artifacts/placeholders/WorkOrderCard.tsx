// Placeholder for M8.2. Real component TBD.
import type { WorkOrderCardProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function WorkOrderCard(props: WorkOrderCardProps) {
    return (
        <PlaceholderShell
            label="Work order"
            detail={`cell ${props.cell_id} · WO #${props.work_order_id}`}
        >
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
