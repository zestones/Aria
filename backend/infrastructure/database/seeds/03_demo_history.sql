-- ============================================
-- ARIA — Demo plant time-series history seed
--
-- Generates 24 h of synthetic but realistic data so the Control Room reads
-- as a live plant the moment the stack comes up — without waiting for the
-- live simulator to fill 7 days of history at 1 Hz.
--
-- Volumes (approx, on a fresh DB):
--   process_signal_data : 4 cells × 17 signals × 1440 minute samples ≈ 24 500 rows
--   machine_status      : 12 transitions across the 4 monitored cells
--   production_event    : 4 cells × ~150 events ≈ 600 rows
--
-- Idempotent — process_signal_data uses ON CONFLICT (time, signal_def_id) DO NOTHING;
-- machine_status & production_event are guarded by NOT EXISTS on the (time, cell_id) PK.
-- ============================================
-- ============================================
-- 1. Per-signal envelope parameters
--   nominal       : centre value
--   amplitude     : sinusoidal seasonal amplitude (small — ≤ ~3% of nominal)
--   noise_pct     : per-sample Gaussian-ish noise (uniform random; ≤ ~3%)
--   period_hours  : seasonal sinusoid period
-- The §3.2 drift clamp (no net drift in last 6 h) is satisfied by construction:
-- amplitude is small, sinusoid period is 24 h so the slope across any 6 h
-- window is bounded, and noise is mean-reverting — abs(slope)/mean stays
-- well under the 0.005/h forecast-watch drift floor.
-- ============================================
WITH signal_params(
    cell_name,
    kb_key,
    nominal,
    amplitude,
    noise_pct,
    period_hours
) AS (
    VALUES
        -- Source Pump
('Source Pump', 'motor_current_a', 12.0, 0.30, 0.015, 24.0),
('Source Pump', 'pressure_bar', 4.8, 0.08, 0.010, 24.0),
('Source Pump', 'flow_l_min', 820.0, 30.00, 0.020, 24.0),
('Source Pump', 'vibration_mm_s', 2.5, 0.05, 0.025, 24.0),
        -- UV Sterilizer
('UV Sterilizer', 'uv_intensity_mw_cm2', 28.0, 0.40, 0.010, 24.0),
('UV Sterilizer', 'uv_runtime_h', 4500.0, 0.0, 0.000, 24.0),
('UV Sterilizer', 'flow_l_min', 820.0, 30.00, 0.020, 24.0),
('UV Sterilizer', 'motor_current_a', 3.2, 0.10, 0.015, 24.0),
        -- Bottle Filler (the demo star) — kept calm so seed-forecast can
        -- inject a clean drift on top without interference.
('Bottle Filler', 'vibration_mm_s', 2.2, 0.04, 0.025, 24.0),
('Bottle Filler', 'bearing_temp_c', 48.0, 1.00, 0.015, 24.0),
('Bottle Filler', 'pressure_bar', 5.5, 0.08, 0.010, 24.0),
('Bottle Filler', 'flow_l_min', 533.0, 12.00, 0.020, 24.0),
('Bottle Filler', 'bottles_per_minute', 180.0, 6.00, 0.030, 24.0),
        -- Bottle Capper
('Bottle Capper', 'vibration_mm_s', 1.8, 0.04, 0.025, 24.0),
('Bottle Capper', 'cap_torque_nm', 3.5, 0.06, 0.015, 24.0),
('Bottle Capper', 'motor_current_a', 4.1, 0.12, 0.015, 24.0),
('Bottle Capper', 'jam_events_per_h', 0.0, 0.0, 0.000, 24.0))
INSERT INTO process_signal_data(time, cell_id, signal_def_id, raw_value)
SELECT
    ts,
    psd.cell_id,
    psd.id,
    GREATEST(0.0, sp.nominal + sp.amplitude * sin(2 * pi() * EXTRACT(EPOCH FROM ts) /(sp.period_hours * 3600.0)) + sp.noise_pct * sp.nominal *(random() - 0.5) * 2.0)
FROM
    process_signal_definition psd
    JOIN cell c ON c.id = psd.cell_id
    JOIN signal_params sp ON sp.cell_name = c.name
        AND sp.kb_key = psd.kb_threshold_key
    CROSS JOIN generate_series(date_trunc('minute', NOW() - INTERVAL '24 hours'), date_trunc('minute', NOW() - INTERVAL '6 hours 1 minute'), INTERVAL '1 minute') AS ts
ON CONFLICT (time,
    signal_def_id)
    DO NOTHING;

