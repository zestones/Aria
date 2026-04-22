-- ============================================
-- ARIA — P-02 human-context seed (issue #11)
--
-- Seeds shift_assignment and work_order rows so the M2.4 MCP tools
-- (`get_shift_assignments`, `get_work_orders`) return non-empty arrays
-- against a fresh stack — required by the issue acceptance criteria.
--
-- Idempotent: every INSERT either targets a unique key (assignments) or is
-- guarded by a NOT EXISTS lookup (work_order has no natural unique key).
-- ============================================
-- ---- shift_assignment: morning + afternoon coverage on P-02 today + yesterday
INSERT INTO shift_assignment(shift_id, user_id, cell_id, assigned_date)
SELECT
    s.id,
    u.id,
    c.id,
    d::date
FROM
    cell c
    CROSS JOIN (
        VALUES (CURRENT_DATE),
(CURRENT_DATE - INTERVAL '1 day')) AS days(d)
    JOIN shift s ON s.name IN ('Morning', 'Afternoon')
    JOIN users u ON (s.name = 'Morning'
            AND u.username = 'operator')
            OR (s.name = 'Afternoon'
                AND u.username = 'viewer')
    WHERE
        c.name = 'P-02'
    ON CONFLICT (shift_id,
        user_id,
        cell_id,
        assigned_date)
        DO NOTHING;

-- ---- work_order: one open critical agent-generated WO + one completed manual WO
INSERT INTO work_order(cell_id, title, description, priority, status, estimated_duration_min, created_by, generated_by_agent, trigger_anomaly_time, rca_summary, recommended_actions, created_at)
SELECT
    c.id,
    'Bearing replacement — vibration trending up',
    'Discharge bearing vibration at 4.8 mm/s (alert threshold 4.5). Predicted failure in 5–10 days based on trend.',
    'critical',
    'open',
    240,
    'work_order_agent',
    TRUE,
    NOW() - INTERVAL '2 hours',
    'Trend analysis over 24h shows monotonic vibration drift on discharge bearing. Bearing temp also drifting up (+8 °C from baseline). Pattern matches failure_history #1 (bearing_wear, MTBF ≈ 12 months — current bearing installed 14 months ago).',
    '[{"action": "Replace upper + lower bearings", "parts": ["Grundfos 96416067", "Grundfos 96416068"], "duration_min": 240}, {"action": "Realign coupling post-replacement", "duration_min": 30}]'::jsonb,
    NOW() - INTERVAL '90 minutes'
FROM
    cell c
WHERE
    c.name = 'P-02'
    AND NOT EXISTS (
        SELECT
            1
        FROM
            work_order
        WHERE
            cell_id = c.id
            AND title = 'Bearing replacement — vibration trending up');

INSERT INTO work_order(cell_id, title, description, priority, status, estimated_duration_min, created_by, generated_by_agent, created_at, completed_at)
SELECT
    c.id,
    'Monthly preventive greasing',
    'Standard PM lubrication routine — discharge + suction bearings.',
    'medium',
    'completed',
    30,
    'operator',
    FALSE,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '15 days' + INTERVAL '25 minutes'
FROM
    cell c
WHERE
    c.name = 'P-02'
    AND NOT EXISTS (
        SELECT
            1
        FROM
            work_order
        WHERE
            cell_id = c.id
            AND title = 'Monthly preventive greasing');

