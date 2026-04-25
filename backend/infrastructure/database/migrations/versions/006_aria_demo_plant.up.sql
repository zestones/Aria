-- ============================================
-- ARIA — Demo plant seed (5-cell bottled-water line)
--
-- Plant:  one enterprise / site / area / line
-- Cells:  Source Pump, UV Sterilizer, Bottle Filler, Bottle Capper, Bottle Labeler
--         (4 monitored + 1 onboarding-target)
-- Story:  see docs/planning/M9-polish-e2e/demo-plant-design.md
-- Content reference: docs/planning/M9-polish-e2e/demo-seed-content.md §1+§2
--
-- Schema-only here; per-cell KB blobs live in seeds/01_demo_kb.sql,
-- human context (WOs / failures / logbook / shifts) in seeds/02_demo_human_context.sql,
-- 7-day signal/status/production history in seeds/03_demo_history.sql.
-- ============================================

-- ============================================
-- ISA-95 hierarchy
-- ============================================
INSERT INTO enterprise(name)
    VALUES ('Acme Bottling')
ON CONFLICT
    DO NOTHING;

INSERT INTO site(name, parentid)
    VALUES ('Acme Bottling — Plant 1',
        (SELECT id FROM enterprise WHERE name = 'Acme Bottling'))
ON CONFLICT
    DO NOTHING;

INSERT INTO area(name, parentid)
    VALUES ('Bottling Hall',
        (SELECT id FROM site WHERE name = 'Acme Bottling — Plant 1'))
ON CONFLICT
    DO NOTHING;

INSERT INTO line(name, parentid)
    VALUES ('Line 1',
        (SELECT id FROM area WHERE name = 'Bottling Hall'))
ON CONFLICT
    DO NOTHING;

-- ============================================
-- Cells — five machines on one production line
-- ============================================
-- ideal_cycle_time_seconds — used by OEE performance math:
--   performance = (total_pieces × ideal_cycle_time_seconds) / productive_seconds
-- The simulators emit at sub-Hz rates, so the textbook 180 bpm (≈ 0.33 s
-- per piece) would crush performance to single-digit percent. We pick
-- per-cell values that produce a healthy 80-90 % performance against the
-- 24 h history seed (≈ 1500 events per cell) plus the live simulator's
-- ongoing emissions.
INSERT INTO cell(name, parentid, ideal_cycle_time_seconds)
SELECT
    x.name, l.id, x.cycle
FROM
    line l
    JOIN (
        VALUES
            ('Source Pump',    50.0),
            ('UV Sterilizer',  50.0),
            ('Bottle Filler',  50.0),
            ('Bottle Capper',  50.0),
            ('Bottle Labeler', 50.0)
    ) AS x(name, cycle) ON TRUE
WHERE l.name = 'Line 1'
ON CONFLICT (name)
    DO NOTHING;

-- ============================================
-- PLC status labels — shared across all cells
-- ============================================
INSERT INTO plc_status_label(label_name, description)
VALUES
    ('STOP',              'Machine stopped — operator command'),
    ('RUN',               'Machine running nominal'),
    ('FAULT:VARIATEUR',   'Variable frequency drive fault'),
    ('FAULT:VIBRATION',   'Vibration threshold exceeded'),
    ('FAULT:TEMPERATURE', 'Bearing / lamp / drive overheat'),
    ('PAUSE:MODE_LOCAL',  'Machine in local manual mode'),
    ('PAUSE:MAINTENANCE', 'Maintenance lockout')
ON CONFLICT (label_name)
    DO NOTHING;

INSERT INTO plc_quality_label(label_name, description)
VALUES
    ('GOOD',          'Conforming output'),
    ('OUT_OF_SPEC',   'Off-spec output (pressure / flow / torque outside duty)'),
    ('LOW_FILL',      'Bottle filled below target volume'),
    ('CAP_DEFECT',    'Cap missing, cross-threaded, or under-torqued'),
    ('LABEL_DEFECT',  'Label misaligned, smudged, or absent'),
    ('BOTTLE_DAMAGE', 'Cracked or deformed bottle on the line')
ON CONFLICT (label_name)
    DO NOTHING;