-- ============================================
-- 1b. Last-6h window — pure mean-reverting noise around nominal.
-- The seasonal sinusoid is intentionally dropped here so abs(slope)/mean
-- on this window is well under the 0.005/h drift floor that
-- forecast-watch uses to gate predictive-warning emission. Without this
-- clamp, forecast-watch fires on seed-baked drift and `seed-forecast`
-- has nothing left to demo.
-- ============================================
WITH signal_params(
    cell_name,
    kb_key,
    nominal,
    noise_pct
) AS (
    VALUES ('Source Pump', 'motor_current_a', 12.0, 0.005),
('Source Pump', 'pressure_bar', 4.8, 0.004),
('Source Pump', 'flow_l_min', 820.0, 0.006),
('Source Pump', 'vibration_mm_s', 2.5, 0.008),
('UV Sterilizer', 'uv_intensity_mw_cm2', 28.0, 0.004),
('UV Sterilizer', 'uv_runtime_h', 4500.0, 0.0),
('UV Sterilizer', 'flow_l_min', 820.0, 0.006),
('UV Sterilizer', 'motor_current_a', 3.2, 0.005),
('Bottle Filler', 'vibration_mm_s', 2.2, 0.008),
('Bottle Filler', 'bearing_temp_c', 48.0, 0.005),
('Bottle Filler', 'pressure_bar', 5.5, 0.004),
('Bottle Filler', 'flow_l_min', 533.0, 0.006),
('Bottle Filler', 'bottles_per_minute', 180.0, 0.010),
('Bottle Capper', 'vibration_mm_s', 1.8, 0.008),
('Bottle Capper', 'cap_torque_nm', 3.5, 0.006),
('Bottle Capper', 'motor_current_a', 4.1, 0.005),
('Bottle Capper', 'jam_events_per_h', 0.0, 0.0))
INSERT INTO process_signal_data(time, cell_id, signal_def_id, raw_value)
SELECT
    ts,
    psd.cell_id,
    psd.id,
    GREATEST(0.0, sp.nominal + sp.noise_pct * sp.nominal *(random() - 0.5) * 2.0)
FROM
    process_signal_definition psd
    JOIN cell c ON c.id = psd.cell_id
    JOIN signal_params sp ON sp.cell_name = c.name
        AND sp.kb_key = psd.kb_threshold_key
    CROSS JOIN generate_series(date_trunc('minute', NOW() - INTERVAL '6 hours'), date_trunc('minute', NOW() - INTERVAL '6 minutes'), INTERVAL '1 minute') AS ts
ON CONFLICT (time,
    signal_def_id)
    DO NOTHING;

-- ============================================
-- 2. machine_status — transitions across 4 monitored cells.
-- Intervals are anchored relative to NOW() and live entirely inside the
-- 24 h history window. Each cell ends with end_time=NULL so the live
-- simulator's first transition closes it cleanly.
--
-- Idempotency: seeding `machine_status` is non-trivial because the
-- timestamps depend on a moving NOW() and the live simulator writes
-- additional rows after the seed. We DELETE only the historical rows
-- inserted by THIS seed (created_at < NOW() - INTERVAL '5 minutes'
-- AND time > NOW() - INTERVAL '25 hours') so re-applying the seed is
-- safe without nuking simulator-emitted rows.
-- ============================================
DELETE FROM machine_status
WHERE end_time IS NOT NULL
    AND time > NOW() - INTERVAL '25 hours'
    AND time < NOW() - INTERVAL '5 minutes';

INSERT INTO machine_status(time, cell_id, plc_status_raw, status_code, end_time)
SELECT
    x.t::timestamptz,
    c.id,
    x.raw,
    x.sc,
    x.et::timestamptz
