/**
 * Static P&ID flow edge (M7.1a skeleton). Renders a single straight SVG line
 * between two points with an arrow marker at the destination. Zero animation,
 * zero dash pattern — the "flow animation" ships in M7.1b once live signals
 * are wired in.
 *
 * The caller is responsible for providing coordinates that already account
 * for node shape radius (i.e. start at the right edge of the upstream node,
 * end at the left edge of the downstream node).
 */
export interface FlowEdgeProps {
    from: { x: number; y: number };
    to: { x: number; y: number };
    /**
     * Arrow head placement — `forward` points at `to`, `reverse` at `from`.
     * Defaults to `forward`.
     */
    direction?: "forward" | "reverse";
    /** Stable test hook / key. */
    id?: string;
}

/** Marker id injected into `<defs>` by the parent diagram. */
export const FLOW_ARROW_MARKER_ID = "aria-pid-flow-arrow";

export function FlowEdge({ from, to, direction = "forward", id }: FlowEdgeProps) {
    const start = direction === "forward" ? from : to;
    const end = direction === "forward" ? to : from;

    return (
        <line
            data-testid={id ? `flow-edge-${id}` : undefined}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="var(--ds-border-strong)"
            strokeWidth={1.5}
            strokeLinecap="round"
            markerEnd={`url(#${FLOW_ARROW_MARKER_ID})`}
        />
    );
}
