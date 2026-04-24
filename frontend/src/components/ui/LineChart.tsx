/**
 * Pure-SVG line chart for a single time-series. No deps.
 *
 * - Y axis is auto-scaled to the data's min/max.
 * - X axis is point-index based — caller is expected to pass evenly-spaced
 *   samples or accept that gaps render as straight lines.
 * - Threshold band (optional) renders as a softly tinted horizontal stripe.
 */

export interface LineChartPoint {
    x: number; // unix ms or arbitrary monotonically-increasing scalar
    y: number;
}

export interface LineChartProps {
    data: readonly LineChartPoint[];
    width?: number;
    height?: number;
    /** Optional `[low, high]` threshold band — drawn as a tinted stripe. */
    thresholdBand?: [number, number] | null;
    /** Stroke color CSS var. */
    color?: string;
    /** Accessible label. */
    "aria-label"?: string;
    className?: string;
}

const PADDING = { top: 8, right: 8, bottom: 16, left: 32 };

export function LineChart({
    data,
    width = 600,
    height = 160,
    thresholdBand = null,
    color = "var(--primary)",
    "aria-label": ariaLabel,
    className = "",
}: LineChartProps) {
    if (data.length < 2) {
        return (
            <div
                className={`flex items-center justify-center text-xs text-text-tertiary ${className}`}
                style={{ height }}
            >
                Not enough data points yet.
            </div>
        );
    }

    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMinRaw = Math.min(...ys, ...(thresholdBand ? [thresholdBand[0]] : []));
    const yMaxRaw = Math.max(...ys, ...(thresholdBand ? [thresholdBand[1]] : []));
    const yPad = (yMaxRaw - yMinRaw) * 0.08 || 1;
    const yMin = yMinRaw - yPad;
    const yMax = yMaxRaw + yPad;

    const innerW = width - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;

    const xScale = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const yScale = (y: number) => PADDING.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

    const pathD = data
        .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(d.x).toFixed(2)} ${yScale(d.y).toFixed(2)}`)
        .join(" ");

    const yTicks = [yMin, (yMin + yMax) / 2, yMax];

    return (
        <svg
            role="img"
            aria-label={ariaLabel ?? "trend chart"}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={`block w-full ${className}`}
            style={{ height }}
        >
            <title>{ariaLabel ?? "trend chart"}</title>

            {/* gridlines */}
            {yTicks.map((t) => (
                <line
                    key={t}
                    x1={PADDING.left}
                    x2={width - PADDING.right}
                    y1={yScale(t)}
                    y2={yScale(t)}
                    stroke="var(--border)"
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                />
            ))}
            {yTicks.map((t) => (
                <text
                    key={`${t}-label`}
                    x={PADDING.left - 4}
                    y={yScale(t)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="var(--text-tertiary)"
                    fontFamily="var(--font-mono)"
                >
                    {formatTickValue(t)}
                </text>
            ))}

            {/* threshold band */}
            {thresholdBand && (
                <rect
                    x={PADDING.left}
                    y={yScale(thresholdBand[1])}
                    width={innerW}
                    height={Math.max(0, yScale(thresholdBand[0]) - yScale(thresholdBand[1]))}
                    fill="var(--warning, #f59e0b)"
                    fillOpacity={0.08}
                />
            )}

            {/* line */}
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

function formatTickValue(v: number): string {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
}
