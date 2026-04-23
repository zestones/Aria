import { EquipmentNode } from "./EquipmentNode";
import type { EquipmentEntry } from "./useEquipmentList";

export interface EquipmentGridProps {
    /**
     * Generic equipment entries to render — driven by backend data via
     * `useEquipmentList`. No equipment-type assumption lives here.
     */
    entries: readonly EquipmentEntry[];
    /** Currently selected node id — drives selection ring. Null = none. */
    selectedNodeId: string | null;
    /** Click handler; receives the `EquipmentEntry.id`. */
    onSelectNode: (id: string) => void;
    /** Loading flag — renders a muted placeholder without shifting layout. */
    isLoading?: boolean;
    className?: string;
}

/**
 * Responsive grid of uniform equipment cards (M7.1 refactor, issue #40).
 *
 * Replaces the shipped `PidDiagram` ladder with a **data-driven** layout —
 * no hardcoded nodes, no flow edges, no pump/tank/valve shapes. Cards are
 * laid out by a plain CSS grid (2 / 3 / 4 columns by viewport) and the only
 * visual state signal is the left status rail on each card.
 *
 * This keeps the UI faithful to the "Adaptive Runtime Intelligence" pitch:
 * whatever cell list the backend surfaces — pump station, QR-scanner line,
 * CNC cell, 3D printer — the grid renders it generically.
 *
 * Flow-edge rendering was intentionally dropped in M7.1 refactor. If future
 * iterations need routing (e.g. upstream/downstream arrows driven by backend
 * adjacency data), introduce it as a separate, also-generic layer.
 */
export function EquipmentGrid({
    entries,
    selectedNodeId,
    onSelectNode,
    isLoading = false,
    className = "",
}: EquipmentGridProps) {
    if (isLoading) {
        return (
            <div
                data-testid="equipment-grid"
                data-state="loading"
                className={`flex h-full items-center justify-center p-6 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)] ${className}`}
            >
                Loading equipment…
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div
                data-testid="equipment-grid"
                data-state="empty"
                className={`flex h-full items-center justify-center p-6 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)] ${className}`}
            >
                No equipment in scope.
            </div>
        );
    }

    return (
        <ul
            data-testid="equipment-grid"
            data-state="ready"
            className={`grid h-full auto-rows-min list-none grid-cols-2 gap-[var(--ds-space-3,12px)] overflow-auto p-[var(--ds-space-4,16px)] md:grid-cols-3 lg:grid-cols-4 ${className}`}
            aria-label="Equipment cells"
        >
            {entries.map((entry) => (
                <li key={entry.id}>
                    <EquipmentNode
                        id={entry.id}
                        label={entry.label}
                        sublabel={entry.sublabel}
                        status={entry.status}
                        selected={selectedNodeId === entry.id}
                        onClick={() => onSelectNode(entry.id)}
                    />
                </li>
            ))}
        </ul>
    );
}
