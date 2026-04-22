import type { HTMLAttributes } from "react";

export interface HairlineProps extends HTMLAttributes<HTMLDivElement> {
    /** Optional label dropped inline inside the rule (`── label ──`). */
    label?: string;
    /** Thickness in px (1 or 2). Default 1. */
    weight?: 1 | 2;
}

/**
 * 1px compartment divider — see DESIGN_PLAN §5.3.
 * With a label, becomes an editorial inline-rule ("─── control room ───").
 *
 * Uses plain `<div aria-hidden>` for the visual rule — the element is
 * decorative, not semantic. Adjacent headings carry the section meaning.
 */
export function Hairline({ label, weight = 1, className = "", ...rest }: HairlineProps) {
    const color = weight === 2 ? "var(--ds-border-strong)" : "var(--ds-border)";

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
                className="font-mono text-[11px] tracking-[0.08em] uppercase whitespace-nowrap"
                style={{ color: "var(--ds-fg-subtle)" }}
            >
                {label}
            </span>
            <div className="flex-1" style={{ height: `${weight}px`, backgroundColor: color }} />
        </div>
    );
}
