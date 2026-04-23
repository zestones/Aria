// Placeholder for M8.1. Real component TBD.
import type { PatternMatchProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function PatternMatch(props: PatternMatchProps) {
    const similarityPct = Math.round(props.similarity * 100);
    return (
        <PlaceholderShell
            label="Pattern match"
            detail={`cell ${props.cell_id} · similarity ${similarityPct}%`}
        >
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
