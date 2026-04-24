/**
 * AlertBanner — M8.1 real artifact.
 *
 * Inline severity-coloured banner emitted by the Sentinel agent (Scene 2 —
 * anomaly surfaced in chat). Distinct from the global control-room
 * AnomalyBanner: this one renders inside the chat scroll alongside other
 * artifacts. No animation per §9.
 */

import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { Icons } from "../../ui";
import type { AlertBannerProps } from "../schemas";

type Severity = "info" | "alert" | "trip";

interface SeverityConfig {
    color: string;
    tintClass: string;
    label: string;
    icon: ComponentType<LucideProps>;
}

const SEVERITY: Record<Severity, SeverityConfig> = {
    info: {
        color: "var(--info)",
        tintClass: "bg-info/5",
        label: "Information",
        icon: Icons.AlertCircle,
    },
    alert: {
        color: "var(--warning)",
        tintClass: "bg-warning/5",
        label: "Alert",
        icon: Icons.AlertTriangle,
    },
    trip: {
        color: "var(--destructive)",
        tintClass: "bg-destructive/5",
        label: "Trip condition",
        icon: Icons.AlertTriangle,
    },
};

export function AlertBanner(props: AlertBannerProps) {
    const { cell_id, severity, message, anomaly_id, signal_def_id } = props;
    const cfg = SEVERITY[severity];
    const Icon = cfg.icon;

    return (
        <div
            className={`flex w-full max-w-[460px] gap-3 rounded-md border border-border border-l-4 p-3 ${cfg.tintClass}`}
            style={{ borderLeftColor: cfg.color }}
            role={severity === "trip" ? "alert" : "status"}
        >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: cfg.color }} aria-hidden />
            <div className="min-w-0 flex-1">
                <div
                    className="mb-0.5 text-[10px] font-medium uppercase tracking-widest"
                    style={{ color: cfg.color }}
                >
                    · {cfg.label}
                </div>
                <p className="text-sm leading-snug text-foreground">{message}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                    <span>Cell {cell_id}</span>
                    {anomaly_id !== undefined && <span>Anomaly #{anomaly_id}</span>}
                    {signal_def_id !== undefined && <span>Signal #{signal_def_id}</span>}
                </div>
            </div>
        </div>
    );
}
