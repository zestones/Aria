// Placeholder for M8.3. Real component TBD.
import type { BarChartProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function BarChart(props: BarChartProps) {
    return (
        <PlaceholderShell label="Bar chart" detail={`${props.title} · ${props.bars.length} bars`}>
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
