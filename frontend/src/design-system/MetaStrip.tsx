import type { HTMLAttributes } from "react";

export interface MetaItem {
    label: string;
    value: string;
}

export interface MetaStripProps extends HTMLAttributes<HTMLDListElement> {
    items: MetaItem[];
}

/**
 * Right-aligned metadata strip for panel headers — see DESIGN_PLAN §5.2.
 * Renders as `LABEL / value  ·  LABEL / value`, mono uppercase, subtle.
 * Purely structural: registration-mark-flavored, never legal text.
 */
export function MetaStrip({ items, className = "", ...rest }: MetaStripProps) {
    return (
        <dl
            className={`flex items-baseline gap-3 font-mono text-[11px] tracking-[0.08em] uppercase ${className}`}
            style={{ color: "var(--ds-fg-subtle)" }}
            {...rest}
        >
            {items.map((item, idx) => (
                <span key={item.label} className="flex items-baseline gap-1.5">
                    {idx > 0 && (
                        <span aria-hidden style={{ color: "var(--ds-border-strong)" }}>
                            ·
                        </span>
                    )}
                    <dt className="opacity-70" style={{ color: "var(--ds-fg-subtle)" }}>
                        {item.label}
                    </dt>
                    <span style={{ color: "var(--ds-border-strong)" }}>/</span>
                    <dd style={{ color: "var(--ds-fg-muted)" }}>{item.value}</dd>
                </span>
            ))}
        </dl>
    );
}
