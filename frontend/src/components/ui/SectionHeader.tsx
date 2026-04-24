import type { ReactNode } from "react";

export interface SectionHeaderProps {
    /** Main label — sentence case, Inter 600, text-xl. */
    label: string;
    /** Optional right-aligned metadata (use MetaStrip or plain text). */
    meta?: ReactNode;
    /** Accent color for the label itself (defaults to primary fg). */
    accent?: boolean;
    /** Prefix marker, e.g. "01" or "§2.1". Rendered subtle muted. */
    marker?: string;
    /** Size variant — `lg` for page headers (24px), `md` default (20px), `sm` for card headers (17px). */
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeClasses: Record<Required<SectionHeaderProps>["size"], string> = {
    sm: "text-lg font-semibold",
    md: "text-xl font-semibold",
    lg: "text-2xl font-semibold",
};

/**
 * Section meta-line — the v2 signature. See DESIGN_PLAN_v2 §5.1.
 *
 *   Pump overview                               P-02 · Apr 22, 2026
 *
 * Title: Inter 600, sentence case, primary fg.
 * Meta: sentence-case sans muted, `·` separators.
 * No brackets, no mono, no uppercase.
 */
export function SectionHeader({
    label,
    meta,
    accent = false,
    marker,
    size = "md",
    className = "",
}: SectionHeaderProps) {
    const color = accent ? "var(--primary)" : "var(--foreground)";

    return (
        <header className={`flex items-baseline justify-between gap-4 ${className}`}>
            <div className="flex items-baseline gap-2">
                {marker && (
                    <span className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                        {marker}
                    </span>
                )}
                <h2
                    className={`${sizeClasses[size]} leading-tight tracking-[-0.01em]`}
                    style={{ color }}
                >
                    {label}
                </h2>
            </div>
            {meta && (
                <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                    {meta}
                </div>
            )}
        </header>
    );
}
