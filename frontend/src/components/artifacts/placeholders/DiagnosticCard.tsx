// Placeholder for M8.1. Real component TBD.
import type { DiagnosticCardProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function DiagnosticCard(props: DiagnosticCardProps) {
    const confidencePct = Math.round(props.confidence * 100);
    return (
        <PlaceholderShell
            label="Diagnostic"
            detail={`cell ${props.cell_id} · confidence ${confidencePct}%`}
        >
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
