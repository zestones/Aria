-- ============================================
-- ARIA — Demo plant human-context seed
--
-- Layered on top of 01_demo_kb.sql; populates the lived-in surfaces:
--   - 4 named operators (sarah / marco / priya / tom)
--   - 7-day shift rota (Sarah=Day, Marco=Evening, Priya=Night; Tom=supervisor)
--   - 12 work orders across the 4 monitored cells (mix of agent/manual, completed/cancelled/open)
--   - 5 failure_history rows with signal_patterns jsonb (incl. memory-scene anchor)
--   - 20 logbook entries (incl. Priya's #12 — the Investigator narration anchor)
--
-- Idempotency policy:
--   shift_assignment + failure_history are 100 % seed-owned for the demo,
--   so we DELETE seed-window rows before inserting (NOT EXISTS doesn't
--   work — it compares against NOW()-shifted timestamps that drift between
--   calls, producing duplicates on re-runs).
--   work_order + logbook_entry use NOT EXISTS on natural keys (title or
--   exact entry_time + author) so rows the live system has added don't
--   get nuked when a presenter re-applies the seed mid-demo.
-- ============================================

-- Reset 100 %-seed-owned tables so seed re-applies are truly idempotent.
DELETE FROM failure_history
WHERE cell_id IN (SELECT id FROM cell WHERE name IN
    ('Source Pump', 'UV Sterilizer', 'Bottle Filler', 'Bottle Capper'))
  AND failure_time > NOW() - INTERVAL '7 months';
DELETE FROM shift_assignment
WHERE assigned_date >= CURRENT_DATE - INTERVAL '8 days';

-- ============================================
-- 1. Demo operators (and supervisor)
-- ============================================
-- Password hashes are placeholder demo values; these accounts are not used for
-- production login. Reuse the existing 'operator' / 'admin' hashes from
-- migration 004 so the demo accounts stay loginable for a sanity smoke.
INSERT INTO users(username, password_hash, email, full_name, ROLE, is_active)
VALUES
    ('sarah.miller',   'pbkdf2:sha256:600000$TANQL7qKlkqEFJJW$5ee0b03851087f2ab96a7b54f44699e6f328eff584af30080accdbee7f622c59', 'sarah.miller@aria.local',  'Sarah Miller',  'operator', TRUE),
    ('marco.ferrari',  'pbkdf2:sha256:600000$TANQL7qKlkqEFJJW$5ee0b03851087f2ab96a7b54f44699e6f328eff584af30080accdbee7f622c59', 'marco.ferrari@aria.local', 'Marco Ferrari', 'operator', TRUE),
    ('priya.patel',    'pbkdf2:sha256:600000$TANQL7qKlkqEFJJW$5ee0b03851087f2ab96a7b54f44699e6f328eff584af30080accdbee7f622c59', 'priya.patel@aria.local',   'Priya Patel',   'operator', TRUE),
    ('tom.anderson',   'pbkdf2:sha256:600000$llgf8p2pqT0FlbAS$18a6f3cdcda5e1bd871b97e068c8638164e2b62a39394e592c8bc558675bcf48', 'tom.anderson@aria.local',  'Tom Anderson',  'admin',    TRUE)
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- 2. Shift rota — last 7 days + today
-- Sarah = Morning, Marco = Afternoon, Priya = Night.
-- Each operator gets a row per day per monitored cell so the Shifts page
-- header / rota panel reads correctly regardless of which cell the user
-- drills into.
-- ============================================
INSERT INTO shift_assignment(shift_id, user_id, cell_id, assigned_date)
SELECT
    s.id,
    u.id,
    c.id,
    d::date
FROM
    cell c
    CROSS JOIN generate_series(0, 6) AS d_offset
    CROSS JOIN LATERAL (SELECT (CURRENT_DATE - d_offset)::timestamp AS d) AS days
    JOIN shift s ON TRUE
    JOIN users u ON
        (s.name = 'Morning'   AND u.username = 'sarah.miller')
     OR (s.name = 'Afternoon' AND u.username = 'marco.ferrari')
     OR (s.name = 'Night'     AND u.username = 'priya.patel')
WHERE c.name IN ('Source Pump', 'UV Sterilizer', 'Bottle Filler', 'Bottle Capper')
ON CONFLICT (shift_id, user_id, cell_id, assigned_date) DO NOTHING;

-- ============================================
-- 3. Work orders (12 rows) — see demo-seed-content.md §4
-- All `created_at` are NOW() - INTERVAL '<X>' so the seed stays fresh.
-- Agent-generated rows carry a sandbox-prefixed RCA so the WO list reads
-- as already-investigated machines.
-- ============================================
WITH wo_data(cell_name, days_ago, hours_ago, status, priority, generated_by_agent,
             title, rca_summary, recommended_actions, duration_min, completed_after_min) AS (
    VALUES
        -- 1: completed bearing PM — agent-driven, sandbox numbers cited
        ('Bottle Filler', 6, 4, 'completed', 'high', TRUE,
         'Bearing replacement — Filler pump',
         'Sandbox: slope_per_hour=0.019, r_squared=0.94, eta_to_trip_hours=3.1. Bearing wear near end-of-life replaced under scheduled PM.',
         '[{"action":"Replace upper + lower bearings","parts":["Grundfos 96416067","Grundfos 96416068"],"duration_min":240},{"action":"Realign coupling","duration_min":30}]'::jsonb,
         240, 240),
        -- 2: completed sensor recal — manual
        ('Source Pump', 5, 10, 'completed', 'medium', FALSE,
         'Replace flow sensor calibration drift',
         'Operator-initiated recalibration after logbook note from Priya. Field team recalibrated in 40 minutes.',
         '[{"action":"Calibrate flow sensor","duration_min":40}]'::jsonb,
         40, 40),
        -- 3: completed cap-jam reset — agent
        ('Bottle Capper', 4, 18, 'completed', 'medium', TRUE,
         'Cap torque alarm — reseated jammed cap',
         'Sandbox: rho_vibration_cap_torque=0.71, n_samples=14400. Jammed cap cleared; torque returned to nominal within 8 minutes.',
         '[{"action":"Clear cap jam","duration_min":8},{"action":"Verify torque trace","duration_min":5}]'::jsonb,
         15, 15),
        -- 4: completed UV lamp deferred — agent
        ('UV Sterilizer', 3, 22, 'completed', 'low', TRUE,
         'Lamp hours exceeded 7500 — replace scheduled',
         'UV lamp approaching end of rated life; not an immediate failure. Replacement deferred to next planned maintenance window.',
         '[{"action":"Schedule lamp #2 replacement","duration_min":60}]'::jsonb,
         15, 15),
        -- 5: cancelled false alarm — agent
        ('Bottle Filler', 3, 5, 'cancelled', 'medium', TRUE,
         'False alarm — anti-surge valve cycled',
         'Transient pressure spike traced to a downstream valve cycle, not the Filler. Cancelled without action.',
         '[{"action":"Verify downstream valve","duration_min":10}]'::jsonb,
         10, 10),
        -- 6: completed seal replacement — manual
        ('Source Pump', 2, 14, 'completed', 'high', FALSE,
         'Seal replacement after flow drop',
         'Manual flag from operator — mechanical seal showed wet trace. Replaced seal kit and verified normal flow.',
         '[{"action":"Replace mechanical seal kit","parts":["Grundfos seal kit"],"duration_min":120}]'::jsonb,
         135, 135),
        -- 7: completed changeover — manual
        ('Bottle Capper', 2, 2, 'completed', 'low', FALSE,
         'Routine — change-over between cap sizes',
         'Line change-over from 500 ml to 1.5 L caps. 30 min. No incident.',
         '[{"action":"Swap cap-size cassette","duration_min":30}]'::jsonb,
         30, 30),
        -- 8: completed impeller nudge — agent
        ('Bottle Filler', 1, 9, 'completed', 'medium', TRUE,
         'Vibration nudge — recentred impeller',
         'Sandbox: slope_per_hour=0.008, r_squared=0.62, eta_to_trip_hours=18.4. Mild vibration uptrend; preventive impeller re-centring.',
         '[{"action":"Recentre impeller","duration_min":45}]'::jsonb,
         45, 45),
        -- 9: open lamp replacement — manual
        ('UV Sterilizer', 1, 5, 'open', 'medium', FALSE,
         'Replace UV lamp 2 of 4',
         'Scheduled replacement — lamp #2 at 7800 hours. Field team arrives 09:00 tomorrow.',
         '[{"action":"Replace UV lamp #2","parts":["Trojan UV3K-LAMP-440W"],"duration_min":60}]'::jsonb,
         60, NULL),
        -- 10: open inspection — manual
        ('Source Pump', 1, 2, 'open', 'low', FALSE,
         'Visual inspection — scheduled quarterly',
         'Walk-around + bolt torque check. Due Friday.',
         '[{"action":"Quarterly walk-around","duration_min":30}]'::jsonb,
         30, NULL),
        -- 11: cancelled spurious alarm — agent
        ('Bottle Filler', 0, 20, 'cancelled', 'high', TRUE,
         'Spurious alarm — clock skew on simulator?',
         'Threshold breach flagged during a sampling gap. Investigator found no physical evidence. Cancelled pending review.',
         '[{"action":"Inspect sampler","duration_min":15}]'::jsonb,
         15, 15),
        -- 12: in_progress torque drift — manual
        ('Bottle Capper', 0, 14, 'in_progress', 'medium', FALSE,
         'Torque drift — bench-test spindle',
         'Night-shift observed intermittent torque variance. Day-shift technician running bench test.',
         '[{"action":"Bench test capper spindle","duration_min":120}]'::jsonb,
         120, NULL)
)
INSERT INTO work_order(
    cell_id, title, description, priority, status, estimated_duration_min,
    created_by, generated_by_agent, trigger_anomaly_time, rca_summary,
    recommended_actions, created_at, completed_at
)
SELECT
    c.id,
    w.title,
    w.rca_summary AS description,
    w.priority,
    w.status,
    w.duration_min,
    CASE WHEN w.generated_by_agent THEN 'work_order_agent' ELSE 'sarah.miller' END,
    w.generated_by_agent,
    NOW() - (INTERVAL '1 day' * w.days_ago) - (INTERVAL '1 hour' * w.hours_ago) - INTERVAL '15 minutes',
    w.rca_summary,
    w.recommended_actions,
    NOW() - (INTERVAL '1 day' * w.days_ago) - (INTERVAL '1 hour' * w.hours_ago),
    CASE WHEN w.completed_after_min IS NOT NULL
         THEN NOW() - (INTERVAL '1 day' * w.days_ago) - (INTERVAL '1 hour' * w.hours_ago) + (INTERVAL '1 minute' * w.completed_after_min)
         ELSE NULL END
FROM wo_data w
JOIN cell c ON c.name = w.cell_name
WHERE NOT EXISTS (
    SELECT 1 FROM work_order wo WHERE wo.cell_id = c.id AND wo.title = w.title
);

-- ============================================
-- 4. Failure history (5 rows) — see demo-seed-content.md §5
-- Row #3 (Bottle Capper, 3 months ago, bearing_wear) is the memory-scene anchor.
-- ============================================
INSERT INTO failure_history(
    cell_id, failure_time, resolved_time, failure_mode, root_cause,
    resolution, parts_replaced, downtime_minutes, cost_estimate, signal_patterns
)
SELECT
    c.id,
    x.failure_time::timestamptz,
    x.resolved_time::timestamptz,
    x.failure_mode,
    x.root_cause,
    x.resolution,
    x.parts::jsonb,
    x.dt,
    x.cost,
    x.signal_patterns::jsonb
FROM cell c
JOIN (VALUES
    -- 1: Bottle Filler bearing wear (3 months ago)
    ('Bottle Filler',
     NOW() - INTERVAL '3 months',
     NOW() - INTERVAL '3 months' + INTERVAL '4 hours',
     'bearing_wear',
     'Discharge bearing wear near end-of-life — replaced under PM-2026-01-18.',
     'Replaced both bearings (NDE + DE), realigned coupling',
     '["Grundfos 96416067","Grundfos 96416068"]',
     240, 1850.00,
     '{"vibration_mm_s":{"peak":5.4,"duration_min":14,"slope_per_hour":0.024},"bearing_temp_c":{"peak":78,"slope_per_hour":0.4}}'),
    -- 2: Bottle Filler seal leak (6 months ago)
    ('Bottle Filler',
     NOW() - INTERVAL '6 months',
     NOW() - INTERVAL '6 months' + INTERVAL '6 hours',
     'mechanical_seal_leak',
     'Seal face wear; replaced mechanical seal kit and flushed seal chamber.',
     'Replaced mechanical seal kit, flushed seal chamber',
     '["Grundfos 96416072 shaft seal kit (HQQE)"]',
     360, 1200.00,
     '{"flow_l_min":{"drop_from":533,"drop_to":488},"pressure_bar":{"oscillation_amplitude":0.6}}'),
    -- 3: Bottle Capper bearing wear (3 months ago) — memory-scene anchor
    ('Bottle Capper',
     NOW() - INTERVAL '3 months',
     NOW() - INTERVAL '3 months' + INTERVAL '4 hours',
     'bearing_wear',
     'Drive bearing replaced. Same pattern as Filler''s January incident — both pump-side rotating kit.',
     'Replaced spindle bearing; realigned drive shaft.',
     '["SKF 6203-2Z"]',
     240, 850.00,
     '{"vibration_mm_s":{"peak":4.8,"duration_min":22,"slope_per_hour":0.018},"cap_torque_nm":{"rho_with_vibration":0.71}}'),
    -- 4: Source Pump impeller imbalance (4 months ago)
    ('Source Pump',
     NOW() - INTERVAL '4 months',
     NOW() - INTERVAL '4 months' + INTERVAL '2 hours',
     'impeller_imbalance',
     'Cavitation damage on impeller vanes; inspected and re-balanced, no replacement.',
     'Inspected and re-balanced impeller, no replacement needed',
     '[]',
     120, 400.00,
     '{"vibration_mm_s":{"spike_peak":5.2,"return_to_nominal_min":3}}'),
    -- 5: UV Sterilizer lamp replacement (5 months ago)
    ('UV Sterilizer',
     NOW() - INTERVAL '5 months',
     NOW() - INTERVAL '5 months' + INTERVAL '3 hours',
     'lamp_replacement',
     'UV lamp #3 reached end-of-life. Replaced with Trojan P/N UV3K-LAMP-440W; all 4 banks verified.',
     'Replaced UV lamp #3.',
     '["Trojan UV3K-LAMP-440W"]',
     180, 620.00,
     '{"uv_intensity_mw_cm2":{"drop_from":28,"drop_to":19},"uv_runtime_h":{"at_failure":7640}}')
) AS x(cell_name, failure_time, resolved_time, failure_mode, root_cause, resolution, parts, dt, cost, signal_patterns)
    ON x.cell_name = c.name;

-- ============================================
-- 5. Logbook entries (20 rows) — see demo-seed-content.md §6
-- Demo-critical entries: #12 (Priya, Filler "ran rough"), #13 (Priya follow-up).
-- These two anchor the Investigator's memory-scene narration.
-- ============================================
INSERT INTO logbook_entry(cell_id, author_id, entry_time, category, severity, content)
SELECT
    c.id, u.id, x.entry_time::timestamptz, x.category, x.severity, x.content
FROM cell c
JOIN (VALUES
    ('Bottle Filler',  'sarah.miller',  NOW() - (INTERVAL '6 days 22 hours'), 'observation',  'info',
     'Quiet morning. Filler humming along. Bottles per minute holding at 180.'),
    ('UV Sterilizer',  'marco.ferrari', NOW() - (INTERVAL '6 days 14 hours'), 'maintenance',  'info',
     'Lamp #2 runtime counter reset after PM. Back to zero. All four lamps confirmed lit.'),
    ('Source Pump',    'priya.patel',   NOW() - (INTERVAL '5 days 20 hours'), 'observation',  'warning',
     'Flow dropped briefly (~720 L/min) around 02:30, recovered in 90 seconds. Logged just in case.'),
    ('Source Pump',    'sarah.miller',  NOW() - (INTERVAL '5 days 10 hours'), 'incident',     'warning',
     'Reached 02:30 note — field tech recalibrated upstream flow sensor (drift ~4%). Back to spec.'),
    ('Bottle Capper',  'priya.patel',   NOW() - (INTERVAL '4 days 21 hours'), 'incident',     'warning',
     'Cap jam at 04:10, resolved 04:18. Usual suspect — cap rim deformity. Two bottles rejected.'),
    ('UV Sterilizer',  'marco.ferrari', NOW() - (INTERVAL '4 days 14 hours'), 'observation',  'info',
     'UV intensity across all four banks inside green band. No action.'),
    ('Bottle Filler',  'priya.patel',   NOW() - (INTERVAL '3 days 23 hours'), 'observation',  'info',
     'Filler a bit noisier than usual around 03:00. Not above the limit, just noticing. Probably nothing.'),
    ('UV Sterilizer',  'tom.anderson',  NOW() - (INTERVAL '3 days 15 hours'), 'maintenance',  'info',
     'Planned — lamp #1 runtime 7500h alarm. Scheduled replacement for next Wednesday.'),
    ('Bottle Filler',  'sarah.miller',  NOW() - (INTERVAL '3 days 5 hours'),  'incident',     'warning',
     'Transient pressure spike, 6.8 bar for 4 seconds. ARIA flagged. Cancelled after no correlation with downstream.'),
    ('Source Pump',    'sarah.miller',  NOW() - (INTERVAL '2 days 16 hours'), 'incident',     'critical',
     'Seal leak — water trace on the mechanical seal housing. Called field. Seal replaced in 2 hours.'),
    ('Bottle Capper',  'marco.ferrari', NOW() - (INTERVAL '2 days 11 hours'), 'changeover',   'info',
     'Line change-over 500 ml -> 1.5 L caps. Capper torque spec updated from 3.5 to 4.1 Nm. 30 min downtime.'),
    -- #12 — the demo-critical entry the Investigator narrates
    ('Bottle Filler',  'priya.patel',   NOW() - (INTERVAL '1 days 22 hours'), 'observation',  'warning',
     'Filler ran rough for about ten minutes after shift change. Sounded like a pulley. Settled on its own. Will watch next shift.'),
    -- #13 — Priya follow-up
    ('Bottle Filler',  'priya.patel',   NOW() - (INTERVAL '1 days 20 hours'), 'incident',     'warning',
     'Vibration uptrend continues. ARIA opened a WO. Scheduling impeller re-centre for next maintenance window.'),
    ('UV Sterilizer',  'sarah.miller',  NOW() - (INTERVAL '1 days 13 hours'), 'maintenance',  'info',
     'Verified lamp #2 runtime still under 7900. Holding for Wednesday.'),
    ('Bottle Capper',  'marco.ferrari', NOW() - (INTERVAL '1 days 6 hours'),  'observation',  'info',
     'Line running clean at 180 bpm. No jams past two shifts.'),
    ('Source Pump',    'priya.patel',   NOW() - (INTERVAL '18 hours'),        'observation',  'info',
     'Nothing to report from the pump — steady flow.'),
    ('Bottle Capper',  'priya.patel',   NOW() - (INTERVAL '14 hours'),        'incident',     'warning',
     'Torque readout bouncing between 3.2 and 3.9 Nm. No audible jam. Will run a bench test on the spindle day-shift.'),
    ('Bottle Capper',  'sarah.miller',  NOW() - (INTERVAL '10 hours'),        'maintenance',  'info',
     'Bench test on capper spindle started. Running baseline for 2h then loading.'),
    ('Bottle Filler',  'sarah.miller',  NOW() - (INTERVAL '5 hours'),         'observation',  'info',
     'Filler motor shake back to ~3.1 mm/s after the impeller nudge. Feels right.'),
    ('UV Sterilizer',  'sarah.miller',  NOW() - (INTERVAL '2 hours'),         'observation',  'info',
     'Pre-replacement check on lamp #2 — intensity 27.8 mW/cm2. Holding steady.')
) AS x(cell_name, author_username, entry_time, category, severity, content)
    ON x.cell_name = c.name
JOIN users u ON u.username = x.author_username
WHERE NOT EXISTS (
    SELECT 1 FROM logbook_entry le
    WHERE le.cell_id = c.id
      AND le.entry_time = x.entry_time::timestamptz
      AND le.author_id = u.id
);
