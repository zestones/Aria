import type { HTMLAttributes } from "react";

export interface MetaItem {
    /** Sentence-case label, e.g. "Unit", "Cell". Omit for value-only segments. */
    label?: string;
    value: string;
}

export interface MetaStripProps extends HTMLAttributes<HTMLDListElement> {
    items: MetaItem[];
}

/**
 * Inline metadata strip — `Unit D-02 · Cell 02.01 · Updated Apr 22`.
 * Sentence-case sans muted, `·` separators only. No mono, no uppercase, no
 * slashes-as-decoration. See DESIGN_PLAN_v2 §5.3.
 */
export function MetaStrip({ items, className = "", ...rest }: MetaStripProps) {
    return (
        <dl
            className={`flex items-baseline gap-2 text-ds-sm ${className}`}
            style={{ color: "var(--ds-fg-muted)" }}
            {...rest}
        >
            {items.map((item, idx) => (
                <span
                    key={`${item.label ?? ""}-${item.value}`}
                    className="flex items-baseline gap-1.5"
                >
                    {idx > 0 && (
                        <span aria-hidden style={{ color: "var(--ds-fg-subtle)" }}>
                            ·
                        </span>
                    )}
                    {item.label && <dt style={{ color: "var(--ds-fg-muted)" }}>{item.label}</dt>}
                    <dd style={{ color: "var(--ds-fg-primary)" }}>{item.value}</dd>
                </span>
            ))}
        </dl>
    );
}
