import type { HTMLAttributes } from "react";
import type { AgentId } from "./Badge";
import type { Status } from "./StatusDot";

type RailTone = Status | "accent" | AgentId | "idle";

const toneColor: Record<RailTone, string> = {
    nominal: "var(--success)",
    warning: "var(--warning)",
    critical: "var(--destructive)",
    unknown: "var(--input)",
    idle: "var(--border)",
    accent: "var(--primary)",
    sentinel: "var(--agent-sentinel)",
    investigator: "var(--agent-investigator)",
    kb_builder: "var(--agent-kb-builder)",
    work_order: "var(--agent-work-order)",
    qa: "var(--agent-qa)",
};

export interface StatusRailProps extends HTMLAttributes<HTMLSpanElement> {
    tone: RailTone;
    /** Width in px (2 by default). */
    weight?: number;
    /** Pulse when critical/warning (optional — stays silent when nominal). */
    pulse?: boolean;
}

/**
 * 2px vertical colored rail that sits on the left edge of a surface to
 * convey its live state — see DESIGN_PLAN §5.4. Silent when nominal/idle,
 * speaks when warning/critical.
 */
export function StatusRail({
    tone,
    weight = 2,
    pulse = false,
    className = "",
    style,
    ...rest
}: StatusRailProps) {
    const color = toneColor[tone];
    return (
        <span
            role="presentation"
            className={`absolute left-0 top-0 bottom-0 ${className}`}
            style={{
                width: weight,
                backgroundColor: color,
                animation:
                    pulse && (tone === "critical" || tone === "warning")
                        ? "ds-rail-pulse 1.6s ease-in-out infinite"
                        : undefined,
                ...style,
            }}
            {...rest}
        >
            <style>{`
        @keyframes ds-rail-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ds-rail-pulse {
            0%, 100% { opacity: 1; }
          }
        }
      `}</style>
        </span>
    );
}

export type { RailTone };
