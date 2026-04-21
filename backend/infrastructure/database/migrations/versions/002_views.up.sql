-- ============================================
-- ARIA — Database Views
-- ============================================
-- Current status per cell with full ISA-95 hierarchy
CREATE OR REPLACE VIEW current_cell_status AS
SELECT
    c.id AS cell_id,
    c.name AS cell_name,
    l.id AS line_id,
    l.name AS line_name,
    a.id AS area_id,
    a.name AS area_name,
    s.id AS site_id,
    s.name AS site_name,
    e.id AS enterprise_id,
    e.name AS enterprise_name,
    ms.time AS last_status_change,
    msc.status_name,
    msc.status_category,
    msc.is_productive
FROM
    cell c
    JOIN line l ON c.parentid = l.id
    JOIN area a ON l.parentid = a.id
    JOIN site s ON a.parentid = s.id
    JOIN enterprise e ON s.parentid = e.id
    LEFT JOIN LATERAL (
        SELECT
            time,
            status_code
        FROM
            machine_status
        WHERE
            cell_id = c.id
        ORDER BY
            time DESC
        LIMIT 1) ms ON TRUE
    LEFT JOIN machine_status_code msc ON ms.status_code = msc.status_code;

-- Latest production counter per cell
CREATE OR REPLACE VIEW current_production AS
SELECT
    c.id AS cell_id,
    c.name AS cell_name,
    l.name AS line_name,
    pe.time AS last_piece_time,
    pe.piece_counter,
    pe.piece_quality
FROM
    cell c
    JOIN line l ON c.parentid = l.id
    LEFT JOIN LATERAL (
        SELECT
            time,
            piece_counter,
            piece_quality
        FROM
            production_event
        WHERE
            cell_id = c.id
        ORDER BY
            time DESC
        LIMIT 1) pe ON TRUE;

-- Equipment hierarchy (no device/protocol joins — ARIA has no PLC config)
CREATE OR REPLACE VIEW equipment_hierarchy AS
SELECT
    c.id AS cell_id,
    c.name AS cell_name,
    l.id AS line_id,
    l.name AS line_name,
    a.id AS area_id,
    a.name AS area_name,
    s.id AS site_id,
    s.name AS site_name,
    e.id AS enterprise_id,
    e.name AS enterprise_name,
    c.disable AS cell_disabled,
    l.disable AS line_disabled,
    a.disable AS area_disabled,
    s.disable AS site_disabled,
    e.disable AS enterprise_disabled
FROM
    cell c
    JOIN line l ON c.parentid = l.id
    JOIN area a ON l.parentid = a.id
    JOIN site s ON a.parentid = s.id
    JOIN enterprise e ON s.parentid = e.id
ORDER BY
    e.name,
    s.name,
    a.name,
    l.name,
    c.name;

-- Current process signal values per cell
CREATE OR REPLACE VIEW current_process_signals AS
SELECT
    psd.id AS signal_def_id,
    psd.cell_id,
    c.name AS cell_name,
    l.name AS line_name,
    psd.display_name,
    u.unit_name AS unit,
    st.type_name AS signal_type,
    pse.time AS last_update,
    pse.raw_value
FROM
    process_signal_definition psd
    JOIN cell c ON psd.cell_id = c.id
    JOIN line l ON c.parentid = l.id
    JOIN signal_tag dt ON psd.signal_tag_id = dt.id
    LEFT JOIN unit u ON psd.unit_id = u.id
    LEFT JOIN signal_type st ON psd.signal_type_id = st.id
    LEFT JOIN LATERAL (
        SELECT
            time,
            raw_value
        FROM
            process_signal_data
        WHERE
            signal_def_id = psd.id
        ORDER BY
            time DESC
        LIMIT 1) pse ON TRUE
WHERE
    dt.is_active = TRUE;

