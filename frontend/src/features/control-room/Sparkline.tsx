/**
 * Pure-SVG sparkline for KPI tiles. No deps.
 *
 * - Renders the last N points as a polyline inside a 60×20 viewBox.
 * - Stroke uses `--ds-fg-muted` so the line reads as metadata, not feature.
 * - Highlights the last point with a small circle stroked in `--ds-accent`.
 * - Returns a silent placeholder when data is missing (loading / error).
 */

export interface SparklineProps {
    /** Series of values (nulls tolerated — treated as skips). */
    values?: Array<number | null | undefined>;
    /** Width in px. Defaults to 60. */
    width?: number;
    /** Height in px. Defaults to 20. */
    height?: number;
    /** Accessible label. */
    "aria-label"?: string;
}

export function Sparkline({
    values,
    width = 60,
    height = 20,
    "aria-label": ariaLabel,
}: SparklineProps) {
    const clean = (values ?? []).filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
    );

    if (clean.length < 2) {
        return (
            <span
                aria-hidden
                style={{ display: "inline-block", width, height }}
                data-sparkline-empty=""
            />
        );
    }

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const stepX = clean.length > 1 ? width / (clean.length - 1) : 0;

    const points = clean
        .map((v, i) => {
            const x = i * stepX;
            // flip y so higher values render higher
            const y = height - ((v - min) / span) * height;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");

    const lastX = (clean.length - 1) * stepX;
    const lastY = height - ((clean[clean.length - 1] - min) / span) * height;

    return (
        <svg
            role="img"
            aria-label={ariaLabel ?? "trend"}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ display: "block", overflow: "visible" }}
        >
            <polyline
                fill="none"
                stroke="var(--ds-fg-muted)"
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                vectorEffect="non-scaling-stroke"
            />
            <circle
                cx={lastX}
                cy={lastY}
                r={1.5}
                fill="var(--ds-bg-base)"
                stroke="var(--ds-accent)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}
