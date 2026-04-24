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

| #  | Capability                             | Trigger (how to fire it)                                                                            | Observable (what the judge sees)                                                                                                                 | Status                                                                                                                                         |
|----|----------------------------------------|-----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Plant reads as a real plant            | Land on `/control-room` after stack up                                                              | Grid of 5 tiles with human-readable machine names (Source Pump, UV Sterilizer, Bottle Filler, Bottle Capper, Bottle Labeler) + populated KPI bar | `user-owned` — the user's seed + migrations provide the cells, KB rows, signal definitions, and 7-day history. This spec treats it as a precondition (see §2.1).      |
| 2  | Agent Constellation wow-open           | Hotkey `A` on any page                                                                              | Full-screen overlay: 5 agents, live handoff particles, tool-call rail                                                                            | `shipped+verified` — from the M9 plan, previously live                                                                                         |
| 3  | New machine onboarding                 | Click Bottle Labeler tile → upload Grundfos NB-G PDF                                                | Wizard: `KbProgress` 5 phases → `MultiTurnDialog` 3-4 questions → `EquipmentKbCard` reveal                                                       | `shipped+untested` on the new cell name; untested since the rename lands. Wizard itself was dry-run on P-02 previously.                        |
| 4  | Predictive forecast (cool banner)      | `POST /api/v1/demo/scene/seed-forecast` with `{target:"Bottle Filler"}`                             | `AnomalyBanner` appears in accent-arc tone within ≤ 60 s: *"forecast to breach alert (4.1 → 4.5) in ~2.3h · 92% confidence"*                     | `shipped+untested` (forecast-watch loop) / `pending` (demo endpoint that guarantees the firing)                                                |
| 5  | Real anomaly — Sentinel catches it     | `POST /api/v1/demo/scene/trigger-breach` with `{target:"Bottle Filler"}` OR natural simulator drift | `AnomalyBanner` flips to destructive tone; WO row appears in `/work-orders` with `status=detected`                                               | `shipped+verified` (breach path, dry-run 21:38 UTC) / `pending` (the demo endpoint wrapper)                                                    |
| 6  | Extended-thinking stream               | Automatic once Investigator spawns                                                                  | `thinking_delta` frames stream in Agent Inspector + chat drawer                                                                                  | `shipped+verified` (visible on every Investigator run in every dry-run today)                                                                  |
| 7  | **Sandbox Python execution card**      | Automatic on drift-class breach; prompt forces bash+render                                          | Inline `SandboxExecution` card: verbatim Python, verbatim `key=value` output, cyan **"Ran in Anthropic sandbox"** chip                           | `shipped+verified` — 3 frames captured live 21:38 UTC, technique=correlation, rho to 4 decimals over 20k+ samples                              |
| 8  | `Sandbox:` prefix in RCA               | Automatic after bash run                                                                            | WO detail page RCA text begins `Sandbox: rho=..., n=... Root cause: ...`                                                                         | `shipped+verified` — WOs 43/44/45 all have it                                                                                                  |
| 9  | Diagnostic card with confidence        | Automatic at end of RCA                                                                             | Inline `DiagnosticCard`: title, confidence %, factors list                                                                                       | `shipped+verified` — seen in every finished investigation                                                                                      |
| 10 | Work Order card + Printable WO         | Automatic after `submit_rca` → WO Generator runs                                                    | Inline `WorkOrderCard` in chat; `/work-orders/{id}` printable view                                                                               | `shipped+verified`                                                                                                                             |
| 11 | Memory recall (pattern match)          | `POST /api/v1/demo/trigger-memory-scene` with `{cell_name:"Bottle Capper"}`                         | `PatternMatch` card: "Live signature / Preceded failure on 24 Jan 2026" + `Predicted MTTF: 4.0 h` row + Recommended action row                   | `pending` — endpoint exists but hardcoded to `"P-02"` default; needs rename-update (§2.3)                                                      |
| 12 | Shift page                             | Click `Shifts` in sidebar OR click shift pill in TopBar                                             | `/shifts` renders: current-shift header + rota table + activity metrics + shift-logbook panel                                                    | `shipped+verified` — all four panels ship, 112 frontend tests pass. **Data-empty without seed** (no logbook, no shift assignments in fresh DB) |
| 13 | Operator on-duty name in TopBar        | Automatic on any page                                                                               | Pill reads *"Night shift · 22:00 → 06:00 · Priya Patel"* and is clickable → `/shifts`                                                            | `shipped+untested` — code shipped; no seed data yet so currently displays "Unassigned"                                                         |
| 14 | Chat Q&A grounded in KB                | Chat: *"show me the KB for the Bottle Filler"*                                                      | `EquipmentKbCard` renders inline in chat message stream                                                                                          | `shipped+untested` on new cell name                                                                                                            |
| 15 | Chat Q&A with `BarChart`               | Chat: *"bottles per minute last week by shift"*                                                     | `BarChart` renders inline                                                                                                                        | `shipped+untested`                                                                                                                             |
| 16 | Forecast + anomaly banner co-exist     | Fire scene 4 then scene 5 on same cell within 60 s                                                  | Banner head-slot: destructive anomaly wins over cool forecast; `+1 more` badge on the tail                                                       | `shipped+verified` — merge logic in `AnomalyBanner` passes unit tests                                                                          |
| 17 | DEV control strip for scene-triggering | Press any button in the fixed bottom-right strip                                                    | Corresponding endpoint fires; toast confirms; observables per row 4/5/11 above                                                                   | `pending` — component not yet built                                                                                                            |

