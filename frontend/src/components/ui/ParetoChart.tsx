/**
 * ParetoChart — horizontal-bar Pareto with motion-polished fill.
 *
 * Bars are rendered top-to-bottom in the order they appear in `data`
 * (caller is expected to pre-sort descending by `value`). Bar widths are
 * scaled relative to the largest value in the dataset and animated in on
 * mount / data change for a polished feel.
 */

import { motion } from "framer-motion";

export interface ParetoDatum {
    label: string;
    value: number;
    /** Optional formatter for the value label (e.g. duration → "12 min"). */
    display?: string;
}

export interface ParetoChartProps {
    data: readonly ParetoDatum[];
    color?: string;
    /** Accessible label. */
    "aria-label"?: string;
    /** Empty-state text. */
    emptyText?: string;
    className?: string;
}

export function ParetoChart({
    data,
    color = "var(--primary)",
    "aria-label": ariaLabel,
    emptyText = "No data in window.",
    className = "",
}: ParetoChartProps) {
    if (data.length === 0) {
        return <p className={`px-2 py-3 text-sm text-text-tertiary ${className}`}>{emptyText}</p>;
    }

    const max = Math.max(...data.map((d) => d.value)) || 1;
    const total = data.reduce((acc, d) => acc + d.value, 0);

    return (
        <ul className={`flex flex-col gap-1.5 ${className}`} aria-label={ariaLabel}>
            {data.map((d, i) => {
                const widthPct = Math.max(2, (d.value / max) * 100);
                const sharePct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                    <li key={d.label} className="flex flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate text-foreground" title={d.label}>
                                {d.label}
                            </span>
                            <span className="font-mono tabular-nums text-text-tertiary">
                                {d.display ?? d.value} · {sharePct}%
                            </span>
                        </div>
                        <div
                            className="h-1.5 overflow-hidden rounded-full"
                            style={{ background: "var(--border)" }}
                        >
                            <motion.div
                                className="h-full rounded-full"
                                style={{ background: color }}
                                initial={{ width: 0 }}
                                animate={{ width: `${widthPct}%` }}
                                transition={{
                                    duration: 0.5,
                                    ease: [0.16, 1, 0.3, 1],
                                    delay: 0.05 + i * 0.04,
                                }}
                            />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
