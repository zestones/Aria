/**
 * KB service — equipment knowledge base CRUD.
 * Wraps `/kb/equipment/*`. Wire types come from the onboarding feature
 * (which also owns the upload flow that produces these payloads).
 */

import type { EquipmentKB, EquipmentKbOut } from "../../features/onboarding";
import { apiFetch } from "../../lib/api";

export interface UpsertEquipmentKbBody {
    cell_id: number;
    structured_data: EquipmentKB;
    equipment_type?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    installation_date?: string | null;
    last_updated_by: string;
}

export function getEquipmentKb(cellId: number): Promise<EquipmentKbOut> {
    return apiFetch<EquipmentKbOut>(`/kb/equipment/${cellId}`);
}

export function upsertEquipmentKb(body: UpsertEquipmentKbBody): Promise<EquipmentKbOut> {
    return apiFetch<EquipmentKbOut>("/kb/equipment", { method: "PUT", body });
}
