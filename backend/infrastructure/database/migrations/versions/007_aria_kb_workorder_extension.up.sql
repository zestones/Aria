-- ============================================
-- ARIA — KB + Work Order extension (M1.1)
--
-- Brings equipment_kb in line with the agent + frontend contract decided in
-- technical.md §2.4 : structured_data is the single source of truth for KB
-- content (Pydantic EquipmentKB blob). The 3 legacy jsonb columns are
-- superseded and dropped.
--
-- Scope of this file:
--   - equipment_kb: drop 3 legacy columns, add 5 new columns
--   - re-seed P-02 Grundfos CR 32-2 with a valid structured_data blob
--     (seed lives here because it depends on columns added above)
-- ============================================
-- ============================================
-- equipment_kb — drop legacy jsonb columns (replaced by structured_data)
-- ============================================
ALTER TABLE equipment_kb
    DROP COLUMN nominal_specs,
    DROP COLUMN common_failure_modes,
    DROP COLUMN maintenance_recommendations;

-- ============================================
-- equipment_kb — new columns
-- ============================================
ALTER TABLE equipment_kb
    ADD COLUMN structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN raw_markdown text,
    ADD COLUMN confidence_score real NOT NULL DEFAULT 0.0,
    ADD COLUMN last_enriched_at timestamptz,
    ADD COLUMN onboarding_complete boolean NOT NULL DEFAULT FALSE;

-- ============================================
-- Equipment KB seed — P-02 Grundfos CR 32-2 multistage centrifugal pump
--
-- Nominal duty point: 32 m³/h (533 L/min) at ~5.5 bar, 2-stage inline.
-- Motor: 5.5 kW / 2-pole / 2900 rpm. ISO 10816-3 vibration zones.
-- structured_data shape matches Pydantic EquipmentKB (M1.4): equipment,
-- thresholds, failure_patterns, maintenance_procedures, kb_meta.
-- ============================================
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'Centrifugal Pump',
    'Grundfos',
    'CR 32-2',
(NOW() - INTERVAL '18 months')::date,
    'P-02 — main raw water booster, 24/7 service. Last bearing change: 14 months ago.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Centrifugal Pump', 'manufacturer', 'Grundfos', 'model', 'CR 32-2', 'installation_date',(NOW() - INTERVAL '18 months')::date, 'service_description', 'Main raw water booster, 24/7 service', 'motor_power_kw', 5.5, 'rpm_nominal', 2900), 'thresholds', jsonb_build_object('vibration_mm_s', jsonb_build_object('nominal', 2.2, 'alert', 4.5, 'trip', 7.1, 'unit', 'mm/s', 'source', 'ISO 10816-3 Zone B/C boundary', 'confidence', 0.9), 'bearing_temp_c', jsonb_build_object('nominal', 48, 'alert', 75, 'trip', 90, 'unit', '°C', 'source', 'Grundfos CR service manual', 'confidence', 0.85), 'flow_l_min', jsonb_build_object('nominal', 533, 'low_alert', 480, 'high_alert', 580, 'unit', 'L/min', 'source', 'Process design duty point (32 m³/h)', 'confidence', 0.9), 'pressure_bar', jsonb_build_object('nominal', 5.5, 'low_alert', 4.5, 'high_alert', 6.5, 'unit', 'bar', 'source', 'Process design', 'confidence', 0.9)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'bearing_wear', 'symptoms', 'progressive vibration drift, bearing temp rise', 'mtbf_months', 14, 'signal_signature', jsonb_build_object('vibration_mm_s', 'slow_drift_up', 'bearing_temp_c', 'slow_drift_up')), jsonb_build_object('mode', 'mechanical_seal_leak', 'symptoms', 'flow drop, pressure fluctuation', 'mtbf_months', 24, 'signal_signature', jsonb_build_object('flow_l_min', 'step_drop', 'pressure_bar', 'oscillation')), jsonb_build_object('mode', 'impeller_imbalance', 'symptoms', 'sudden vibration spike at 1x rpm', 'mtbf_months', 36, 'signal_signature', jsonb_build_object('vibration_mm_s', 'step_up'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'bearing replacement', 'interval_months', 12, 'duration_min', 240, 'parts', jsonb_build_array('Grundfos 96416067 upper bearing', 'Grundfos 96416068 lower bearing')), jsonb_build_object('action', 'shaft seal replacement', 'interval_months', 18, 'duration_min', 180, 'parts', jsonb_build_array('Grundfos 96416072 shaft seal kit (HQQE)')), jsonb_build_object('action', 'vibration spectrum analysis', 'interval_months', 3, 'duration_min', 30, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.85, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.85,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'P-02'
ON CONFLICT (cell_id)
    DO NOTHING;

