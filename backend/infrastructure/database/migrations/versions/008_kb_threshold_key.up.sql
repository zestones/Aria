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
-- Seed P-02 mapping (matches migration 007 KB seed)
-- ============================================
UPDATE
    process_signal_definition psd
SET
    kb_threshold_key = m.kb_key
FROM
    signal_tag st
    JOIN cell c ON c.id = st.cell_id
    JOIN (
        VALUES ('vibration_refoulement', 'vibration_mm_s'),
('temperature_palier', 'bearing_temp_c'),
('debit_refoulement', 'flow_l_min'),
('pression_refoulement', 'pressure_bar')) AS m(tag_name, kb_key) ON m.tag_name = st.tag_name
WHERE
    psd.signal_tag_id = st.id
    AND c.name = 'P-02'
    AND psd.kb_threshold_key IS NULL;

