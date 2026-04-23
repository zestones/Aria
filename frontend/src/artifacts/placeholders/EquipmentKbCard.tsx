// Placeholder for M8.2. Real component TBD.
import type { EquipmentKbCardProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function EquipmentKbCard(props: EquipmentKbCardProps) {
    return (
        <PlaceholderShell label="Equipment KB" detail={`cell ${props.cell_id}`}>
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