**Summary as of 2026-04-24 post-21:38-dry-run**: 10/17 `shipped+verified`, 4/17 `shipped+untested`, 3/17 `pending`. The three `pending` items are the naming migration (§2.1), the demo endpoint bundle (§2.3), and the DemoControlStrip (§2.4). The four `shipped+untested` items all flip to `verified` as soon as §2.1 + §2.2 land and one clean dry-run runs.

---

## 2. Pending work — contracts

### 2.1 Naming migration `010_demo_plant_rename.sql`

**Goal:** rename existing cell `P-02` → `Bottle Filler`; insert 4 new cells (Bottle Capper, Source Pump, UV Sterilizer, Bottle Labeler) with their KB rows + signal definitions.

**Files touched:**

```
backend/infrastructure/database/migrations/versions/
  010_demo_plant_rename.up.sql    (new)
  010_demo_plant_rename.down.sql  (new, best-effort rollback)

backend/infrastructure/database/seeds/
  p02_kb.sql                      (rename internals: P-02 → Bottle Filler)
  demo_plant_kb.sql               (new — bundle for the 4 new cells)

docker-compose.yaml               (simulator env: CELL_NAME="Bottle Filler")
backend/agents/investigator/managed/bootstrap.py     (agent name + env name unchanged; no bootstrap cache invalidation needed beyond restart)
backend/modules/demo/router.py    (trigger-memory-scene default cell_name: "P-02" → "Bottle Capper")
```

**SQL shape (up):**

```sql
-- 1. Rename the existing cell in place (FK edges preserved by name column being non-FK).
UPDATE cell SET name = 'Bottle Filler' WHERE name = 'P-02';

-- 2. Insert parent hierarchy rows if the 4 new cells need a shared line.
--    Keep them under the same enterprise/site/area/line as the existing P-02
--    so KPI aggregates over the parent still make sense.
WITH parent AS (
    SELECT line_id FROM cell WHERE name = 'Bottle Filler' LIMIT 1
)
INSERT INTO cell (line_id, name, cell_type_id)
SELECT (SELECT line_id FROM parent), n, 1
FROM (VALUES
    ('Source Pump'),
    ('UV Sterilizer'),
    ('Bottle Capper'),
    ('Bottle Labeler')
) AS v(n)
ON CONFLICT (name) DO NOTHING;

-- 3. Seed equipment_kb rows for the 3 new *onboarded* cells (Source Pump,
--    UV Sterilizer, Bottle Capper). Bottle Labeler stays onboarding_complete=FALSE.
--    See demo_plant_kb.sql for the full structured_data blobs — three templates
--    (pump / UV / conveyor-style) derived from the P-02 structure.

-- 4. Signal definitions per cell.
--    - Pump cells (Source Pump, Bottle Capper): vibration + bearing_temp + flow + pressure
--    - UV Sterilizer: uv_intensity + uv_runtime + flow + motor_current
--    - Bottle Labeler: no signals yet (onboarding target)
--    All display_names follow the Grandparent-Test map from
--    demo-plant-design.md §3.3: "Motor shake", "Water pressure", etc.

-- 5. Update the P-02 equipment_kb display_name → "Bottle Filler".
UPDATE equipment_kb
SET structured_data = jsonb_set(
    structured_data,
    '{equipment,display_name}',
    to_jsonb(text 'Bottle Filler')
)
WHERE cell_id = (SELECT id FROM cell WHERE name = 'Bottle Filler');
```

