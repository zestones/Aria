-- ============================================
-- ARIA — KB + Work Order extension (M1.1 + M1.2)
--
-- Brings equipment_kb + work_order in line with the agent + frontend contract
-- decided in technical.md §2.4.
--   - equipment_kb: structured_data is the single source of truth for KB
--     content (Pydantic EquipmentKB blob). The 3 legacy jsonb columns are
--     superseded and dropped.
--   - work_order: carry agent outputs (RCA summary from Investigator,
--     structured recommendations from Work Order Generator, provenance flag,
--     anomaly timestamp). The status CHECK is widened to cover the
--     detected → analyzed → open → in_progress → completed flow.
--
-- Scope of this file:
--   - equipment_kb: drop 3 legacy columns, add 5 new columns
--     (the P-02 KB content seed lives in seeds/p02_kb.sql, applied by apply.sh)
--   - work_order: add 4 new columns + widen status CHECK
--   - failure_history: add signal_patterns column
-- ============================================
-- ============================================
-- equipment_kb — drop legacy jsonb columns (replaced by structured_data)
-- ============================================
ALTER TABLE equipment_kb
    DROP COLUMN nominal_specs,
    DROP COLUMN common_failure_modes,
    DROP COLUMN maintenance_recommendations;

-- ============================================
-- equipment_kb — new columns
-- ============================================
ALTER TABLE equipment_kb
    ADD COLUMN structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN raw_markdown text,
    ADD COLUMN confidence_score real NOT NULL DEFAULT 0.0,
    ADD COLUMN last_enriched_at timestamptz,
    ADD COLUMN onboarding_complete boolean NOT NULL DEFAULT FALSE;

-- ============================================
-- Equipment KB seed — moved out of this migration (issue #69).
--
-- The canonical P-02 KB blob now lives in
-- infrastructure/database/seeds/p02_kb.sql and is applied automatically
-- by apply.sh after all migrations run. Seeds use ON CONFLICT DO UPDATE
-- so they are idempotent and safe to re-apply, which migrations are not
-- (DROP COLUMN above is destructive on re-run).
-- ============================================
-- ============================================
-- work_order — new columns for agent outputs
-- ============================================
ALTER TABLE work_order
    ADD COLUMN rca_summary text,
    ADD COLUMN recommended_actions jsonb,
    ADD COLUMN generated_by_agent boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN trigger_anomaly_time timestamptz;

-- ============================================
-- work_order — widen status CHECK to cover the full agent flow:
--   detected (Sentinel) → analyzed (Investigator posts rca_summary) →
--   open (Work Order Generator posts recommended_actions) →
--   in_progress → completed. cancelled is a terminal exit from any active state.
-- NOTE: existing constraint is named chk_wo_status (from migration 005),
-- not the postgres-default work_order_status_check.
-- ============================================
ALTER TABLE work_order
    DROP CONSTRAINT chk_wo_status;

ALTER TABLE work_order
    ADD CONSTRAINT chk_wo_status CHECK (status IN ('detected', 'analyzed', 'open', 'in_progress', 'completed', 'cancelled'));

-- ============================================
-- failure_history — signal signature column (M1.3)
-- Stores the time-series signal pattern captured at anomaly time.
-- Used by Investigator for pattern matching against past failures.
-- ============================================
ALTER TABLE failure_history
    ADD COLUMN signal_patterns jsonb DEFAULT NULL;

