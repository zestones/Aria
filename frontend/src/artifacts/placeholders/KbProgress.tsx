// Placeholder for M8.2. Real component TBD.
import type { KbProgressProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function KbProgress(props: KbProgressProps) {
    const done = props.steps.filter((s) => s.status === "done").length;
    return (
        <PlaceholderShell
            label="KB progress"
            detail={`cell ${props.cell_id} · ${done}/${props.steps.length} done`}
        >
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
