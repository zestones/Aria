import type { EquipmentSelection } from "../../lib/hierarchy";

export const EQUIPMENT_KEY = "aria.selectedEquipment";

export function validateEquipmentSelection(raw: unknown): EquipmentSelection | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.cellId !== "number" || typeof r.lineId !== "number") return null;
    if (typeof r.cellName !== "string" || typeof r.lineName !== "string") return null;
    if (typeof r.areaName !== "string" || typeof r.siteName !== "string") return null;
    return raw as EquipmentSelection;
}
