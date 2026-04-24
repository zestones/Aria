import type { HTMLAttributes } from "react";

export interface HairlineProps extends HTMLAttributes<HTMLDivElement> {
    /** Optional inline label (`── label ──`). Sentence-case sans muted. */
    label?: string;
    /** Thickness in px (1 or 2). Default 1. */
    weight?: 1 | 2;
}

/**
 * 1px compartment divider — see DESIGN_PLAN_v2 §4.4. With a label, becomes an
 * inline section rule ("─── Control room ───") in sentence-case sans muted.
 */
export function Hairline({ label, weight = 1, className = "", ...rest }: HairlineProps) {
    const color = weight === 2 ? "var(--input)" : "var(--border)";

    if (!label) {
        return (
            <div
                aria-hidden
                className={className}
                style={{ height: `${weight}px`, backgroundColor: color }}
                {...rest}
            />
        );
    }

    return (
        <div aria-hidden className={`flex items-center gap-3 ${className}`} {...rest}>
            <div className="flex-1" style={{ height: `${weight}px`, backgroundColor: color }} />
            <span
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: "var(--muted-foreground)" }}
            >
                {label}
            </span>
            <div className="flex-1" style={{ height: `${weight}px`, backgroundColor: color }} />
        </div>
    );
}
