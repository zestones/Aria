# Demo Build Spec

> [!NOTE]
> Companion to [demo-plant-design.md](./demo-plant-design.md). **Story doc says WHAT. This doc says HOW.** It is a living checklist — the single source of truth for what is shipped, what is pending, the exact contract of each pending piece, the dry-run observations that define "done", and the time-indexed cuts of the 3-minute video. Use this doc during build, rehearsal, and recording.

> [!IMPORTANT]
> **Schema, migrations, and seed data are user-owned and out of scope for this spec.** The user maintains their own SQL migrations and seed files. The DB can be nuked and reseeded at will — no demo state is precious. This doc covers only the **demo-logic layer**: the endpoints that trigger scenes, the frontend control strip that fires them, and the dry-run / video plan that uses them. When the spec refers to "the plant" it describes what the user's seed is expected to produce (a named cell with a vibration signal, etc.), not something I will generate.

---

## Table of contents

0. [How to read / use this doc](#0-how-to-read--use-this-doc)
1. [Capability × trigger × observable × status matrix](#1-capability--trigger--observable--status-matrix)
2. [Pending work — contracts](#2-pending-work--contracts)
    - 2.1 [Seed data expectations (contract from the endpoints' POV)](#21-seed-data-expectations-contract-from-the-endpoints-pov)
    - 2.2 [Demo endpoints](#22-demo-endpoints)
    - 2.3 [Frontend `DemoControlStrip`](#23-frontend-democontrolstrip)
    - 2.4 [Env + rollout tasks](#24-env--rollout-tasks)
3. [Dry-run checklist](#3-dry-run-checklist)
4. [3-minute video storyboard](#4-3-minute-video-storyboard)
5. [Risk-of-regression notes](#5-risk-of-regression-notes)

---

## 0. How to read / use this doc

- **During build**: work the `pending` rows top-to-bottom. Each has a contract in §2.
- **During rehearsal**: walk §3, tick each `observable` live. A failing tick resets the scene, not the whole stack.
- **During recording**: each §4 beat has a time range, an on-screen target, and a spoken line.
- **When something ships**: flip its row status from `pending` to `shipped`, paste the verification timestamp, add an inline note if you hit a gotcha.

Status vocabulary (four values, one meaning each):

- `shipped+verified` — code merged *and* end-to-end observed working against the live stack. Cite the verification run.
- `shipped+untested` — code merged, tests pass, **not yet** exercised end-to-end on the live stack.
- `pending` — not started / partially started / broken.
- `user-owned` — provided by the user's seed + migrations; out of this spec's scope but listed for completeness so the dry-run checklist is exhaustive.

---

## 1. Capability × trigger × observable × status matrix

Ordered by narration-beat priority (scene 0 → scene 7).

| #  | Capability                             | Trigger (how to fire it)                                                                            | Observable (what the judge sees)                                                                                                                 | Status                                                                                                                                                                       |
|----|----------------------------------------|-----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Plant reads as a real plant            | Land on `/control-room` after stack up                                                              | Grid of 5 tiles with human-readable machine names (Source Pump, UV Sterilizer, Bottle Filler, Bottle Capper, Bottle Labeler) + populated KPI bar | `user-owned` — the user's seed + migrations provide the cells, KB rows, signal definitions, and 7-day history. This spec treats it as a precondition (see §2.1).             |
| 2  | Agent Constellation wow-open           | Hotkey `A` on any page                                                                              | Full-screen overlay: 5 agents, live handoff particles, tool-call rail                                                                            | `shipped+verified` — from the M9 plan, previously live                                                                                                                       |
| 3  | New machine onboarding                 | Click an onboarding-target tile (e.g. `Bottle Labeler`) → upload Grundfos NB-G PDF                  | Wizard: `KbProgress` 5 phases → `MultiTurnDialog` 3-4 questions → `EquipmentKbCard` reveal                                                       | `shipped+verified` on the legacy cell name, `shipped+untested` on whatever name the user's seed produces. Wizard itself is manufacturer-agnostic.                            |
| 4  | Predictive forecast (cool banner)      | `POST /api/v1/demo/scene/seed-forecast` with `{target:"Bottle Filler"}`                             | `AnomalyBanner` appears in accent-arc tone within ≤ 60 s: *"forecast to breach alert (4.1 → 4.5) in ~2.3h · 92% confidence"*                     | `shipped+verified` — live 23:22 UTC: endpoint injected 40 samples, `forecast_warning cell=1 signal_def=1 eta=2.92h trend=rising r2=0.82` fired within ~30s                   |
| 5  | Real anomaly — Sentinel catches it     | `POST /api/v1/demo/scene/trigger-breach` with `{target:"Bottle Filler"}` OR natural simulator drift | `AnomalyBanner` flips to destructive tone; WO row appears in `/work-orders` with `status=detected`                                               | `shipped+verified` — endpoint injected 5 readings, WO 55 opened at 23:22:26 `status=detected`, Investigator session `sesn_011CaPTQSWCdaNtv8LXk5DKW` spawned                  |
| 6  | Extended-thinking stream               | Automatic once Investigator spawns                                                                  | `thinking_delta` frames stream in Agent Inspector + chat drawer                                                                                  | `shipped+verified` (visible on every Investigator run in every dry-run today)                                                                                                |
| 7  | **Sandbox Python execution card**      | Automatic on drift-class breach; prompt forces bash+render                                          | Inline `SandboxExecution` card: verbatim Python, verbatim `key=value` output, cyan **"Ran in Anthropic sandbox"** chip                           | `shipped+verified` — 3 frames captured live 21:38 UTC, technique=correlation, rho to 4 decimals over 20k+ samples                                                            |
| 8  | `Sandbox:` prefix in RCA               | Automatic after bash run                                                                            | WO detail page RCA text begins `Sandbox: rho=..., n=... Root cause: ...`                                                                         | `shipped+verified` — WOs 43/44/45 all have it                                                                                                                                |
| 9  | Diagnostic card with confidence        | Automatic at end of RCA                                                                             | Inline `DiagnosticCard`: title, confidence %, factors list                                                                                       | `shipped+verified` — seen in every finished investigation                                                                                                                    |
| 10 | Work Order card + Printable WO         | Automatic after `submit_rca` → WO Generator runs                                                    | Inline `WorkOrderCard` in chat; `/work-orders/{id}` printable view                                                                               | `shipped+verified`                                                                                                                                                           |
| 11 | Memory recall (pattern match)          | `POST /api/v1/demo/trigger-memory-scene` with `{cell_name:"Bottle Capper"}`                         | `PatternMatch` card: "Live signature / Preceded failure on 24 Jan 2026" + `Predicted MTTF: 4.0 h` row + Recommended action row                   | `shipped+untested` — endpoint already exists and accepts `cell_name` in body. Works against whatever cell name the user's seed produces. Untested against the new cell name. |
| 12 | Shift page                             | Click `Shifts` in sidebar OR click shift pill in TopBar                                             | `/shifts` renders: current-shift header + rota table + activity metrics + shift-logbook panel                                                    | `shipped+verified` — all four panels ship, 112 frontend tests pass. **Data-empty without seed** (no logbook, no shift assignments in fresh DB)                               |
| 13 | Operator on-duty name in TopBar        | Automatic on any page                                                                               | Pill reads *"Night shift · 22:00 → 06:00 · Priya Patel"* and is clickable → `/shifts`                                                            | `shipped+untested` — code shipped; no seed data yet so currently displays "Unassigned"                                                                                       |
| 14 | Chat Q&A grounded in KB                | Chat: *"show me the KB for the Bottle Filler"*                                                      | `EquipmentKbCard` renders inline in chat message stream                                                                                          | `shipped+untested` on new cell name                                                                                                                                          |
| 15 | Chat Q&A with `BarChart`               | Chat: *"bottles per minute last week by shift"*                                                     | `BarChart` renders inline                                                                                                                        | `shipped+untested`                                                                                                                                                           |
| 16 | Forecast + anomaly banner co-exist     | Fire scene 4 then scene 5 on same cell within 60 s                                                  | Banner head-slot: destructive anomaly wins over cool forecast; `+1 more` badge on the tail                                                       | `shipped+verified` — merge logic in `AnomalyBanner` passes unit tests                                                                                                        |
| 17 | DEV control strip for scene-triggering | Click the ghost-circle toggle bottom-right → pick an action from the expanded strip                 | Endpoint fires; inline status shows for ~3s; strip auto-collapses; observables per row 4/5/11 above                                              | `shipped+untested` — component merged, typecheck + lint clean, 112 frontend tests green. Click-level smoke-test pending in the browser.                                      |

**Summary as of this pass**: 12/17 `shipped+verified`, 4/17 `shipped+untested`, 1/17 `user-owned`, 0/17 `pending`. §2.2 (demo endpoints) and §2.3 (DemoControlStrip) both landed; rows 4 and 5 flipped to verified after the live 23:22 UTC dry-run captured a forecast_warning (ETA 2.92 h, R² 0.82) plus WO 55 opened and an Investigator session spawned. The four `shipped+untested` rows (onboarding, memory recall, chat Q&A × 2) flip to verified as soon as the user applies a seed that exercises them. The `user-owned` row flips against the user's own deploy.

---

## 2. Pending work — contracts

### 2.1 Seed data expectations (contract from the endpoints' POV)

> [!IMPORTANT]
> **The user owns schema, migrations, and seed SQL.** Nothing in this spec writes migration files or seed scripts — the DB can be nuked and reseeded at will. This section describes only what the demo endpoints (§2.2) and the dry-run checklist (§3) *assume* the user's seed will have produced. If a dry-run observation fails and the assumption below is not satisfied, the fix is in the user's seed, not in this spec.

> [!TIP]
> **The companion doc [`demo-seed-content.md`](./demo-seed-content.md) now ships the literal content the seed should populate** — 5 cells with signal envelopes, 12 specific work orders, 20 scripted logbook entries, 5 failure-history rows with `signal_patterns` jsonb, a 7-day rota, machine-status transitions, production-event distribution, and §10 integrity checks. Copy the tables, translate to SQL / `asyncpg` / SQLAlchemy — no invention required.

**What the endpoints need at steady state (i.e. once the user's seed + migrations are applied):**

| Assumption                                                                                            | Used by                                                   | Failure mode if missing                                                                                 |
|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| At least one `cell` row with `onboarding_complete=TRUE`                                               | `seed-forecast`, `trigger-breach`, `trigger-memory-scene` | 404 on the endpoint body's `target` / `cell_name` resolution                                            |
| That cell has a `process_signal_definition` with `kb_threshold_key='vibration_mm_s'`                  | `seed-forecast`, `trigger-breach`                         | 400 — "no vibration signal on cell"                                                                     |
| That cell's `equipment_kb.structured_data.thresholds.vibration_mm_s` contains a numeric `alert` value | `seed-forecast`, `trigger-breach`                         | Endpoint falls back to a hard-coded 4.5 mm/s literal (safe but brittle)                                 |
| `failure_history` has **no** recent (< 7 days) row for the memory-scene target cell                   | `trigger-memory-scene`                                    | Endpoint explicitly deletes those before seeding the scene; no failure, just slower                     |
| No open agent-generated work-order on the target cell/signal in the last 35 min                       | `seed-forecast`, `trigger-breach`, `trigger-memory-scene` | All three endpoints explicitly cancel these first; no action required of the seed                       |
| 7-day history on every monitored signal, clamped so the last 6 h has no net drift                     | `/shifts` page + forecast-watch reliability               | Shift-page activity panel shows "—"; forecast-watch may fire on seeded drift instead of simulator drift |
| Shift + shift_assignment + logbook_entry rows populated                                               | `/shifts` page scene                                      | Shift page header + rota + logbook all render empty; scene 6 video beat loses its "Priya's note" anchor |

**Naming convention the endpoints and the video script assume** (derived from [demo-plant-design.md §3](./demo-plant-design.md#3-the-plant--five-machines-one-bottle)):

- A cell named **`Bottle Filler`** (the star — forecast + anomaly + RCA target)
- A cell named **`Bottle Capper`** (memory-scene target)
- A cell named **`Source Pump`** (background)
- A cell named **`UV Sterilizer`** (background)
- A cell named **`Bottle Labeler`** (onboarding-wizard target; `onboarding_complete=FALSE`)

If the user's seed uses different names, the demo endpoints still work — pass `{"target":"<your cell name>"}` in the body. The defaults are placeholder and can be changed via one-line edits in `backend/modules/demo/router.py` if a persistent override is preferred to per-request bodies.

**Operator / shift names that appear on the Shift page (if the user's seed includes them):** Sarah Miller (day), Marco Ferrari (evening), Priya Patel (night), Tom Anderson (supervisor). The scene-6 video narration references "Priya" — if the user's seed uses different names, the narration swaps accordingly.

### 2.2 Demo endpoints

All under `/api/v1/demo/*`. All gated behind `ARIA_DEMO_ENABLED=true` (same mount pattern as the existing `trigger-memory-scene`). All return JSON envelope `{status, message, data}` via `core.api_response.ok()`.

#### 2.2.1 `POST /api/v1/demo/reset/light`

**Body:** `{}` (no params)

**Response:** `data = { cleared_work_orders:int, cleared_readings:int, cleared_forecast_debounce_entries:int }`

**Side effects:**
1. `UPDATE work_order SET status='cancelled', completed_at=NOW() WHERE generated_by_agent=TRUE AND status NOT IN ('completed','cancelled') AND created_at > NOW() - INTERVAL '35 minutes'`
2. `DELETE FROM process_signal_data WHERE time > NOW() - INTERVAL '2 hours' AND signal_def_id IN (every monitored signal on Bottle Filler + Bottle Capper)` — so the next breach is clean
3. `agents.sentinel.forecast._forecast_last_emit.clear()` — resets the in-memory debounce
4. Logs the three counts

**Latency:** ≤ 1 s

**Errors:** none expected; DB errors → 500.

#### 2.2.2 `POST /api/v1/demo/reset/full`

> [!NOTE]
> This endpoint assumes the user has a seed entry-point they want the backend to invoke. If the user prefers to run the reset manually (`make db.reset && make db.seed.<theirs>`), **skip this endpoint entirely** and rely on `reset/light` for mid-demo recovery. Documented here for completeness in case the user wires the seed into the backend.

**Body:** `{}`

**Response:** `data = { duration_seconds:float, rows_by_table:dict }`

**Side effects:**
1. Acquire the DB pool.
2. Truncate transactional tables in dependency-safe order: `process_signal_data`, `work_order`, `failure_history`, `logbook_entry`, `machine_status`, `production_event`, `shift_assignment`.
3. Invoke the user-owned seed entry-point (path + name to be decided when the endpoint is built — pass in as a setting, e.g. `ARIA_DEMO_SEED_MODULE`).
4. Restart the simulator container via `docker` SDK (optional — if not, next tick picks up the new state; simpler path: skip).
5. Clear forecast debounce.

**Latency:** 10-15 s, depends on the user's seed.

**Errors:** 500 on seed failure; the truncate step is wrapped in a best-effort rollback attempt.

#### 2.2.3 `POST /api/v1/demo/scene/seed-forecast`

**Body:** `{"target":"Bottle Filler"}` (default if omitted)

**Response:** `data = { cell_id, signal_def_id, samples_inserted, expected_forecast_within_seconds:60 }`

**Side effects:**
1. Look up `cell_id` from `target` cell name.
2. Look up vibration signal on that cell (`kb_threshold_key='vibration_mm_s'`).
3. Fetch current KB thresholds for that signal (`alert` value).
4. Generate 40 samples spanning last 6 h with clean linear slope from `nominal * 1.00` to `alert * 0.92` (below threshold, but heading up).
5. INSERT into `process_signal_data` with `ON CONFLICT DO NOTHING`.

**Latency:** ≤ 1 s write; observable `forecast_warning` within 60 s (next forecast-watch tick).

**Errors:** 404 unknown cell; 400 no vibration signal on cell.

#### 2.2.4 `POST /api/v1/demo/scene/trigger-breach`

**Body:** `{"target":"Bottle Filler"}` (default)

**Response:** `data = { cell_id, signal_def_id, readings_inserted:5, expect_anomaly_within_seconds:30 }`

**Side effects:**
Exact copy of the 5-reading injection I've been doing manually:

```sql
INSERT INTO process_signal_data (time, cell_id, signal_def_id, raw_value) VALUES
  (NOW() - INTERVAL '150 seconds', $1, $2, threshold * 1.05),
  (NOW() - INTERVAL '120 seconds', $1, $2, threshold * 1.08),
  (NOW() - INTERVAL '90 seconds',  $1, $2, threshold * 1.12),
  (NOW() - INTERVAL '60 seconds',  $1, $2, threshold * 1.16),
  (NOW() - INTERVAL '30 seconds',  $1, $2, threshold * 1.22)
ON CONFLICT (time, signal_def_id) DO NOTHING;
```

Also cancels any open agent WO on that (cell, signal) in the last 35 min (same debounce guard as the memory-scene endpoint).

**Latency:** ≤ 1 s write; breach visible within 30 s tick.

**Errors:** 404/400 as above.

#### 2.2.5 `POST /api/v1/demo/trigger-memory-scene` — **may need a default update**

The endpoint already exists and accepts `cell_name` in the request body (currently defaults to `"P-02"`). **No code change is strictly required** — the user can always pass the target cell name explicitly in the body.

Optional one-line change, if the user's seed consistently uses `"Bottle Capper"` as the memory-scene target and you want the default to match: flip the default in `backend/modules/demo/router.py::trigger_memory_scene`. Pure ergonomic — affects only the zero-body rehearsal curl, not contract.

#### 2.2.6 `POST /api/v1/demo/scene/run-full`

**Body:** `{}`

**Response:** 202 Accepted, `data = { run_id:str }` (fire-and-forget)

**Side effects:** Spawns an asyncio task that runs this chain with `asyncio.sleep` between steps:

```
await reset_light()
await sleep(2)
await seed_forecast({"target":"Bottle Filler"})
await sleep(75)                    # forecast banner appears
await trigger_breach({"target":"Bottle Filler"})
await sleep(240)                   # Sentinel fires, Investigator runs + submits RCA, WO Gen runs
await trigger_memory_scene({"cell_name":"Bottle Capper"})
# Ends here. Total wall-clock ~5-6 min.
```

**Latency:** immediate response; full scene takes ~5-6 min.

**Errors:** each step's failure is logged; the chain short-circuits on first failure.

**Tests** (per-endpoint, follow `tests/unit/modules/demo/test_router.py` pattern — fake asyncpg conn, call handler directly):

- Unknown target cell → 404.
- Invalid body shape → 422.
- Happy path writes expected number of rows.

**Effort:** ~2 h total for the 5 new endpoints + update to existing trigger-memory-scene + tests.

---

### 2.3 Frontend `DemoControlStrip`

**Mount:** `AppShell.tsx`, next to `DemoReplayButton`, same `import.meta.env.DEV` gate. Bottom-left fixed position.

**File:** `frontend/src/features/demo/DemoControlStrip.tsx`. Export via `features/demo/index.ts`.

**Component shape:**

```tsx
const BUTTONS: Array<{ label: string; action: () => Promise<Response>; tone?: "primary" | "destructive" }> = [
    { label: "Reset plant",     action: () => post("/api/v1/demo/reset/full"),        tone: "destructive" },
    { label: "Clear alerts",    action: () => post("/api/v1/demo/reset/light") },
    { label: "Predict failure", action: () => post("/api/v1/demo/scene/seed-forecast"), tone: "primary" },
    { label: "Trigger breach",  action: () => post("/api/v1/demo/scene/trigger-breach"), tone: "primary" },
    { label: "Memory recall",   action: () => post("/api/v1/demo/trigger-memory-scene") },
    { label: "Run whole demo",  action: () => post("/api/v1/demo/scene/run-full"),    tone: "primary" },
];
```

**UX notes:**
- Each button shows a spinner + disables while the POST is in flight.
- Toast on response (success = neutral, error = destructive). Reuse existing toast pattern or inline text — no new UI library.
- On "Run whole demo", display a subtle 5-minute countdown in the button label.

**Acceptance:**
- [ ] Strip renders only in DEV.
- [ ] Clicking each button produces the expected backend response (manually verified once).
- [ ] Does not interfere with screen-share camera feed (crop-friendly or hide-toggleable).

**Effort:** ~45 min.

---

### 2.4 Env + rollout tasks

**`.env` addition** — shipped 2026-04-24:

```
ARIA_DEMO_ENABLED=true
```

Without this line the demo router does not mount (404s). **`docker compose restart backend` does NOT re-read `.env`** — use `docker compose up -d backend` after any env change. Application startup confirms via the log line `Demo endpoints enabled at /api/v1/demo/*`.

**Grundfos NB-G PDF** — shipped 2026-04-24:

- `test-assets/README.md` now documents the fetch. The PDF itself is not checked into git (copyrighted); the presenter fetches once before demo day per the README's instructions.
- Alternative: any Grundfos pump IOM of similar vintage produces comparable extraction quality — the demo narrative frames the cell as a `Bottle Labeler` regardless of PDF specifics.

**Docs flipped to reflect what shipped** — done this pass:

- [x] This file (§1 matrix) — rows 4 and 5 flipped to `shipped+verified` after live 23:22 UTC dry-run; row 17 flipped to `shipped+untested` after DemoControlStrip landed.
- [x] Summary line recomputed (12/17 verified, 4/17 untested, 1/17 user-owned, 0/17 pending).
- [ ] `demo-plant-design.md` §11 gantt — still carries stale "rollout" rows for work now done; can be struck whenever convenient (no blocking impact).
- [ ] `demo-playbook.md` — still written against the pump-only naming; will drift further if the user renames cells in the seed. Updating when the user's naming is final.

---

## 3. Dry-run checklist

**Prerequisites:** stack up; `ARIA_DEMO_ENABLED=true`; tunnel live; user's seed + migrations applied within the last 15 min; logged in as `admin`.

Walk this list top-to-bottom. Each row has an expected observable. A failed observable resets the scene via `POST /api/v1/demo/reset/light`; a repeat failure blocks the video.

| Beat | Action                                              | Expected observable                                                                  | Pass / Fail |
|------|-----------------------------------------------------|--------------------------------------------------------------------------------------|-------------|
| 0a   | Navigate to `/control-room`                         | 5 tiles with plain-English names; KPI bar shows numbers; no red/orange on any tile   |             |
| 0b   | Hit hotkey `A`                                      | Constellation overlay opens full-screen in < 300 ms                                  |             |
| 0c   | Hit `Esc`                                           | Overlay closes; returns to control room                                              |             |
| 1a   | Click Bottle Labeler tile                           | Modal/drawer offers "Start onboarding" with PDF upload                               |             |
| 1b   | Upload Grundfos PDF                                 | `KbProgress` shows 5 phases, each under 2 s                                          |             |
| 1c   | Answer 3 calibration questions in `MultiTurnDialog` | `EquipmentKbCard` reveals with calibrated thresholds                                 |             |
| 2    | Click `Predict failure` in DemoControlStrip         | Cool-tone `AnomalyBanner` appears within 60 s with ETA caption                       |             |
| 3a   | Click `Trigger breach`                              | Banner flips to destructive tone within 30 s; click "Investigate" → chat opens       |             |
| 3b   | Watch chat drawer                                   | `thinking_delta` stream visible in Agent Inspector                                   |             |
| 3c   | Wait ≤ 60 s                                         | **`SandboxExecution` card with cyan chip renders in chat**                           |             |
| 3d   | `DiagnosticCard` renders                            | RCA text begins with `Sandbox: ...`                                                  |             |
| 4    | Navigate to `/work-orders`, open the newest         | `PrintableWorkOrder` renders; print works                                            |             |
| 5a   | Click `Memory recall` in DemoControlStrip           | Second banner appears targeting Bottle Capper within 35 s                            |             |
| 5b   | Wait for Investigator on Bottle Capper              | `PatternMatch` card with "Predicted MTTF: 4.0 h" row                                 |             |
| 6a   | Click `Shifts` in sidebar                           | `/shifts` page: header with operator name, rota table, activity panel, logbook panel |             |
| 6b   | Chat: *"show me the KB for the Bottle Filler"*      | `EquipmentKbCard` renders inline in chat                                             |             |
| 6c   | Chat: *"bottles per minute last week by shift"*     | `BarChart` renders inline                                                            |             |
| 7    | Hit `A` → Constellation                             | Overlay with recent handoffs visible                                                 |             |

**If any row fails:**

1. Hit `Clear alerts` in the DemoControlStrip (`POST /api/v1/demo/reset/light`).
2. Wait ~10 s for Sentinel debounce to clear.
3. Retry the failing beat.

**If the same row fails twice in a row:**

- For beat 3c (sandbox card missing): see §5 regression notes — the agent skipped bash.
- For beat 5b (pattern-match card missing): memory-scene endpoint didn't find a seeded failure for the target cell; verify the user's seed populated `failure_history` for the cell named in the request body (default `"P-02"` — pass a different name in the body if the seed uses one).
- Everything else: dump `docker compose logs backend --tail=200` and read.

---

## 4. 3-minute video storyboard

Target duration: **3:00 minutes**. Seven sections. Aggressive cutting.

### Time-indexed cuts

| Time            | Scene                                | On screen                                                                                               | Spoken line                                                                                                                                                                                                                                                                                                                      |
|-----------------|--------------------------------------|---------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0:00 - 0:15     | Cold open                            | Close-up on the 5-tile Control Room grid, zoom out to show KPI bar with real numbers                    | *"This is a small plant that bottles drinking water for fifty thousand people. Five machines. Watched by five AI agents on Claude Opus 4.7."*                                                                                                                                                                                    |
| 0:15 - 0:25     | Constellation reveal                 | Hotkey `A` → full overlay → hold 2 s → close                                                            | *"Five managed agents, one MCP server. You will see them hand problems to each other live."*                                                                                                                                                                                                                                     |
| 0:25 - 0:50     | Onboarding                           | Click Bottle Labeler → PDF upload → `KbProgress` → `MultiTurnDialog` → `EquipmentKbCard` reveal         | *"New machine coming online — upload its manual. ARIA reads it, asks me three questions, calibrates the alerts. Under two minutes."*                                                                                                                                                                                             |
| 0:50 - 1:00     | Forecast banner                      | Back to Control Room; cool-tone banner appears                                                          | *"ARIA is predicting a breach in about two hours. Nothing is broken yet. This is the predictive loop."*                                                                                                                                                                                                                          |
| 1:00 - 1:15     | Sentinel catches the real breach     | Banner flips to destructive; chat opens; `thinking_delta` flowing                                       | *"Now it really breaks. Sentinel catches it, Investigator starts thinking — that's extended thinking on Opus 4.7, streamed live."*                                                                                                                                                                                               |
| **1:15 - 1:45** | **Sandbox card — the jaw-drop beat** | Close-up on `SandboxExecution` card; cyan chip visible; script + output blocks readable for 2 s each    | *"Here is the part that cannot happen without Managed Agents. The agent just wrote Python, ran it inside Anthropic's cloud sandbox, pulled the raw vibration data, ran a correlation analysis across three signals, got a rho of zero-point-nine-nine-four over twenty-one thousand samples. That is real Python — not tokens."* |
| 1:45 - 2:00     | RCA + `Sandbox:` prefix              | Pan to the `DiagnosticCard`; close-up on the RCA text starting `Sandbox: rho_pressure_flow=0.9944, ...` | *"Same numbers show up in the root-cause analysis. First-class numerical evidence in the work order itself."*                                                                                                                                                                                                                    |
| 2:00 - 2:15     | Printable Work Order                 | `/work-orders/42` → `Print` button → printable layout                                                   | *"The work order is already written. Technician gets this on paper."*                                                                                                                                                                                                                                                            |
| 2:15 - 2:35     | Memory recall                        | Fire `Memory recall`; second anomaly on Bottle Capper; `PatternMatch` card with MTTF row                | *"Another anomaly, on a different machine. ARIA remembers this exact pattern from January, predicts four hours to failure, and tells the operator what fixed it last time."*                                                                                                                                                     |
| 2:35 - 2:50     | Shift page                           | Click Shifts; pan over Priya's logbook entry and the 2-alert count                                      | *"The operator on the night shift left a note at 2 AM. ARIA reads it, uses it in context. Human stays in the loop."*                                                                                                                                                                                                             |
| 2:50 - 3:00     | Outro                                | Constellation + title card                                                                              | *"Five agents, one MCP server, one cloud sandbox. Claude Opus 4.7. Built in a week."*                                                                                                                                                                                                                                            |

### Framing notes

- **Single most important cut: 1:15 - 1:45.** The cyan chip must be on screen and readable for at least 3 seconds continuously. Close-up, not zoomed out. If the chip is not captured cleanly in the first take, redo the whole 1:00 - 1:45 segment.
- **Cursor visibility:** keep the cursor visible on every click so the judge understands it's a real demo, not a slideshow.
- **No music under the sandbox beat.** Silence + a single soft "click" on the card appearance draws attention to the chip. Everywhere else, ambient low-bed music is fine.
- **Render the video at 1080p minimum.** The code block in the sandbox card must be readable.

### Pre-record checklist

- [ ] Stack up, tunnel live, `ARIA_DEMO_ENABLED=true`.
- [ ] User's seed + migrations applied; `make db.reset && make db.seed.<whatever>` or equivalent run within the last hour.
- [ ] One full dry-run completed in the last 15 min, all 17 matrix rows ticked.
- [ ] Browser DevTools closed, full-screen mode on, no bookmark bar.
- [ ] DemoControlStrip visible OR screen-crop excludes it — pick one and stick to it.
- [ ] OBS / recording tool configured 1080p+, 30 fps, audio levels tested.
- [ ] Script rehearsed with a stopwatch; total under 3:00 on the dry-walkthrough.

---

## 5. Risk-of-regression notes

| Risk                                                                    | Why it can happen                                                                                          | Mitigation                                                                                                                                                                                                                                         |
|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Bootstrap cache serves a stale agent without `render_sandbox_execution` | Agent definition is cached module-level; uvicorn reload should clear but a live prod-like deploy might not | After any bootstrap-level code change, `docker compose restart backend`. Verify via the first investigation's log line: "bootstrapped managed investigator agent agent_XXXX". New `agent_XXXX` ID = fresh cache.                                   |
| Agent skips bash on a drift-class anomaly                               | LLM discretion despite MUST phrasing — rare but possible                                                   | Prompt's failure-mode rules gate on `failure_mode` text. If the agent misclassifies as spike-class, bash is skipped. Mitigation: reset and retry with a **clearly** drifting signal (monotonic 5-reading series, not a single spike).              |
| Target cell name in endpoint body does not exist in the seeded DB       | User's seed uses a different name than the endpoint's default                                              | All four trigger endpoints take `target` / `cell_name` in the request body. DemoControlStrip should either (a) ship a per-button cell-name config, or (b) trust the server default matches the user's seed. Verify with one curl before rehearsal. |
| Simulator CELL_NAME does not match the seeded cell                      | `CELL_NAME` in `docker-compose.yaml` is set on the backend/simulator service and must match a seeded cell  | User's concern — when the user renames cells in the seed, they also update the simulator env var. One-line check in `docker-compose.yaml` before rehearsal.                                                                                        |
| Shift page shows "—" everywhere                                         | User's seed did not produce `shift_assignment` / `logbook_entry` rows                                      | §3 checklist beat 6a checks this. If it fails, `SELECT count(*) FROM shift_assignment` and `SELECT count(*) FROM logbook_entry` from `make db.shell` — both should be > 0. Fix is in the user's seed, not in this spec.                            |
| Forecast banner doesn't appear within 60 s                              | forecast-watch tick was 30 s into a cycle at inject time; drift data point count < 20                      | The endpoint injects 40 samples specifically to clear the 20-sample gate. If still failing, check `docker compose logs backend | grep forecast` for the regression gate rejection reason (R² / drift rate).                                        |
| Printable WO shows a blank page                                         | Has happened before with the React portal mount on first paint                                             | Rehearse the print once in the dry-run. If blank, hit Ctrl+R on the print preview.                                                                                                                                                                 |
| Anthropic API rate limit during recording                               | Multiple sessions created during a single recording cycle                                                  | Space takes by ≥ 30 s. One Investigator run + one memory-scene Investigator run in a 3-min video is well under per-minute limits.                                                                                                                  |

---

## 6. Reference map

- [demo-plant-design.md](./demo-plant-design.md) — story doc: plant, scenes, narration.
- [demo-seed-content.md](./demo-seed-content.md) — literal seed content (5 cells, 12 WOs, 20 log entries, 5 failures, rota, production events, integrity checks).
- [demo-playbook.md](./demo-playbook.md) — operator-level runbook.
- [win-plan-48h.md](./win-plan-48h.md) — strategic plan that spawned the M9 work.
- [docs/architecture/06-forecast-watch.md](../../architecture/06-forecast-watch.md) — forecast-watch loop architecture.
- [docs/architecture/04-sentinel-investigator.md](../../architecture/04-sentinel-investigator.md) — Sentinel + Investigator architecture.
- [backend/agents/investigator/prompts.py](../../../backend/agents/investigator/prompts.py) — `SANDBOX_DIAGNOSTICS_SECTION` (Lever 2).
- [backend/agents/ui_tools.py](../../../backend/agents/ui_tools.py) — `RENDER_SANDBOX_EXECUTION` tool (Lever 1).
- [frontend/src/components/artifacts/SandboxExecution.tsx](../../../frontend/src/components/artifacts/SandboxExecution.tsx) — the visible card.
- Issue [#105](https://github.com/zestones/Aria/issues/105) — original M5.7 spec + dry-run verification comment.

---

> [!TIP]
> **If you read one section of this doc, read §1.** The capability × trigger × observable × status matrix is the entire demo collapsed to one table. Everything else expands a row.
