-- ============================================
-- ARIA — P-02 Demo Seed (FlowTech CP-3200 centrifugal pump)
--
-- Site:        Acme Industries — North Plant
-- Area:        Water Treatment
-- Line:        Main Booster Line
-- Cell:        P-02 (centrifugal pump, 18 months in service)
-- Scenario:    Bearing wear → vibration drift → impending failure
-- ============================================
-- ============================================
-- ISA-95 hierarchy
-- ============================================
INSERT INTO enterprise(name)
    VALUES ('Acme Industries')
ON CONFLICT
    DO NOTHING;

INSERT INTO site(name, parentid)
    VALUES ('Acme Industries — North Plant',(
            SELECT
                id
            FROM
                enterprise
            WHERE
                name = 'Acme Industries'))
ON CONFLICT
    DO NOTHING;

INSERT INTO area(name, parentid)
    VALUES ('Water Treatment',(
            SELECT
                id
            FROM
                site
            WHERE
                name = 'Acme Industries — North Plant'))
ON CONFLICT
    DO NOTHING;

INSERT INTO line(name, parentid)
    VALUES ('Main Booster Line',(
            SELECT
                id
            FROM
                area
            WHERE
                name = 'Water Treatment'))
ON CONFLICT
    DO NOTHING;

INSERT INTO cell(name, parentid, ideal_cycle_time_seconds)
    VALUES ('P-02',(
            SELECT
                id
            FROM
                line
            WHERE
                name = 'Main Booster Line'), 1.0)
ON CONFLICT
    DO NOTHING;

-- ============================================
-- PLC status labels (rich codes for the pump)
-- ============================================
INSERT INTO plc_status_label(label_name, description)
VALUES
    ('STOP', 'Pump stopped — operator command'),
('RUN', 'Pump running nominal'),
('FAULT:VARIATEUR', 'Variable frequency drive fault'),
('FAULT:VIBRATION', 'Vibration threshold exceeded'),
('FAULT:TEMPERATURE', 'Bearing overheat'),
('PAUSE:MODE_LOCAL', 'Pump in local manual mode'),
('PAUSE:MAINTENANCE', 'Maintenance lockout')
ON CONFLICT (label_name)
    DO NOTHING;

-- ============================================
-- PLC status mapping for P-02
--   raw 0 → STOP        / planned_stop  (status_code 0)
--   raw 1 → RUN         / running       (status_code 1)
--   raw 2 → FAULT:VFD   / unplanned_stop(status_code 2)
--   raw 3 → FAULT:VIB   / unplanned_stop(status_code 2)
--   raw 4 → FAULT:TEMP  / unplanned_stop(status_code 2)
--   raw 5 → PAUSE:LOCAL / planned_stop  (status_code 3)
--   raw 6 → PAUSE:MAINT / planned_stop  (status_code 3)
-- ============================================
INSERT INTO cell_status_mapping(cell_id, plc_raw_value, status_code, plc_status_label_id, description)
SELECT
    c.id,
    x.raw,
    x.sc,
    psl.id,
    x.desc
FROM
    cell c
    JOIN (
        VALUES (0, 0, 'STOP', 'Stopped'),
(1, 1, 'RUN', 'Running'),
(2, 2, 'FAULT:VARIATEUR', 'VFD fault'),
(3, 2, 'FAULT:VIBRATION', 'Vibration fault'),
(4, 2, 'FAULT:TEMPERATURE', 'Bearing overheat'),
(5, 3, 'PAUSE:MODE_LOCAL', 'Local mode'),
(6, 3, 'PAUSE:MAINTENANCE', 'Maintenance')) AS x(raw, sc, label, "desc") ON TRUE
    JOIN plc_status_label psl ON psl.label_name = x.label
WHERE
    c.name = 'P-02'
ON CONFLICT
    DO NOTHING;

-- ============================================
-- PLC quality mapping for P-02
-- ============================================
INSERT INTO plc_quality_label(label_name, description)
VALUES
    ('GOOD', 'Conforming output'),
('OFF_SPEC', 'Pressure / flow out of spec')
ON CONFLICT (label_name)
    DO NOTHING;

