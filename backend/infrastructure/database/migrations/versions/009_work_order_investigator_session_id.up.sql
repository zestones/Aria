-- ============================================
-- ARIA — M5.5 Managed Agents migration (#103)
--
-- Adds an optional pointer from a work_order to the Anthropic Managed
-- Agents session that investigated it. Populated by the managed
-- Investigator's submit_rca handler; NULL on the M4.5 Messages API
-- fallback path. Enables the M5.6 "Continue investigation" add-on:
-- operators reopen the work_order later and the managed session resumes
-- with the full reasoning trace + tool history still on Anthropic's side.
--
-- Additive, backwards-compatible — no existing code path relies on the
-- column being set.
-- ============================================

ALTER TABLE work_order
    ADD COLUMN investigator_session_id text;

COMMENT ON COLUMN work_order.investigator_session_id IS
    'Anthropic Managed Agents session id (sess_...) that investigated this work order. NULL on the M4.5 fallback path or before M5.5 rollout.';
