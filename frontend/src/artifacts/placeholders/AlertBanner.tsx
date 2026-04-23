// Placeholder for M8.1. Real component TBD.
import type { AlertBannerProps } from "../schemas";
import { dumpJson, PlaceholderShell } from "./PlaceholderShell";

export function AlertBanner(props: AlertBannerProps) {
    return (
        <PlaceholderShell label="Alert banner" detail={`cell ${props.cell_id} · ${props.severity}`}>
            <pre className="whitespace-pre-wrap">{dumpJson(props)}</pre>
        </PlaceholderShell>
    );
}