INSERT INTO cell_quality_mapping(cell_id, plc_raw_value, quality_code, plc_quality_label_id, description)
SELECT
    c.id,
    x.raw,
    x.qc,
    pql.id,
    x.desc
FROM
    cell c
    JOIN (
        VALUES (0, 0, 'GOOD', 'Conforming'),
(1, 1, 'OFF_SPEC', 'Off-spec output')) AS x(raw, qc, label, "desc") ON TRUE
    JOIN plc_quality_label pql ON pql.label_name = x.label
WHERE
    c.name = 'P-02'
ON CONFLICT
    DO NOTHING;

-- ============================================
-- Signal tags + definitions for P-02
--   - vibration_refoulement   (mm/s)   — bearing health (drift target)
--   - temperature_palier      (°C)     — bearing temperature (correlated)
--   - debit_refoulement       (L/min)  — flow (production accumulator source)
--   - pression_refoulement    (bar)    — discharge pressure
-- ============================================
INSERT INTO signal_tag(cell_id, tag_address, tag_name, description, is_active, is_core)
SELECT
    c.id,
    x.addr,
    x.name,
    x.descr,
    TRUE,
    TRUE
FROM
    cell c
    JOIN (
        VALUES ('SIM:P02:VIB', 'vibration_refoulement', 'Vibration RMS at discharge bearing'),
('SIM:P02:TEMP', 'temperature_palier', 'Bearing temperature'),
('SIM:P02:FLOW', 'debit_refoulement', 'Discharge flow rate'),
('SIM:P02:PRES', 'pression_refoulement', 'Discharge pressure')) AS x(addr, name, descr) ON TRUE
WHERE
    c.name = 'P-02'
ON CONFLICT
    DO NOTHING;

INSERT INTO process_signal_definition(cell_id, signal_tag_id, display_name, unit_id, signal_type_id)
SELECT
    c.id,
    st.id,
    x.display,
    u.id,
    sty.id
FROM
    cell c
    JOIN (
        VALUES ('vibration_refoulement', 'Discharge Bearing Vibration', 'mm/s', 'vibration'),
('temperature_palier', 'Bearing Temperature', '°C', 'temperature'),
('debit_refoulement', 'Discharge Flow Rate', 'L/min', 'flow'),
('pression_refoulement', 'Discharge Pressure', 'bar', 'pressure')) AS x(tagname, display, unitname, typename) ON TRUE
    JOIN signal_tag st ON st.cell_id = c.id
            AND st.tag_name = x.tagname
        JOIN unit u ON u.unit_name = x.unitname
        JOIN signal_type sty ON sty.type_name = x.typename
    WHERE
        c.name = 'P-02'
    ON CONFLICT
        DO NOTHING;

-- ============================================
-- Shifts
-- ============================================
INSERT INTO shift(name, start_time, end_time)
VALUES
    ('Morning', '06:00', '14:00'),
('Afternoon', '14:00', '22:00'),
('Night', '22:00', '06:00')
ON CONFLICT (name)
    DO NOTHING;

-- ============================================
-- Equipment KB (pre-seeded so agents have a starting fiche)
-- ============================================
INSERT INTO equipment_kb(cell_id, equipment_type, manufacturer, model, installation_date, nominal_specs, common_failure_modes, maintenance_recommendations, notes, last_updated_by)
SELECT
    c.id,
    'Centrifugal Pump',
    'FlowTech',
    'CP-3200',
