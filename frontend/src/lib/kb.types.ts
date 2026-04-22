/**
 * Types pour equipment_kb — miroir exact des DTOs Pydantic backend
 * (`backend/modules/kb/schemas.py` + `kb_schema.py`).
 *
 * Partagés par `mockUpload` (M6.6) et, plus tard, par le vrai call
 * `POST /api/v1/kb/equipment/{cell_id}/upload` une fois M3.2 shipped.
 */

export interface ThresholdValue {
    nominal?: number | null;
    alert?: number | null;
    trip?: number | null;
    low_alert?: number | null;
    high_alert?: number | null;
    unit?: string | null;
    source?: string | null;
    confidence?: number | null;
}

export interface EquipmentMeta {
    equipment_type?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    motor_power_kw?: number | null;
    rpm_nominal?: number | null;
    service_description?: string | null;
}

export interface FailurePattern {
    mode: string;
    symptoms?: string | null;
    mtbf_months?: number | null;
}

export interface MaintenanceProcedure {
    action: string;
    interval_months?: number | null;
    duration_min?: number | null;
    parts?: string[];
}

export interface EquipmentKB {
    equipment?: EquipmentMeta;
    thresholds?: Record<string, ThresholdValue>;
    failure_patterns?: FailurePattern[];
    maintenance_procedures?: MaintenanceProcedure[];
}

export interface EquipmentKbOut {
    id: number;
    cell_id: number;
    cell_name?: string | null;
    equipment_type?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    installation_date?: string | null;
    structured_data?: EquipmentKB | null;
    raw_markdown?: string | null;
    confidence_score: number;
    last_enriched_at?: string | null;
    onboarding_complete: boolean;
    last_updated_by?: string | null;
    last_updated_at: string;
    created_at: string;
}