-- ============================================
-- Status + quality mappings — same shape for all 5 cells
--   raw 0→STOP / 1→RUN / 2→FAULT:VFD / 3→FAULT:VIB / 4→FAULT:TEMP /
--   raw 5→PAUSE:LOCAL / 6→PAUSE:MAINT
--   quality raw 0→GOOD / raw 1→OFF_SPEC
-- ============================================
INSERT INTO cell_status_mapping(cell_id, plc_raw_value, status_code, plc_status_label_id, description)
SELECT
    c.id, x.raw, x.sc, psl.id, x."desc"
FROM
    cell c
    JOIN line l ON l.id = c.parentid
    JOIN (
        VALUES
            (0, 0, 'STOP',              'Stopped'),
            (1, 1, 'RUN',               'Running'),
            (2, 2, 'FAULT:VARIATEUR',   'VFD fault'),
            (3, 2, 'FAULT:VIBRATION',   'Vibration fault'),
            (4, 2, 'FAULT:TEMPERATURE', 'Overheat'),
            (5, 3, 'PAUSE:MODE_LOCAL',  'Local mode'),
            (6, 3, 'PAUSE:MAINTENANCE', 'Maintenance')
    ) AS x(raw, sc, label, "desc") ON TRUE
    JOIN plc_status_label psl ON psl.label_name = x.label
WHERE l.name = 'Line 1'
ON CONFLICT
    DO NOTHING;

-- All 6 quality codes wired against every cell. The simulator scenarios
-- pick which bad codes to emit (per cell) — see ``quality_bad_codes`` in
-- each scenario's production config. The mapping below is a superset so
-- the same plc_raw_value can be used across cells without surprises.
INSERT INTO cell_quality_mapping(cell_id, plc_raw_value, quality_code, plc_quality_label_id, description)
SELECT
    c.id, x.raw, x.qc, pql.id, x."desc"
FROM
    cell c
    JOIN line l ON l.id = c.parentid
    JOIN (
        VALUES
            (0, 0, 'GOOD',          'Conforming'),
            (1, 1, 'OUT_OF_SPEC',   'Off-spec output'),
            (2, 2, 'LOW_FILL',      'Bottle filled below target volume'),
            (3, 3, 'CAP_DEFECT',    'Cap missing or under-torqued'),
            (4, 4, 'LABEL_DEFECT',  'Label misaligned or absent'),
            (5, 5, 'BOTTLE_DAMAGE', 'Cracked or deformed bottle')
    ) AS x(raw, qc, label, "desc") ON TRUE
    JOIN plc_quality_label pql ON pql.label_name = x.label
WHERE l.name = 'Line 1'
ON CONFLICT
    DO NOTHING;

-- ============================================
-- Signal tags + process_signal_definition
-- per demo-seed-content.md §2 — one row per (cell, signal).
-- The Labeler is intentionally signal-less (onboarding-wizard target).
-- ============================================

-- Source Pump — 4 signals
INSERT INTO signal_tag(cell_id, tag_address, tag_name, description, is_active, is_core)
SELECT c.id, x.addr, x.name, x.descr, TRUE, TRUE
FROM cell c
JOIN (VALUES
    ('SIM:SRC:CURR', 'pump_motor_current', 'Source Pump motor current'),
    ('SIM:SRC:PRES', 'pump_discharge_pressure', 'Source Pump discharge pressure'),
    ('SIM:SRC:FLOW', 'pump_flow', 'Source Pump flow rate'),
    ('SIM:SRC:VIB',  'pump_vibration', 'Source Pump motor vibration RMS')
) AS x(addr, name, descr) ON TRUE
WHERE c.name = 'Source Pump'
ON CONFLICT DO NOTHING;

-- UV Sterilizer — 4 signals
INSERT INTO signal_tag(cell_id, tag_address, tag_name, description, is_active, is_core)
SELECT c.id, x.addr, x.name, x.descr, TRUE, TRUE
FROM cell c
JOIN (VALUES
    ('SIM:UV:INTEN',   'uv_intensity', 'UV lamp irradiance'),
    ('SIM:UV:RUNTIME', 'uv_runtime', 'Cumulative UV lamp hours'),
    ('SIM:UV:FLOW',    'uv_flow', 'Throughput flow rate'),
    ('SIM:UV:CURR',    'uv_motor_current', 'UV reactor drive current')
) AS x(addr, name, descr) ON TRUE
WHERE c.name = 'UV Sterilizer'
ON CONFLICT DO NOTHING;