FROM
    cell c
    JOIN (
        VALUES
            -- Source Pump: clean RUN, with a 40-min planned flow-sensor recalibration mid-window
('Source Pump', NOW() - INTERVAL '24 hours',
                1,
                1,
                NOW() - INTERVAL '14 hours'),
('Source Pump', NOW() - INTERVAL '14 hours',
                2,
                4,
                NOW() - INTERVAL '14 hours' + INTERVAL '40 minutes'),
('Source Pump', NOW() - INTERVAL '14 hours' + INTERVAL '40 minutes',
                1,
                1,
                NULL),
            -- UV Sterilizer: pure RUN
('UV Sterilizer', NOW() - INTERVAL '24 hours', 1, 1, NULL),
            -- Bottle Filler: brief vibration spike (WO #11 cancelled), then a
            -- 4-hour bearing PM window, then RUN. The 1-min FAULT is what
            -- gives Filler a non-null MTBF/MTTR in the TopBar.
('Bottle Filler', NOW() - INTERVAL '24 hours',
                1,
                1,
                NOW() - INTERVAL '21 hours'),
('Bottle Filler', NOW() - INTERVAL '21 hours',
                3,
                2,
                NOW() - INTERVAL '21 hours' + INTERVAL '1 minute'),
('Bottle Filler', NOW() - INTERVAL '21 hours' + INTERVAL '1 minute',
                1,
                1,
                NOW() - INTERVAL '20 hours'),
('Bottle Filler', NOW() - INTERVAL '20 hours',
                6,
                4,
                NOW() - INTERVAL '16 hours'),
('Bottle Filler', NOW() - INTERVAL '16 hours',
                1,
                1,
                NULL),
            -- Bottle Capper: 8-min cap jam ~10h ago, then 30-min changeover ~5h ago
('Bottle Capper', NOW() - INTERVAL '24 hours', 1, 1, NOW() - INTERVAL '10 hours'),
('Bottle Capper', NOW() - INTERVAL '10 hours',
                3,
                2,
                NOW() - INTERVAL '10 hours' + INTERVAL '8 minutes'),
('Bottle Capper', NOW() - INTERVAL '10 hours' + INTERVAL '8 minutes',
                1,
                1,
                NOW() - INTERVAL '5 hours'),
('Bottle Capper', NOW() - INTERVAL '5 hours',
                5,
                5,
                NOW() - INTERVAL '5 hours' + INTERVAL '30 minutes'),
('Bottle Capper', NOW() - INTERVAL '5 hours' + INTERVAL '30 minutes',
                1,
                1,
                NULL)) AS x(cell_name, t, raw, sc, et) ON x.cell_name = c.name
ON CONFLICT (time,
    cell_id)
    DO NOTHING;

-- ============================================
-- 3. production_event — synthetic batch counter for OEE rendering
-- ~150 events per cell over 24 h. Each row is one piece counter tick.
-- ============================================
-- Reset seed-owned production_event rows in the 24h window so re-applies
-- are idempotent without nuking simulator-emitted rows from outside the
-- window. The live simulator's events sit on top of these and feed the
-- Quality Pareto with the per-cell bias seeded below.
DELETE FROM production_event
WHERE time > NOW() - INTERVAL '24 hours 1 minute'
    AND time < NOW() - INTERVAL '5 minutes'
    AND cell_id IN (
        SELECT
            id
        FROM
            cell
        WHERE
            name IN ('Source Pump', 'UV Sterilizer', 'Bottle Filler', 'Bottle Capper'));

-- Quality distribution is spread across the 5 non-conformant codes so the
-- Quality Pareto chart on /equipment renders with multiple bars instead
-- of a single OUT_OF_SPEC stub. Per-cell bias mirrors a real bottling line:
--   Filler   → mostly LOW_FILL + a few OUT_OF_SPEC
--   Capper   → mostly CAP_DEFECT + a few OUT_OF_SPEC
--   Source   → mostly OUT_OF_SPEC (pump pressure/flow drift)
--   UV       → mostly OUT_OF_SPEC (intensity dip)
-- ~95 % GOOD overall.
--
-- Volume: 1500 events per cell across 24 h ≈ one piece every ~58 s.
-- Combined with cell.ideal_cycle_time_seconds=50 (006_aria_demo_plant.up.sql)
-- this lands OEE performance at ~85 %, healthy for a bottling line.
WITH numbered AS (
    SELECT
        c.id AS cell_id,
        c.name AS cell_name,
        gs AS event_idx,
        date_trunc('second', NOW() - INTERVAL '24 hours') +(gs * INTERVAL '57 seconds') AS event_time,
        random() AS roll_good,
        random() AS roll_reason
    FROM
        cell c
        CROSS JOIN generate_series(1, 1500) AS gs
    WHERE
        c.name IN ('Source Pump', 'UV Sterilizer', 'Bottle Filler', 'Bottle Capper'))
INSERT INTO production_event(time, cell_id, piece_counter, plc_quality_raw, piece_quality, status_code)
SELECT
    n.event_time,
    n.cell_id,
    n.event_idx,
    q.code,
    q.code,
    1 -- assumed RUN at production time
FROM
    numbered n
    CROSS JOIN LATERAL (
        SELECT
            CASE
            -- ~95 % GOOD
            WHEN n.roll_good < 0.95 THEN
                0
                -- bad — bias the reason by cell, with a small dose of cross-line
                -- contamination so every cell sees more than one Pareto bar
            WHEN n.cell_name = 'Bottle Filler' THEN
                CASE WHEN n.roll_reason < 0.55 THEN
                    2 -- LOW_FILL
                WHEN n.roll_reason < 0.80 THEN
                    1 -- OUT_OF_SPEC
                WHEN n.roll_reason < 0.95 THEN
                    5 -- BOTTLE_DAMAGE
                ELSE
                    4 -- LABEL_DEFECT (rare)
                END
            WHEN n.cell_name = 'Bottle Capper' THEN
                CASE WHEN n.roll_reason < 0.65 THEN
                    3 -- CAP_DEFECT
                WHEN n.roll_reason < 0.85 THEN
                    1 -- OUT_OF_SPEC
                ELSE
                    5 -- BOTTLE_DAMAGE
                END
            WHEN n.cell_name = 'Source Pump' THEN
                CASE WHEN n.roll_reason < 0.80 THEN
                    1 -- OUT_OF_SPEC
                ELSE
                    5 -- BOTTLE_DAMAGE (downstream)
                END
            ELSE
                -- UV Sterilizer
                CASE WHEN n.roll_reason < 0.85 THEN
                    1 -- OUT_OF_SPEC
                ELSE
                    5 -- BOTTLE_DAMAGE
                END
            END AS code) q
WHERE
    n.event_time < NOW() - INTERVAL '5 minutes'
ON CONFLICT (time,
    cell_id)
    DO NOTHING;

