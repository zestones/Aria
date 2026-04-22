import type { ReactNode } from "react";

export interface SectionHeaderProps {
    /** Main label — rendered mono uppercase +0.08em tracking. */
    label: string;
    /** Wrap the label with [ ] brackets (brutalist framing). */
    bracketed?: boolean;
    /** Optional right-aligned metadata (use MetaStrip). */
    meta?: ReactNode;
    /** Accent color for the label itself (defaults to muted). */
    accent?: boolean;
    /** Prefix marker, e.g. "01" or "§". */
    marker?: string;
    className?: string;
}

/**
 * Signature micro-label. The single most recognizable visual pattern across
 * the app — see DESIGN_PLAN §5.1. Drops straight into any section, panel, or
 * card header.
 */
export function SectionHeader({
    label,
    bracketed = false,
    meta,
    accent = false,
    marker,
    className = "",
}: SectionHeaderProps) {
    const content = bracketed ? `[ ${label.toUpperCase()} ]` : label.toUpperCase();
    const color = accent ? "var(--ds-accent)" : "var(--ds-fg-muted)";

    return (
        <header className={`flex items-baseline justify-between gap-4 ${className}`}>
            <div className="flex items-baseline gap-2">
                {marker && (
                    <span
                        className="font-mono text-[11px] tracking-[0.08em] uppercase"
                        style={{ color: "var(--ds-fg-subtle)" }}
                    >
                        {marker}
                    </span>
                )}
                <h2
                    className="font-mono text-[11px] font-medium tracking-[0.08em] leading-none"
                    style={{ color }}
                >
                    {content}
                </h2>
            </div>
            {meta}
        </header>
    );
}
