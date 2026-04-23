// Placeholder for M8.1. Real component TBD.
import type { SignalChartProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function SignalChart(props: SignalChartProps) {
    return (
        <PlaceholderShell
            label="Signal chart"
            detail={`cell ${props.cell_id} · signal ${props.signal_def_id} · ${props.window_hours ?? 24}h`}
        >
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
