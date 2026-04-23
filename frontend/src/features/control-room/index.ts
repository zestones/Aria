export type { EquipmentGridProps } from "./EquipmentGrid";
export { EquipmentGrid } from "./EquipmentGrid";
export type { EquipmentInspectorProps, InspectorNode } from "./EquipmentInspector";
export { EquipmentInspector } from "./EquipmentInspector";
export type {
    EquipmentKind,
    EquipmentNodeProps,
    EquipmentStatus,
} from "./EquipmentNode";
export { EquipmentNode } from "./EquipmentNode";
export type { EquipmentEntry, UseEquipmentListResult } from "./useEquipmentList";
export { useEquipmentList } from "./useEquipmentList";

// NOTE: `FlowEdge` and `PidDiagram` were removed in the M7.1 refactor (#40).
// The grid is data-driven and node-only; reintroducing edges should be driven
// by backend adjacency data, not hardcoded topology.