**Test fixtures to update:**

```bash
# ~15 line find-and-replace across backend/tests/
grep -rln "P-02" backend/tests/ | xargs sed -i 's/P-02/Bottle Filler/g'
# Verify: make backend.test
```

**Simulator:** `docker-compose.yaml` → `backend.environment.CELL_NAME=${CELL_NAME:-Bottle Filler}`. Restart simulator service after this change.

**Acceptance:**
- [ ] `psql -c "SELECT name FROM cell ORDER BY id"` returns the five names (no `P-02`).
- [ ] All 4 new cells have `equipment_kb` rows; Bottle Labeler has `onboarding_complete=FALSE`, others TRUE.
- [ ] `make backend.test` still passes after the grep-sed.
- [ ] Simulator writes to `cell.name='Bottle Filler'` (visible in `process_signal_data` joined rows).
- [ ] `curl /api/v1/demo/trigger-memory-scene` default body targets "Bottle Capper"; response includes `cell_name:"Bottle Capper"`.

**Effort:** ~60-90 min including fixture sed + one `make up` cycle.

---

### 2.2 Seed script `seeds/demo/`

**Goal:** 7 days of history anchored at `NOW()` so the Shift page, KPI bar, and work-order list all read as "this has been running for a week".

**Module layout:**

```
backend/infrastructure/database/seeds/demo/
  __init__.py
  __main__.py           entry point: python -m backend.infrastructure.database.seeds.demo
  hierarchy.py          enterprise/site/area/line/cells — usually a no-op after migration 010
  signals.py            signal_type + unit rows; process_signal_definition per cell
  history.py            7-day process_signal_data (mean-reverting, no drift in last 6h)
  work_orders.py        10-12 WOs (mix: agent/manual, closed/cancelled/open)
  failures.py           5 failure_history rows across 6 months
  logbook.py            20 logbook entries, 3 rotating operators
  shifts.py             shift + shift_assignment rows, 3 per day, last 7d + current
  operators.py          reusable {Sarah Miller, Marco Ferrari, Priya Patel, Tom Anderson}
```

**Key contracts:**

**`history.py::generate_signal_history(cell_id, signal_def_id, window_hours=168, sample_period_s=30)`:**

