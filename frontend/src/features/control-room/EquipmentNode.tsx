import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Equipment kinds rendered on the P&ID. Shape selection is driven by `kind`:
 *   - tank   → upright rounded rectangle (cylinder read)
 *   - pump   → circle with inscribed directional triangle
 *   - valve  → diamond (rotated square)
 *   - outlet → trapeze (funnel read)
 */
export type EquipmentKind = "tank" | "pump" | "valve" | "outlet";

/**
 * Node live status. M7.1a hardcodes every node to `nominal` — live data wiring
 * lands in M7.1b. See DESIGN_PLAN_v2 §2.3 for color semantics.
 */
export type EquipmentStatus = "nominal" | "warning" | "critical" | "unknown";

export interface EquipmentNodeProps {
    /** Stable identifier — used as selection key. */
    id: string;
    kind: EquipmentKind;
    /** Displayed below the shape (e.g. "P-02", "Tank"). */
    label: string;
    /** Center x in the parent SVG viewBox. */
    x: number;
    /** Center y in the parent SVG viewBox. */
    y: number;
    status: EquipmentStatus;
    selected?: boolean;
    onClick?: () => void;
}

const NODE_WIDTH = 88;
const NODE_HEIGHT = 64;

function statusStrokeColor(status: EquipmentStatus): string {
    switch (status) {
        case "nominal":
            return "var(--ds-status-nominal)";
        case "warning":
            return "var(--ds-status-warning)";
        case "critical":
            return "var(--ds-status-critical)";
        default:
            return "var(--ds-fg-subtle)";
    }
}

/**
 * SVG-native equipment node for the P&ID skeleton. Renders a kind-specific
 * shape at (x, y) with a status-colored stroke and a sentence-case label
 * beneath. Selection is conveyed by a second, outer stroke — never a glow.
 *
 * This is the skeleton (M7.1a) version: status is static, no animations.
 */
export function EquipmentNode({
    id,
    kind,
    label,
    x,
    y,
    status,
    selected = false,
    onClick,
}: EquipmentNodeProps) {
    const stroke = statusStrokeColor(status);
    const fill = "var(--ds-bg-elevated)";
    const halfH = NODE_HEIGHT / 2;

    const interactive = typeof onClick === "function";

    const handleKey = (e: ReactKeyboardEvent<SVGGElement>) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
        }
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> is the native container for grouped shape + label; a keyboard-activatable node is an industry-standard P&ID affordance
        <g
            data-testid={`equipment-node-${id}`}
            data-status={status}
            data-kind={kind}
            data-selected={selected ? "true" : "false"}
            transform={`translate(${x} ${y})`}
            onClick={interactive ? onClick : undefined}
            onKeyDown={handleKey}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${label} — ${status}` : undefined}
            style={{
                cursor: interactive ? "pointer" : undefined,
                outline: "none",
            }}
        >
            {/* Selection ring — plain 2nd stroke, no blur/glow. */}
            {selected && (
                <NodeShape
                    kind={kind}
                    width={NODE_WIDTH + 10}
                    height={NODE_HEIGHT + 10}
                    stroke="var(--ds-accent)"
                    strokeWidth={1.5}
                    fill="none"
                />
            )}
            <NodeShape
                kind={kind}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                stroke={stroke}
                strokeWidth={1.75}
                fill={fill}
            />
            {/* Pump decoration — small inscribed triangle suggesting flow direction. */}
            {kind === "pump" && (
                <polygon
                    points={`${-halfH * 0.35},${-halfH * 0.45} ${-halfH * 0.35},${halfH * 0.45} ${halfH * 0.55},0`}
                    fill="var(--ds-fg-muted)"
                    aria-hidden
                />
            )}
            {/* Kind badge — sentence-case muted, above the shape. */}
            <text
                x={0}
                y={-halfH - 10}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill="var(--ds-fg-subtle)"
                style={{ fontFamily: "var(--ds-font-sans)" }}
            >
                {kindCaption(kind)}
            </text>
            {/* Primary label — sentence-case, below the shape. */}
            <text
                x={0}
                y={halfH + 20}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--ds-fg-primary)"
                style={{ fontFamily: "var(--ds-font-sans)" }}
            >
                {label}
            </text>
        </g>
    );
}

function kindCaption(kind: EquipmentKind): string {
    switch (kind) {
        case "tank":
            return "Tank";
        case "pump":
            return "Pump";
        case "valve":
            return "Valve";
        case "outlet":
            return "Outlet";
    }
}

interface NodeShapeProps {
    kind: EquipmentKind;
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    fill: string;
}

function NodeShape({ kind, width, height, stroke, strokeWidth, fill }: NodeShapeProps) {
    const halfW = width / 2;
    const halfH = height / 2;

    switch (kind) {
        case "pump":
            return (
                <circle
                    cx={0}
                    cy={0}
                    r={halfH}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                />
            );
        case "valve":
            return (
                <polygon
                    points={`0,${-halfH} ${halfH},0 0,${halfH} ${-halfH},0`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                />
            );
        case "outlet":
            return (
                <polygon
                    points={`${-halfW},${-halfH} ${halfW},${-halfH * 0.55} ${halfW},${halfH * 0.55} ${-halfW},${halfH}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                />
            );
        default:
            return (
                <rect
                    x={-halfW}
                    y={-halfH}
                    width={width}
                    height={height}
                    rx={6}
                    ry={6}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                />
            );
    }
}
