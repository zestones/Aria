-- ============================================
-- ARIA — Demo plant equipment_kb seed (5 cells)
--
-- Idempotent: ON CONFLICT (cell_id) DO UPDATE replaces structured_data
-- and metadata so manual UI upserts that drift the KB are recoverable.
--
-- Threshold keys MUST match migration 008's mapping exactly. See
-- docs/planning/M9-polish-e2e/demo-seed-content.md §2 for envelope shapes.
-- ============================================
-- Ensure MAINTENANCE and CHANGEOVER status codes exist (added after 004_seed_reference).
INSERT INTO machine_status_code(status_code, status_name, is_productive, status_category)
VALUES
    (4, 'MAINTENANCE', FALSE, 'planned_stop'),
(5, 'CHANGEOVER', FALSE, 'planned_stop')
ON CONFLICT
    DO NOTHING;

-- ---------- 1. Source Pump ----------
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'Centrifugal Pump',
    'Grundfos',
    'CR 64-3-2',
(NOW() - INTERVAL '22 months')::date,
    'Pumps raw water from the well to the pre-treatment tank. 24/7 service.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Centrifugal Pump', 'manufacturer', 'Grundfos', 'model', 'CR 64-3-2', 'installation_date',(NOW() - INTERVAL '22 months')::date, 'service_description', 'Raw water booster from underground well', 'motor_power_kw', 11.0, 'rpm_nominal', 2900), 'thresholds', jsonb_build_object('motor_current_a', jsonb_build_object('nominal', 12.0, 'alert', 18.0, 'trip', 22.0, 'unit', 'A', 'source', 'Nameplate FLA + 50%', 'confidence', 0.9), 'pressure_bar', jsonb_build_object('nominal', 4.8, 'low_alert', 4.0, 'high_alert', 5.8, 'unit', 'bar', 'source', 'Process design duty point', 'confidence', 0.9), 'flow_l_min', jsonb_build_object('nominal', 820, 'low_alert', 720, 'high_alert', 900, 'unit', 'L/min', 'source', 'Pump curve duty point', 'confidence', 0.9), 'vibration_mm_s', jsonb_build_object('nominal', 2.5, 'alert', 4.5, 'trip', 7.1, 'unit', 'mm/s', 'source', 'ISO 10816-3 Zone B/C boundary', 'confidence', 0.9)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'cavitation', 'symptoms', 'low suction pressure, vibration spike', 'mtbf_months', 30, 'signal_signature', jsonb_build_object('pressure_bar', 'oscillation', 'vibration_mm_s', 'spike')), jsonb_build_object('mode', 'mechanical_seal_leak', 'symptoms', 'flow drop, audible drip', 'mtbf_months', 24, 'signal_signature', jsonb_build_object('flow_l_min', 'step_drop'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'shaft seal replacement', 'interval_months', 18, 'duration_min', 180, 'parts', jsonb_build_array('Grundfos seal kit')), jsonb_build_object('action', 'bearing greasing', 'interval_months', 6, 'duration_min', 30, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.85, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.85,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'Source Pump'
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

-- ---------- 2. UV Sterilizer ----------
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'UV Reactor',
    'Trojan',
    'UV3000Plus',
(NOW() - INTERVAL '14 months')::date,
    'Kills bacteria and viruses in the incoming water with UV light.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'UV Reactor', 'manufacturer', 'Trojan', 'model', 'UV3000Plus', 'installation_date',(NOW() - INTERVAL '14 months')::date, 'service_description', '4-bank UV sterilizer for potable water', 'motor_power_kw', 1.6, 'rpm_nominal', 1450), 'thresholds', jsonb_build_object('uv_intensity_mw_cm2', jsonb_build_object('nominal', 28.0, 'low_alert', 22.0, 'low_trip', 18.0, 'unit', 'mW/cm2', 'source', 'EPA UVDGM 2006 minimum dose', 'confidence', 0.9), 'uv_runtime_h', jsonb_build_object('nominal', 4500, 'alert', 7500, 'trip', 9000, 'unit', 'h', 'source', 'Trojan lamp life rating', 'confidence', 0.95), 'flow_l_min', jsonb_build_object('nominal', 820, 'low_alert', 720, 'high_alert', 900, 'unit', 'L/min', 'source', 'Reactor design duty', 'confidence', 0.9), 'motor_current_a', jsonb_build_object('nominal', 3.2, 'alert', 5.0, 'trip', 6.5, 'unit', 'A', 'source', 'Drive nameplate FLA', 'confidence', 0.85)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'lamp_replacement', 'symptoms', 'irradiance drop below 80% of nominal', 'mtbf_months', 12, 'signal_signature', jsonb_build_object('uv_intensity_mw_cm2', 'step_drop', 'uv_runtime_h', 'monotonic_up'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'UV lamp replacement', 'interval_months', 12, 'duration_min', 60, 'parts', jsonb_build_array('Trojan UV3K-LAMP-440W')), jsonb_build_object('action', 'quartz sleeve cleaning', 'interval_months', 3, 'duration_min', 45, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.82, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.82,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'UV Sterilizer'
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

-- ---------- 3. Bottle Filler — the demo star ----------
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'Centrifugal Pump',
    'Grundfos',
    'CR 32-2',
(NOW() - INTERVAL '18 months')::date,
    'Fills empty bottles with clean water. Replaces both bearings on a 12-month PM cycle.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Centrifugal Pump', 'manufacturer', 'Grundfos', 'model', 'CR 32-2', 'installation_date',(NOW() - INTERVAL '18 months')::date, 'service_description', 'Bottle filler — main pump', 'motor_power_kw', 5.5, 'rpm_nominal', 2900), 'thresholds', jsonb_build_object('vibration_mm_s', jsonb_build_object('nominal', 2.2, 'alert', 4.5, 'trip', 7.1, 'unit', 'mm/s', 'source', 'ISO 10816-3 Zone B/C boundary', 'confidence', 0.9), 'bearing_temp_c', jsonb_build_object('nominal', 48, 'alert', 75, 'trip', 90, 'unit', 'C', 'source', 'Grundfos CR service manual', 'confidence', 0.85), 'pressure_bar', jsonb_build_object('nominal', 5.5, 'low_alert', 4.5, 'high_alert', 6.5, 'unit', 'bar', 'source', 'Process design', 'confidence', 0.9), 'flow_l_min', jsonb_build_object('nominal', 533, 'low_alert', 480, 'high_alert', 580, 'unit', 'L/min', 'source', 'Process design duty point (32 m3/h)', 'confidence', 0.9), 'bottles_per_minute', jsonb_build_object('nominal', 180, 'low_alert', 150, 'unit', '/min', 'source', 'Line throughput target', 'confidence', 0.9)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'bearing_wear', 'symptoms', 'progressive vibration drift, bearing temp rise', 'mtbf_months', 14, 'signal_signature', jsonb_build_object('vibration_mm_s', 'slow_drift_up', 'bearing_temp_c', 'slow_drift_up', 'bearing_reference', '6206', 'n_balls', 9, 'pitch_diameter_mm', 46.0, 'ball_diameter_mm', 9.5, 'contact_angle_deg', 0, 'shaft_rpm_nominal', 2900)), jsonb_build_object('mode', 'mechanical_seal_leak', 'symptoms', 'flow drop, pressure fluctuation', 'mtbf_months', 24, 'signal_signature', jsonb_build_object('flow_l_min', 'step_drop', 'pressure_bar', 'oscillation')), jsonb_build_object('mode', 'impeller_imbalance', 'symptoms', 'sudden vibration spike at 1x rpm', 'mtbf_months', 36, 'signal_signature', jsonb_build_object('vibration_mm_s', 'step_up'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'bearing replacement', 'interval_months', 12, 'duration_min', 240, 'parts', jsonb_build_array('Grundfos 96416067 upper bearing', 'Grundfos 96416068 lower bearing')), jsonb_build_object('action', 'shaft seal replacement', 'interval_months', 18, 'duration_min', 180, 'parts', jsonb_build_array('Grundfos 96416072 shaft seal kit (HQQE)')), jsonb_build_object('action', 'vibration spectrum analysis', 'interval_months', 3, 'duration_min', 30, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.88, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.88,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'Bottle Filler'
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

-- ---------- 4. Bottle Capper — memory-scene target ----------
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'Servo Drive',
    'SEW-Eurodrive',
    'DRN90L4BE5',
(NOW() - INTERVAL '16 months')::date,
    'Screws caps onto filled bottles. Drive motor replaced 16 months ago.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Servo Drive', 'manufacturer', 'SEW-Eurodrive', 'model', 'DRN90L4BE5', 'installation_date',(NOW() - INTERVAL '16 months')::date, 'service_description', 'Cap-screw spindle drive', 'motor_power_kw', 1.5, 'rpm_nominal', 1450), 'thresholds', jsonb_build_object('vibration_mm_s', jsonb_build_object('nominal', 1.8, 'alert', 4.2, 'trip', 6.5, 'unit', 'mm/s', 'source', 'SEW service manual', 'confidence', 0.85), 'cap_torque_nm', jsonb_build_object('nominal', 3.5, 'low_alert', 2.8, 'high_alert', 4.2, 'unit', 'Nm', 'source', 'Cap-spec process window', 'confidence', 0.9), 'motor_current_a', jsonb_build_object('nominal', 4.1, 'alert', 6.0, 'trip', 7.5, 'unit', 'A', 'source', 'Nameplate FLA', 'confidence', 0.9), 'jam_events_per_h', jsonb_build_object('nominal', 0, 'alert', 3, 'trip', 8, 'unit', '/h', 'source', 'Line OEE target', 'confidence', 0.85)), 'failure_patterns', jsonb_build_array(jsonb_build_object('mode', 'bearing_wear', 'symptoms', 'progressive drive vibration drift, torque variance', 'mtbf_months', 14, 'signal_signature', jsonb_build_object('vibration_mm_s', 'slow_drift_up', 'cap_torque_nm', 'oscillation', 'bearing_reference', '6203', 'n_balls', 8, 'pitch_diameter_mm', 29.0, 'ball_diameter_mm', 6.75, 'shaft_rpm_nominal', 1450)), jsonb_build_object('mode', 'cap_jam', 'symptoms', 'torque spike, jam counter rises', 'mtbf_months', 1, 'signal_signature', jsonb_build_object('cap_torque_nm', 'spike', 'jam_events_per_h', 'spike'))), 'maintenance_procedures', jsonb_build_array(jsonb_build_object('action', 'spindle bearing replacement', 'interval_months', 12, 'duration_min', 180, 'parts', jsonb_build_array('SKF 6203-2Z')), jsonb_build_object('action', 'torque sensor calibration', 'interval_months', 6, 'duration_min', 45, 'parts', jsonb_build_array())), 'kb_meta', jsonb_build_object('version', 1, 'completeness_score', 0.84, 'onboarding_complete', TRUE, 'last_calibrated_by', 'seed')),
    0.84,
    TRUE,
    NOW()
FROM
    cell c
WHERE
    c.name = 'Bottle Capper'
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

-- ---------- 5. Bottle Labeler — onboarding target (NOT onboarded) ----------
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, notes, last_updated_by, structured_data, confidence_score, onboarding_complete, last_enriched_at)
SELECT
    c.id,
    'Labeler',
    'Krones',
    'Contiroll',
(NOW() - INTERVAL '2 months')::date,
    'New machine — not yet onboarded. Upload the IOM PDF to calibrate.',
    'seed',
    jsonb_build_object('equipment', jsonb_build_object('cell_id', c.id, 'equipment_type', 'Labeler', 'manufacturer', 'Krones', 'model', 'Contiroll', 'installation_date',(NOW() - INTERVAL '2 months')::date, 'service_description', 'Bottle labeler (pending KB onboarding)'), 'thresholds', jsonb_build_object(), 'failure_patterns', jsonb_build_array(), 'maintenance_procedures', jsonb_build_array(), 'kb_meta', jsonb_build_object('version', 0, 'completeness_score', 0.10, 'onboarding_complete', FALSE, 'last_calibrated_by', 'seed')),
    0.10,
    FALSE,
    NULL
FROM
    cell c
WHERE
    c.name = 'Bottle Labeler'
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

