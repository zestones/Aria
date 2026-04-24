-- ============================================
-- ARIA — P-02 KB canonical re-seed (issue #69)
--
-- Idempotent restore of the equipment_kb row for cell P-02. Mirrors the
-- structured_data blob seeded by migration 007 but uses ON CONFLICT DO UPDATE
-- so it can be re-run any time (e.g. after a manual upsert via the UI drifted
-- the KB and broke get_signal_anomalies). Run via `make db.seed.p02`.
--
-- Required keys (must stay in sync with process_signal_definition.kb_threshold_key
-- mapping installed by migration 008):
--   vibration_mm_s, bearing_temp_c, flow_l_min, pressure_bar
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
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Centrifugal Pump', 'manufacturer', 'Grundfos', 'model', 'CR 32-2', 'installation_date',(NOW() - INTERVAL '18 months')::date, 'service_description', 'Main raw water booster, 24/7 service', 'motor_power_kw', 5.5, 'rpm_nominal', 2900), 'thresholds', jsonb_build_object('vibration_mm_s', jsonb_build_object('nominal', 2.2, 'alert', 4.5, 'trip', 7.1, 'unit', 'mm/s', 'source', 'ISO 10816-3 Zone B/C boundary', 'confidence', 0.9), 'bearing_temp_c', jsonb_build_object('nominal', 48, 'alert', 75, 'trip', 90, 'unit', '°C', 'source', 'Grundfos CR service manual', 'confidence', 0.85), 'flow_l_min', jsonb_build_object('nominal', 533, 'low_alert', 480, 'high_alert', 580, 'unit', 'L/min', 'source', 'Process design duty point (32 m³/h)', 'confidence', 0.9), 'pressure_bar', jsonb_build_object('nominal', 5.5, 'low_alert', 4.5, 'high_alert', 6.5, 'unit', 'bar', 'source', 'Process design', 'confidence', 0.9)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'bearing_wear', 'symptoms', 'progressive vibration drift, bearing temp rise', 'mtbf_months', 14, 'signal_signature', jsonb_build_object('vibration_mm_s', 'slow_drift_up', 'bearing_temp_c', 'slow_drift_up', 'bearing_reference', '6206', 'n_balls', 9, 'pitch_diameter_mm', 46.0, 'ball_diameter_mm', 9.5, 'contact_angle_deg', 0, 'shaft_rpm_nominal', 2900)), jsonb_build_object('mode', 'mechanical_seal_leak', 'symptoms', 'flow drop, pressure fluctuation', 'mtbf_months', 24, 'signal_signature', jsonb_build_object('flow_l_min', 'step_drop', 'pressure_bar', 'oscillation')), jsonb_build_object('mode', 'impeller_imbalance', 'symptoms', 'sudden vibration spike at 1x rpm', 'mtbf_months', 36, 'signal_signature', jsonb_build_object('vibration_mm_s', 'step_up'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'bearing replacement', 'interval_months', 12, 'duration_min', 240, 'parts', jsonb_build_array('Grundfos 96416067 upper bearing', 'Grundfos 96416068 lower bearing')), jsonb_build_object('action', 'shaft seal replacement', 'interval_months', 18, 'duration_min', 180, 'parts', jsonb_build_array('Grundfos 96416072 shaft seal kit (HQQE)')), jsonb_build_object('action', 'vibration spectrum analysis', 'interval_months', 3, 'duration_min', 30, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.85, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.85,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'P-02'
ON CONFLICT (cell_id)
    DO UPDATE SET
        equipment_type = EXCLUDED.equipment_type,
        manufacturer = EXCLUDED.manufacturer,
        model = EXCLUDED.model,
        installation_date = EXCLUDED.installation_date,
        notes = EXCLUDED.notes,
        last_updated_by = EXCLUDED.last_updated_by,
        structured_data = EXCLUDED.structured_data,
        confidence_score = EXCLUDED.confidence_score,
        onboarding_complete = EXCLUDED.onboarding_complete,
        last_enriched_at = EXCLUDED.last_enriched_at,
        last_updated_at = NOW();