-- Bottle Filler — 5 signals (the demo star)
INSERT INTO signal_tag(cell_id, tag_address, tag_name, description, is_active, is_core)
SELECT c.id, x.addr, x.name, x.descr, TRUE, TRUE
FROM cell c
JOIN (VALUES
    ('SIM:FIL:VIB',  'filler_vibration', 'Filler motor vibration RMS at discharge bearing'),
    ('SIM:FIL:TEMP', 'filler_bearing_temp', 'Filler discharge bearing temperature'),
    ('SIM:FIL:PRES', 'filler_pressure', 'Filler manifold pressure'),
    ('SIM:FIL:FLOW', 'filler_flow', 'Filler water flow rate'),
    ('SIM:FIL:BPM',  'filler_bpm', 'Bottles produced per minute')
) AS x(addr, name, descr) ON TRUE
WHERE c.name = 'Bottle Filler'
ON CONFLICT DO NOTHING;

-- Bottle Capper — 4 signals (memory-scene target)
INSERT INTO signal_tag(cell_id, tag_address, tag_name, description, is_active, is_core)
SELECT c.id, x.addr, x.name, x.descr, TRUE, TRUE
FROM cell c
JOIN (VALUES
    ('SIM:CAP:VIB',    'capper_vibration', 'Capper drive motor vibration RMS'),
    ('SIM:CAP:TORQUE', 'capper_torque', 'Capping head torque'),
    ('SIM:CAP:CURR',   'capper_motor_current', 'Capper drive motor current'),
    ('SIM:CAP:JAMS',   'capper_jam_rate', 'Cap jam events per hour')
) AS x(addr, name, descr) ON TRUE
WHERE c.name = 'Bottle Capper'
ON CONFLICT DO NOTHING;

-- ============================================
-- process_signal_definition — display name + unit + signal_type
-- ============================================
INSERT INTO process_signal_definition(cell_id, signal_tag_id, display_name, unit_id, signal_type_id)
SELECT
    st.cell_id, st.id, x.display, u.id, sty.id
FROM
    signal_tag st
    JOIN cell c ON c.id = st.cell_id
    JOIN (VALUES
        -- Source Pump
        ('Source Pump',    'pump_motor_current',     'Motor current',      'A',     'current'),
        ('Source Pump',    'pump_discharge_pressure','Water pressure',     'bar',   'pressure'),
        ('Source Pump',    'pump_flow',              'Water flow',         'L/min', 'flow'),
        ('Source Pump',    'pump_vibration',         'Motor shake',        'mm/s',  'vibration'),
        -- UV Sterilizer
        ('UV Sterilizer',  'uv_intensity',           'UV lamp brightness', '%',     'score'),
        ('UV Sterilizer',  'uv_runtime',             'UV lamp hours',      'ms',    'cycle_time'),
        ('UV Sterilizer',  'uv_flow',                'Water flow',         'L/min', 'flow'),
        ('UV Sterilizer',  'uv_motor_current',       'Motor current',      'A',     'current'),
        -- Bottle Filler
        ('Bottle Filler',  'filler_vibration',       'Motor shake',        'mm/s',  'vibration'),
        ('Bottle Filler',  'filler_bearing_temp',    'Bearing temp',       '°C',    'temperature'),
        ('Bottle Filler',  'filler_pressure',        'Water pressure',     'bar',   'pressure'),
        ('Bottle Filler',  'filler_flow',            'Water flow',         'L/min', 'flow'),
        ('Bottle Filler',  'filler_bpm',             'Bottles per minute', '%',     'score'),
        -- Bottle Capper
        ('Bottle Capper',  'capper_vibration',       'Motor shake',        'mm/s',  'vibration'),
        ('Bottle Capper',  'capper_torque',          'Cap tightness',      'Nm',    'torque'),
        ('Bottle Capper',  'capper_motor_current',   'Motor current',      'A',     'current'),
        ('Bottle Capper',  'capper_jam_rate',        'Jams per hour',      '%',     'score')
    ) AS x(cell_name, tagname, display, unitname, typename)
        ON x.cell_name = c.name AND x.tagname = st.tag_name
    JOIN unit u ON u.unit_name = x.unitname
    JOIN signal_type sty ON sty.type_name = x.typename
ON CONFLICT
    DO NOTHING;

-- ============================================
-- Shifts — three rotating windows, 24/7 coverage
-- ============================================
INSERT INTO shift(name, start_time, end_time)
VALUES
    ('Morning', '06:00', '14:00'),
    ('Afternoon', '14:00', '22:00'),
    ('Night', '22:00', '06:00')
ON CONFLICT (name)
    DO NOTHING;
