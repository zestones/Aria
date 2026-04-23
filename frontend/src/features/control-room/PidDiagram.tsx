import { type EquipmentKind, EquipmentNode, type EquipmentStatus } from "./EquipmentNode";
import { FLOW_ARROW_MARKER_ID, FlowEdge } from "./FlowEdge";

/**
 * Layout coordinate for one P&ID node. x/y are the *center* of the shape in
 * the viewBox. Edge endpoints are computed from each node's shape radius so
 * arrows touch the silhouette, not the center.
 */
interface PidNode {
    id: string;
    kind: EquipmentKind;
    label: string;
    x: number;
    y: number;
    status: EquipmentStatus;
}

interface PidEdge {
    id: string;
    from: string;
    to: string;
}

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 320;
const ROW_Y = 170;

/**
 * Scene P-02 (bearing failure) — five-node horizontal ladder. Order mirrors
 * the seeded simulator line: raw water tank → booster pump → check valve →
 * dosing pump (the node that fails in the demo) → outlet.
 *
 * Status is hardcoded `nominal` for every node — M7.1a is static skeleton.
 * Live status binding and anomaly wiring land in M7.1b.
 */
const NODES: readonly PidNode[] = [
    { id: "tank", kind: "tank", label: "Tank", x: 90, y: ROW_Y, status: "nominal" },
    { id: "p-01", kind: "pump", label: "P-01", x: 260, y: ROW_Y, status: "nominal" },
    { id: "valve", kind: "valve", label: "Valve", x: 420, y: ROW_Y, status: "nominal" },
    { id: "p-02", kind: "pump", label: "P-02", x: 580, y: ROW_Y, status: "nominal" },
    { id: "outlet", kind: "outlet", label: "Outlet", x: 720, y: ROW_Y, status: "nominal" },
];

const EDGES: readonly PidEdge[] = [
    { id: "tank-p01", from: "tank", to: "p-01" },
    { id: "p01-valve", from: "p-01", to: "valve" },
    { id: "valve-p02", from: "valve", to: "p-02" },
    { id: "p02-outlet", from: "p-02", to: "outlet" },
];

/** Half-width of each kind's silhouette, used for arrow endpoint insets. */
const KIND_HALF_WIDTH: Record<EquipmentKind, number> = {
    tank: 44,
    pump: 32,
    valve: 32,
    outlet: 44,
};

const ARROW_GAP = 8;

export interface PidDiagramProps {
    /** Currently selected node id — drives selection ring. */
    selectedNodeId: string | null;
    /** Click handler for any node. */
    onSelectNode: (id: string) => void;
    className?: string;
}

/**
 * Pure-SVG piping & instrumentation diagram for the scene-P-02 demo line.
 * Renders a left-to-right ladder of five equipment nodes wired by four flow
 * edges. Selection state is controlled externally — `PidDiagram` stays
 * stateless beyond layout.
 */
export function PidDiagram({ selectedNodeId, onSelectNode, className = "" }: PidDiagramProps) {
    const nodeById = new Map(NODES.map((n) => [n.id, n]));

    return (
        <svg
            data-testid="pid-diagram"
            className={className}
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Scene P-02 piping and instrumentation diagram"
            style={{ width: "100%", height: "100%" }}
        >
            <defs>
                <marker
                    id={FLOW_ARROW_MARKER_ID}
                    viewBox="0 0 10 10"
                    refX={8}
                    refY={5}
                    markerWidth={8}
                    markerHeight={8}
                    orient="auto-start-reverse"
                >
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--ds-border-strong)" />
                </marker>
            </defs>
            {/* Edges render first so nodes sit above them. */}
            <g data-testid="pid-edges">
                {EDGES.map((edge) => {
                    const a = nodeById.get(edge.from);
                    const b = nodeById.get(edge.to);
                    if (!a || !b) return null;
                    const aHalf = KIND_HALF_WIDTH[a.kind];
                    const bHalf = KIND_HALF_WIDTH[b.kind];
                    return (
                        <FlowEdge
                            key={edge.id}
                            id={edge.id}
                            from={{ x: a.x + aHalf + ARROW_GAP, y: a.y }}
                            to={{ x: b.x - bHalf - ARROW_GAP, y: b.y }}
                        />
                    );
                })}
            </g>
            <g data-testid="pid-nodes">
                {NODES.map((node) => (
                    <EquipmentNode
                        key={node.id}
                        id={node.id}
                        kind={node.kind}
                        label={node.label}
                        x={node.x}
                        y={node.y}
                        status={node.status}
                        selected={selectedNodeId === node.id}
                        onClick={() => onSelectNode(node.id)}
                    />
                ))}
            </g>
        </svg>
    );
}

export const PID_NODES = NODES;