(NOW() - INTERVAL '18 months')::date,
    jsonb_build_object('flow_nominal_l_min', 533, 'pressure_nominal_bar', 12.0, 'vibration_nominal_mm_s', 2.2, 'vibration_alarm_mm_s', 4.5, 'vibration_trip_mm_s', 7.1, 'bearing_temp_nominal_c', 48, 'bearing_temp_alarm_c', 75, 'motor_power_kw', 18.5, 'rpm_nominal', 2950),
    jsonb_build_array(jsonb_build_object('mode', 'bearing_wear', 'symptoms', 'progressive vibration drift, bearing temp rise', 'mtbf_months', 14), jsonb_build_object('mode', 'mechanical_seal_leak', 'symptoms', 'flow drop, pressure fluctuation', 'mtbf_months', 24), jsonb_build_object('mode', 'impeller_imbalance', 'symptoms', 'sudden vibration spike at 1x rpm', 'mtbf_months', 36)),
    jsonb_build_array(jsonb_build_object('action', 'bearing replacement', 'interval_months', 12, 'duration_min', 240, 'parts', jsonb_build_array('FBR-6310-2RS', 'FBR-6312-2RS')), jsonb_build_object('action', 'mechanical seal replacement', 'interval_months', 18, 'duration_min', 180, 'parts', jsonb_build_array('FlowTech MKII seal kit')), jsonb_build_object('action', 'vibration spectrum analysis', 'interval_months', 3, 'duration_min', 30, 'parts', jsonb_build_array())),
    'P-02 — main raw water booster, 24/7 service. Last bearing change: 14 months ago.',
    'seed'
FROM
    cell c
WHERE
    c.name = 'P-02'
ON CONFLICT (cell_id)
    DO NOTHING;

-- ============================================
-- Failure history (3 past bearing replacements over 18 months)
-- ============================================
INSERT INTO failure_history(cell_id, failure_time, resolved_time, failure_mode, root_cause, resolution, parts_replaced, downtime_minutes, cost_estimate)
SELECT
    c.id,
    x.ftime::timestamptz,
    x.rtime::timestamptz,
    x.mode,
    x.cause,
    x.resolution,
    x.parts::jsonb,
    x.dt,
    x.cost
FROM
    cell c
    JOIN (
        VALUES (NOW() - INTERVAL '15 months',
                NOW() - INTERVAL '15 months' + INTERVAL '4 hours',
                'bearing_wear',
                'Normal wear after 12 months continuous operation',
                'Replaced both bearings (NDE + DE), realigned coupling',
                '["FBR-6310-2RS", "FBR-6312-2RS"]'::text,
                240,
                1850.00),
(NOW() - INTERVAL '8 months',
                NOW() - INTERVAL '8 months' + INTERVAL '5 hours',
                'mechanical_seal_leak',
                'Seal face wear, abrasive particles in feed water',
                'Replaced mechanical seal kit, flushed seal chamber',
                '["FlowTech MKII seal kit"]'::text,
                300,
                1200.00),
(NOW() - INTERVAL '3 months',
                NOW() - INTERVAL '3 months' + INTERVAL '2 hours',
                'impeller_imbalance',
                'Cavitation damage on impeller vanes',
                'Inspected and re-balanced impeller, no replacement needed',
                '[]'::text,
                120,
                400.00)) AS x(ftime, rtime, mode, cause, resolution, parts, dt, COST) ON TRUE
WHERE
    c.name = 'P-02';

-- ============================================
-- Logbook entries (operator history for context)
-- ============================================
INSERT INTO logbook_entry(cell_id, author_id, entry_time, category, severity, content)
SELECT
    c.id,
    u.id,
    x.etime::timestamptz,
    x.cat,
    x.sev,
    x.content
FROM
    cell c
    JOIN users u ON u.username = 'operator'
    JOIN (
        VALUES (NOW() - INTERVAL '7 days',
                'observation',
                'info',
                'Vibration slightly higher than usual at morning startup (2.4 mm/s vs 2.2 nominal). Monitoring closely.'),
(NOW() - INTERVAL '4 days',
                'observation',
                'warning',
                'Abnormal noise from discharge bearing around 14:00, disappeared after 30 min. Bearing temp stable.'),
(NOW() - INTERVAL '2 days',
                'maintenance',
                'info',
                'Monthly preventive greasing performed on bearing. No visual anomalies.'),
(NOW() - INTERVAL '12 hours',
                'observation',
                'warning',
                'Vibration steadily rising for 24h (2.8 mm/s). Requesting spectral analysis.')) AS x(etime, cat, sev, content) ON TRUE
WHERE
    c.name = 'P-02';

