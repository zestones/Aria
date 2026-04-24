import { useMemo, useState } from "react";
import { Hairline, SectionHeader } from "../components/ui";
import {
    EQUIPMENT_KEY,
    EquipmentGrid,
    EquipmentInspector,
    INSPECTOR_DRAWER_WIDTH,
    type InspectorNode,
    useEquipmentList,
    validateEquipmentSelection,
} from "../features/control-room";
import { formatHeaderDate } from "../lib/date";
import type { EquipmentSelection } from "../lib/hierarchy";
import { useLocalStorage } from "../lib/useLocalStorage";

/**
 * Control room landing page — M7.1 refactor (#40).
 *
 * Renders a data-driven, equipment-agnostic grid of cells scoped to the
 * user's current selection (read from the same `aria.selectedEquipment`
 * localStorage slot the TopBar's EquipmentPicker writes). No P&ID ladder,
 * no hardcoded topology — the list comes from `/hierarchy/tree`.
 *
 * Clicking a node opens the left inspector. Live signals / KB / WO content
 * ships in M7.1b.
 */
export default function ControlRoomPage() {
    const [selection] = useLocalStorage<EquipmentSelection | null>(EQUIPMENT_KEY, null, {
        validator: validateEquipmentSelection,
    });
    const { entries, isLoading } = useEquipmentList(selection);

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const selectedNode = useMemo<InspectorNode | null>(() => {
        if (!selectedNodeId) return null;
        const match = entries.find((e) => e.id === selectedNodeId);
        if (!match) return null;
        // `kind` is preserved on `InspectorNode` for backwards compatibility;
        // we no longer differentiate by equipment type, so pass a generic
        // `cell` tag. `subLabel` surfaces the parent line name in the header.
        return {
            id: match.id,
            kind: "cell",
            label: match.label,
            subLabel: match.sublabel,
        };
    }, [selectedNodeId, entries]);

    const scopeLabel = selection?.lineName ?? "All lines";
    const today = useMemo(() => formatHeaderDate(), []);

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Control room"
                size="lg"
                meta={
                    <span>
                        {scopeLabel} · {today}
                    </span>
                }
            />
            <Hairline />
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)]">
                <div
                    className="absolute inset-0"
                    style={{
                        paddingLeft: selectedNode ? `${INSPECTOR_DRAWER_WIDTH}px` : "0px",
                        transition: "padding-left var(--ds-motion-base) var(--ds-ease-out)",
                    }}
                >
                    <EquipmentGrid
                        entries={entries}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={setSelectedNodeId}
                        isLoading={isLoading}
                    />
                </div>
                <EquipmentInspector
                    open={selectedNode !== null}
                    node={selectedNode}
                    onClose={() => setSelectedNodeId(null)}
                />
            </div>
        </section>
    );
}
