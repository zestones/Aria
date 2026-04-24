/**
 * Shared formatters / look-ups for the Logbook feature.
 */

import type { LogbookCategory, LogbookSeverity } from "../../services/logbook";

export const CATEGORY_OPTIONS: Array<{ value: LogbookCategory; label: string }> = [
    { value: "observation", label: "Observation" },
    { value: "maintenance", label: "Maintenance" },
    { value: "incident", label: "Incident" },
    { value: "changeover", label: "Changeover" },
    { value: "note", label: "Note" },
];

export const SEVERITY_OPTIONS: Array<{ value: LogbookSeverity; label: string }> = [
    { value: "info", label: "Info" },
    { value: "warning", label: "Warning" },
    { value: "critical", label: "Critical" },
];

export function severityVariant(severity: string): "critical" | "warning" | "default" {
    if (severity === "critical") return "critical";
    if (severity === "warning") return "warning";
    return "default";
}

export function categoryVariant(category: string): "accent" | "default" {
    if (category === "incident" || category === "maintenance") return "accent";
    return "default";
}

export function formatEntryTime(ts: string | null | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
