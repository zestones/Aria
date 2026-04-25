-- ============================================
-- 008 — Explicit KB threshold key on process_signal_definition
-- ============================================
-- Replaces the M2.3 fuzzy ``match_threshold_key_to_signal`` heuristic with
-- an explicit, indexed mapping. KBs stay portable (semantic keys like
-- ``vibration_mm_s``); each site declares which signal carries which key.
-- ============================================
ALTER TABLE process_signal_definition
    ADD COLUMN IF NOT EXISTS kb_threshold_key text;

CREATE INDEX IF NOT EXISTS idx_psd_cell_kb_key ON process_signal_definition(cell_id, kb_threshold_key)
WHERE
    kb_threshold_key IS NOT NULL;

COMMENT ON COLUMN process_signal_definition.kb_threshold_key IS 'Explicit link to equipment_kb.structured_data.thresholds.<key>. NULL when the signal has no KB threshold.';

-- ============================================
-- Seed mappings for the 5-cell demo plant.
-- Must stay aligned with the threshold keys in seeds/01_demo_kb.sql.
-- ============================================
UPDATE
    process_signal_definition psd
SET
    kb_threshold_key = m.kb_key
FROM
    signal_tag st
    JOIN cell c ON c.id = st.cell_id
    JOIN (
        VALUES
            -- Source Pump
            ('Source Pump',   'pump_motor_current',      'motor_current_a'),
            ('Source Pump',   'pump_discharge_pressure', 'pressure_bar'),
            ('Source Pump',   'pump_flow',               'flow_l_min'),
            ('Source Pump',   'pump_vibration',          'vibration_mm_s'),
            -- UV Sterilizer
            ('UV Sterilizer', 'uv_intensity',            'uv_intensity_mw_cm2'),
            ('UV Sterilizer', 'uv_runtime',              'uv_runtime_h'),
            ('UV Sterilizer', 'uv_flow',                 'flow_l_min'),
            ('UV Sterilizer', 'uv_motor_current',        'motor_current_a'),
            -- Bottle Filler (the demo star)
            ('Bottle Filler', 'filler_vibration',        'vibration_mm_s'),
            ('Bottle Filler', 'filler_bearing_temp',     'bearing_temp_c'),
            ('Bottle Filler', 'filler_pressure',         'pressure_bar'),
            ('Bottle Filler', 'filler_flow',             'flow_l_min'),
            ('Bottle Filler', 'filler_bpm',              'bottles_per_minute'),
            -- Bottle Capper (memory-scene target)
            ('Bottle Capper', 'capper_vibration',        'vibration_mm_s'),
            ('Bottle Capper', 'capper_torque',           'cap_torque_nm'),
            ('Bottle Capper', 'capper_motor_current',    'motor_current_a'),
            ('Bottle Capper', 'capper_jam_rate',         'jam_events_per_h')
    ) AS m(cell_name, tag_name, kb_key)
        ON m.cell_name = c.name AND m.tag_name = st.tag_name
WHERE
    psd.signal_tag_id = st.id
    AND psd.kb_threshold_key IS NULL;
