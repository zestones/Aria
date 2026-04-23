import { useMemo, useState } from "react";
import { Hairline, SectionHeader } from "../design-system";
import {
    EquipmentInspector,
    type InspectorNode,
    PID_NODES,
    PidDiagram,
} from "../features/control-room";

export default function ControlRoomPage() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const selectedNode = useMemo<InspectorNode | null>(() => {
        if (!selectedNodeId) return null;
        const match = PID_NODES.find((n) => n.id === selectedNodeId);
        if (!match) return null;
        return { id: match.id, kind: match.kind, label: match.label };
    }, [selectedNodeId]);

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader label="Control room" size="lg" meta={<span>Apr 23, 2026</span>} />
            <Hairline />
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)]">
                <PidDiagram
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                    className="block"
                />
                <EquipmentInspector
                    open={selectedNode !== null}
                    node={selectedNode}
                    onClose={() => setSelectedNodeId(null)}
                />
            </div>
        </section>
    );
}