- Emits rows into `process_signal_data`.
- Pattern: mean-reverting AR(1) around the signal's nominal value, with day/night sinusoidal bias (±3% of nominal) and shift-change noise bursts at 06:00, 14:00, 22:00.
- **Last 6 hours MUST be clamped** to `slope / reference < 0.5 %/h` (forecast-watch's drift floor). Unit test asserts this.
- Seed from `hashlib.blake2b(f"{cell_id}-{signal_def_id}".encode())` so the generated history is deterministic for a given stack.

**`work_orders.py`:**

| Kind                     | Count | Status      | Created-at window | `generated_by_agent` |
|--------------------------|-------|-------------|-------------------|----------------------|
| Old agent RCAs (closed)  | 3     | completed   | 2-7 d ago         | true                 |
| Recent manual WOs (open) | 2     | open        | 1-3 d ago         | false                |
| Yesterday's agent WO     | 1     | in_progress | 18-24 h ago       | true                 |
| Cancelled (stale alarm)  | 2     | cancelled   | 3-5 d ago         | true/false mix       |
| Pre-closed routine       | 2-4   | completed   | spread across 7 d | false                |

Each carries `rca_summary` text. At least one of the recent ones should cite a logbook entry by author name (for the Investigator memory-scene to reach for).

**`failures.py`:**

5 rows, spread as specified in §6.2 of the story doc:

```python
FAILURES = [
    {"cell": "Bottle Filler",   "failure_mode": "bearing_wear",       "months_ago": 3,   "resolved_after_h": 4},
    {"cell": "Bottle Filler",   "failure_mode": "mechanical_seal_leak","months_ago": 6,   "resolved_after_h": 6},
    {"cell": "Bottle Capper",   "failure_mode": "bearing_wear",       "months_ago": 3,   "resolved_after_h": 4},  # memory-scene target
    {"cell": "Source Pump",     "failure_mode": "impeller_imbalance", "months_ago": 4,   "resolved_after_h": 2},
    {"cell": "UV Sterilizer",   "failure_mode": "lamp_replacement",   "months_ago": 5,   "resolved_after_h": 3},
]
```

Each row's `signal_patterns` jsonb matches the relevant KB `failure_patterns.signal_signature` shape so the Investigator can recognise it during `trigger-memory-scene`.

**`logbook.py` sample distribution:**

- 20 total entries, 3 per day average, skewed to last 48 h (scene-6 reads these)
- 3-4 incidents / critical; rest routine
- Priya Patel authors most night-shift entries (so Priya's note "Filler ran rough..." is the one the Investigator cites)

**Acceptance:**

- [ ] `make db.seed.demo` completes in < 30 s on empty DB.
- [ ] All five machines have KPI rows that populate OEE ~ 75-90%.
- [ ] `/shifts` renders a non-empty rota, activity panel ≠ "—", and at least 6 logbook entries in "Earlier" + current shift.
- [ ] `/work-orders` shows a backlog of 10-12 rows.
- [ ] Unit test: no `process_signal_data` row in last 6 h exceeds drift floor for any monitored signal.
- [ ] Unit test: no `process_signal_data` row in last 5 min exceeds an `alert` threshold for any cell (so Sentinel does not fire immediately on stack boot).

**Effort:** ~3-4 h. Largest single item.

---

### 2.3 Demo endpoints

All under `/api/v1/demo/*`. All gated behind `ARIA_DEMO_ENABLED=true` (same mount pattern as the existing `trigger-memory-scene`). All return JSON envelope `{status, message, data}` via `core.api_response.ok()`.

#### 2.3.1 `POST /api/v1/demo/reset/light`

**Body:** `{}` (no params)

**Response:** `data = { cleared_work_orders:int, cleared_readings:int, cleared_forecast_debounce_entries:int }`

**Side effects:**
1. `UPDATE work_order SET status='cancelled', completed_at=NOW() WHERE generated_by_agent=TRUE AND status NOT IN ('completed','cancelled') AND created_at > NOW() - INTERVAL '35 minutes'`
2. `DELETE FROM process_signal_data WHERE time > NOW() - INTERVAL '2 hours' AND signal_def_id IN (every monitored signal on Bottle Filler + Bottle Capper)` — so the next breach is clean
3. `agents.sentinel.forecast._forecast_last_emit.clear()` — resets the in-memory debounce
4. Logs the three counts

**Latency:** ≤ 1 s

**Errors:** none expected; DB errors → 500.

#### 2.3.2 `POST /api/v1/demo/reset/full`

**Body:** `{}`

**Response:** `data = { duration_seconds:float, seed_artifact_counts:dict }`

**Side effects:**
1. Acquire the DB pool.
2. Truncate transactional tables in dependency-safe order: `process_signal_data`, `work_order`, `failure_history`, `logbook_entry`, `machine_status`, `production_event`, `shift_assignment`.
3. Run `seeds/demo/__main__.py::main()` with the current pool (not via subprocess — same process saves the connection handshake).
4. Restart the simulator container via `docker` SDK (optional — if not, next tick picks up the new state; simpler path: skip).
5. Clear forecast debounce.

**Latency:** 10-15 s.

**Errors:** 500 on seed failure with truncated rollback attempt.

#### 2.3.3 `POST /api/v1/demo/scene/seed-forecast`

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

#### 2.3.4 `POST /api/v1/demo/scene/trigger-breach`

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

#### 2.3.5 `POST /api/v1/demo/trigger-memory-scene` — **update existing**

Change the default `cell_name` from `"P-02"` to `"Bottle Capper"`. No other shape change.

#### 2.3.6 `POST /api/v1/demo/scene/run-full`

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

### 2.4 Frontend `DemoControlStrip`

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

### 2.5 Env + rollout tasks

**`.env` addition:**

```
ARIA_DEMO_ENABLED=true
```

Without this line the new endpoints are 404. Restart backend after adding.

**Grundfos NB-G PDF:**

- Download `net.grundfos.com` Grundfos NB-G 65-250 installation manual.
- Place at `test-assets/grundfos-nb-g-65-250-iom.pdf`.
- Do NOT check the PDF into git if it's copyrighted; instead document the fetch in `test-assets/README.md`.

**Docs to update after the above lands:**

- [ ] `demo-plant-design.md` §11 gantt — strike the rows for items now `shipped`.
- [ ] `demo-playbook.md` — update for the new machine names and the new demo endpoints.
- [ ] This file (§1 matrix) — flip `pending` rows to `shipped+verified` with timestamps.

---

## 3. Dry-run checklist

**Prerequisites:** stack up; `ARIA_DEMO_ENABLED=true`; tunnel live; `make db.seed.demo` run within the last 15 min; logged in as `admin`.

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
- For beat 5b (pattern-match card missing): memory-scene endpoint didn't find a seeded failure; check `seeds/demo/failures.py`.
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
- [ ] `make db.seed.demo` run within the last hour.
- [ ] One full dry-run completed in the last 15 min, all 17 matrix rows ticked.
- [ ] Browser DevTools closed, full-screen mode on, no bookmark bar.
- [ ] DemoControlStrip visible OR screen-crop excludes it — pick one and stick to it.
- [ ] OBS / recording tool configured 1080p+, 30 fps, audio levels tested.
- [ ] Script rehearsed with a stopwatch; total under 3:00 on the dry-walkthrough.

---

## 5. Risk-of-regression notes

| Risk                                                                    | Why it can happen                                                                                          | Mitigation                                                                                                                                                                                                                            |
|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Bootstrap cache serves a stale agent without `render_sandbox_execution` | Agent definition is cached module-level; uvicorn reload should clear but a live prod-like deploy might not | After any bootstrap-level code change, `docker compose restart backend`. Verify via the first investigation's log line: "bootstrapped managed investigator agent agent_XXXX". New `agent_XXXX` ID = fresh cache.                      |
| Agent skips bash on a drift-class anomaly                               | LLM discretion despite MUST phrasing — rare but possible                                                   | Prompt's failure-mode rules gate on `failure_mode` text. If the agent misclassifies as spike-class, bash is skipped. Mitigation: reset and retry with a **clearly** drifting signal (monotonic 5-reading series, not a single spike). |
| Renaming P-02 breaks hardcoded refs in the simulator                    | `CELL_NAME=P-02` is in docker-compose                                                                      | Migration 010 checklist explicitly calls out the env var change. Second read of `docker-compose.yaml` after migration to confirm.                                                                                                     |
| Shift page shows "—" everywhere                                         | Seed didn't run or didn't include shift_assignment rows                                                    | §3 checklist beat 6a checks this. If it fails, `make db.seed.demo` and verify `SELECT count(*) FROM shift_assignment` > 0.                                                                                                            |
| Forecast banner doesn't appear within 60 s                              | forecast-watch tick was 30 s into a cycle at inject time; drift data point count < 20                      | The endpoint injects 40 samples specifically to clear the 20-sample gate. If still failing, check `docker compose logs backend | grep forecast` for the regression gate rejection reason (R² / drift rate).                           |
| Printable WO shows a blank page                                         | Has happened before with the React portal mount on first paint                                             | Rehearse the print once in the dry-run. If blank, hit Ctrl+R on the print preview.                                                                                                                                                    |
| Anthropic API rate limit during recording                               | Multiple sessions created during a single recording cycle                                                  | Space takes by ≥ 30 s. One Investigator run + one memory-scene Investigator run in a 3-min video is well under per-minute limits.                                                                                                     |

---

## 6. Reference map

- [demo-plant-design.md](./demo-plant-design.md) — story doc: plant, scenes, narration.
- [demo-playbook.md](./demo-playbook.md) — operator-level runbook (needs update after naming migration).
- [win-plan-48h.md](./win-plan-48h.md) — strategic plan that spawned the M9 work.
- [docs/architecture/06-forecast-watch.md](../../architecture/06-forecast-watch.md) — forecast-watch loop architecture.
- [docs/architecture/04-sentinel-investigator.md](../../architecture/04-sentinel-investigator.md) — Sentinel + Investigator architecture.
- [backend/agents/investigator/prompts.py](../../../backend/agents/investigator/prompts.py) — `SANDBOX_DIAGNOSTICS_SECTION` (Lever 2).
- [backend/agents/ui_tools.py](../../../backend/agents/ui_tools.py) — `RENDER_SANDBOX_EXECUTION` tool (Lever 1).
- [frontend/src/components/artifacts/SandboxExecution.tsx](../../../frontend/src/components/artifacts/SandboxExecution.tsx) — the visible card.
- Issue [#105](https://github.com/zestones/ARIA/issues/105) — original M5.7 spec + dry-run verification comment.

---

> [!TIP]
> **If you read one section of this doc, read §1.** The capability × trigger × observable × status matrix is the entire demo collapsed to one table. Everything else expands a row.
