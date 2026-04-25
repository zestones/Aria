# Demo Seed Content

> [!NOTE]
> Companion to [demo-plant-design.md](./demo-plant-design.md) (story) and [demo-build-spec.md](./demo-build-spec.md) (how). **This doc is the literal content** the user's seed SQL / Python needs to populate for the demo to read as lived-in rather than canned.
>
> All timestamps are **relative** (`NOW() - INTERVAL '...'`) so the seed stays fresh across rehearsal days. All IDs are logical references; the user's seed resolves them.

> [!IMPORTANT]
> The user owns the actual seed code (per build spec §2.1). This doc is the **content reference** — 20 specific log entries, 12 specific WOs, 5 specific failures, per-machine signal envelopes. Copy the rows, translate them to whatever seed format you use (raw SQL, `asyncpg.executemany`, SQLAlchemy, etc.). No runtime dependency; nothing imports this.

---

## Table of contents

1. [Cells + equipment KB (content)](#1-cells--equipment-kb-content)
2. [Signal envelopes per machine](#2-signal-envelopes-per-machine)
3. [7-day signal history — shape per signal](#3-7-day-signal-history--shape-per-signal)
4. [Work orders — the 12-row backlog](#4-work-orders--the-12-row-backlog)
5. [Failure history — 5 recognisable rows](#5-failure-history--5-recognisable-rows)
6. [Logbook entries — 20 scripted entries](#6-logbook-entries--20-scripted-entries)
7. [Shift assignments — 7-day rota](#7-shift-assignments--7-day-rota)
8. [Machine-status transitions](#8-machine-status-transitions)
9. [Production events](#9-production-events)

---

## 1. Cells + equipment KB (content)

Five cells. Same parent enterprise / site / area / line (pick any — all five machines sit on one production line).

| # | Cell name | `equipment.equipment_type` | `equipment.manufacturer` | `equipment.model` | `installation_date` | `onboarding_complete` |
|---|---|---|---|---|---|---|
| 1 | Source Pump | `Centrifugal Pump` | `Grundfos` | `CR 64-3-2` | `NOW() - INTERVAL '22 months'` | `TRUE` |
| 2 | UV Sterilizer | `UV Reactor` | `Trojan` | `UV3000Plus` | `NOW() - INTERVAL '14 months'` | `TRUE` |
| 3 | Bottle Filler | `Centrifugal Pump` | `Grundfos` | `CR 32-2` | `NOW() - INTERVAL '18 months'` | `TRUE` |
| 4 | Bottle Capper | `Servo Drive` | `SEW-Eurodrive` | `DRN90L4BE5` | `NOW() - INTERVAL '16 months'` | `TRUE` |
| 5 | Bottle Labeler | `Labeler` | `Krones` | `Contiroll` | `NOW() - INTERVAL '2 months'` | `FALSE` |

**Notes per cell** (`equipment_kb.notes`):
- **Source Pump** — *"Pumps raw water from the well to the pre-treatment tank. 24/7 service."*
- **UV Sterilizer** — *"Kills bacteria and viruses in the incoming water with UV light."*
- **Bottle Filler** — *"Fills empty bottles with clean water. Replaces both bearings on a 12-month PM cycle."*
- **Bottle Capper** — *"Screws caps onto filled bottles. Drive motor replaced 16 months ago."*
- **Bottle Labeler** — *"New machine — not yet onboarded. Upload the IOM PDF to calibrate."*

---

## 2. Signal envelopes per machine

The thresholds land in `equipment_kb.structured_data.thresholds.<kb_threshold_key>`. Shapes follow the existing P-02 KB precedent: `{nominal, alert, trip, unit, source, confidence}` for single-sided bounds, `{nominal, low_alert, high_alert, unit, source, confidence}` for double-sided.

### 2.1 Source Pump

| Signal | `kb_threshold_key` | Display name | Unit | Nominal | Alert | Trip |
|---|---|---|---|---|---|---|
| Motor current | `motor_current_a` | `Motor current` | A | 12.0 | 18.0 | 22.0 |
| Discharge pressure | `pressure_bar` | `Water pressure` | bar | 4.8 | *low_alert* 4.0 / *high_alert* 5.8 | — |
| Flow | `flow_l_min` | `Water flow` | L/min | 820 | *low_alert* 720 / *high_alert* 900 | — |
| Vibration | `vibration_mm_s` | `Motor shake` | mm/s | 2.5 | 4.5 | 7.1 |

### 2.2 UV Sterilizer

| Signal | `kb_threshold_key` | Display name | Unit | Nominal | Alert | Trip |
|---|---|---|---|---|---|---|
| UV intensity | `uv_intensity_mw_cm2` | `UV lamp brightness` | mW/cm² | 28.0 | *low_alert* 22.0 | *low_trip* 18.0 |
| Lamp runtime | `uv_runtime_h` | `UV lamp hours` | h | 4500 | 7500 | 9000 |
| Flow | `flow_l_min` | `Water flow` | L/min | 820 | *low_alert* 720 / *high_alert* 900 | — |
| Motor current (drive) | `motor_current_a` | `Motor current` | A | 3.2 | 5.0 | 6.5 |

### 2.3 Bottle Filler (demo star)

Matches the current P-02 KB. Keep these values stable — the Investigator's numerical outputs cite them verbatim.

| Signal | `kb_threshold_key` | Display name | Unit | Nominal | Alert | Trip |
|---|---|---|---|---|---|---|
| Vibration | `vibration_mm_s` | `Motor shake` | mm/s | 2.2 | 4.5 | 7.1 |
| Bearing temp | `bearing_temp_c` | `Bearing temp` | °C | 48 | 75 | 90 |
| Discharge pressure | `pressure_bar` | `Water pressure` | bar | 5.5 | *low_alert* 4.5 / *high_alert* 6.5 | — |
| Flow | `flow_l_min` | `Water flow` | L/min | 533 | *low_alert* 480 / *high_alert* 580 | — |
| Bottles per minute | `bottles_per_minute` | `Bottles per minute` | /min | 180 | *low_alert* 150 | — |

Bearing geometry (keep in `failure_patterns[0].signal_signature` per §5): `bearing_reference=6206, n_balls=9, pitch_diameter_mm=46.0, ball_diameter_mm=9.5, contact_angle_deg=0, shaft_rpm_nominal=2900`.

### 2.4 Bottle Capper (memory-scene target)

| Signal | `kb_threshold_key` | Display name | Unit | Nominal | Alert | Trip |
|---|---|---|---|---|---|---|
| Drive vibration | `vibration_mm_s` | `Motor shake` | mm/s | 1.8 | 4.2 | 6.5 |
| Cap torque | `cap_torque_nm` | `Cap tightness` | N·m | 3.5 | *low_alert* 2.8 / *high_alert* 4.2 | — |
| Motor current | `motor_current_a` | `Motor current` | A | 4.1 | 6.0 | 7.5 |
| Jam counter (per hour) | `jam_events_per_h` | `Jams per hour` | /h | 0 | 3 | 8 |

Bearing geometry (Capper drive motor — typical 6203 bearing): `bearing_reference=6203, n_balls=8, pitch_diameter_mm=29.0, ball_diameter_mm=6.75, shaft_rpm_nominal=1450`.

### 2.5 Bottle Labeler

**No signal definitions** until the operator onboards it. That is the whole point of the onboarding-wizard scene. Leave this cell's `process_signal_definition` empty; leave `equipment_kb` with `onboarding_complete=FALSE` and minimal `structured_data` (`{equipment: {...}, kb_meta: {onboarding_complete: false, completeness_score: 0.1}}`).

---

## 3. 7-day signal history — shape per signal

Volume target: ~350 000 rows (7 d × 30 s sample period × ~18 monitored signals across 4 cells = ~350 k). Skip the Labeler (no signals).

### 3.1 Generator recipe

For each `(cell_id, signal_def_id)` pair:

```
value(t) = clamp(
    nominal
    + seasonal(t)          # day/night sinusoidal bias
    + ar1_noise(t)         # mean-reverting noise around zero
    + shift_change_pulse(t), # short bump at each shift boundary
    low_bound, high_bound
)
```

**Parameters (per signal class):**

| Parameter | Motor current | Vibration | Pressure | Flow | UV intensity | Bearing temp | Bottles/min | Cap torque |
|---|---|---|---|---|---|---|---|---|
| `seasonal_amplitude` (% of nominal) | 4% | 3% | 2% | 6% | 2% | 5% | 8% | 2% |
| `seasonal_period_h` | 24 | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| `ar1_phi` (mean-reversion) | 0.90 | 0.88 | 0.95 | 0.92 | 0.97 | 0.93 | 0.85 | 0.90 |
| `ar1_sigma` (% of nominal) | 1.5% | 2.5% | 1.0% | 2.0% | 0.5% | 1.5% | 3.0% | 1.5% |
| `shift_change_pulse` (% of nominal, triangular ~5 min) | 2% | 3% | 1% | 3% | 1% | 1% | 4% | 2% |

**Determinism:** seed the RNG from `hashlib.blake2b(f"{cell_id}-{signal_def_id}".encode()).digest()[:16]`. Every `make db.reset` → `make <seed>` pair produces an identical history — critical for reproducible dry-runs.

### 3.2 Mandatory clamp on the last 6 hours

For every monitored signal, **the last 6 h of history must read as `abs(slope) / reference < 0.005/h`** — forecast-watch's drift floor. Enforce via a post-hoc pass:

```
for each (cell, signal):
    last_6h = history[-6h:]
    slope, _ = np.polyfit(hours, last_6h, 1)
    reference = abs(mean(last_6h))
    if abs(slope) / max(1e-6, reference) > 0.005:
        # replace last-6h with pure mean-reverting noise around last_6h.mean()
```

**Without this clamp**, forecast-watch fires on *seeded* drift instead of the drift `seed-forecast` injects — the predictive banner fires immediately on stack boot, which is wrong and also defeats the demo endpoint.

**Unit test** to assert: `SELECT signal_def_id FROM process_signal_data WHERE time > NOW() - INTERVAL '6 hours' GROUP BY signal_def_id HAVING regr_slope(raw_value, extract(epoch from time)/3600) / nullif(abs(avg(raw_value)), 0) > 0.005` must return zero rows.

---

## 4. Work orders — the 12-row backlog

Twelve rows. Mix: closed/cancelled/open, agent/manual, across all four monitored cells. All times are `NOW() - INTERVAL '<X> days'` offsets so the seed stays fresh.

| # | Cell | Created | Status | Priority | Title | Generated by agent | `rca_summary` (short) |
|---|---|---|---|---|---|---|---|
| 1 | Bottle Filler | 6 d 04 h ago | `completed` | high | `Bearing replacement — Filler pump` | TRUE | *"Sandbox: slope_per_hour=0.019, r_squared=0.94, eta_to_trip_hours=3.1. Bearing wear near end-of-life replaced under scheduled PM."* |
| 2 | Source Pump | 5 d 10 h ago | `completed` | medium | `Replace flow sensor calibration drift` | FALSE | *"Operator-initiated recalibration after logbook note from Priya. Field team recalibrated in 40 minutes."* |
| 3 | Bottle Capper | 4 d 18 h ago | `completed` | medium | `Cap torque alarm — reseated jammed cap` | TRUE | *"Sandbox: rho_vibration_cap_torque=0.71, n_samples=14400. Jammed cap cleared; torque returned to nominal within 8 minutes."* |
| 4 | UV Sterilizer | 3 d 22 h ago | `completed` | low | `Lamp hours exceeded 7500 — replace scheduled` | TRUE | *"UV lamp approaching end of rated life; not an immediate failure. Replacement deferred to next planned maintenance window."* |
| 5 | Bottle Filler | 3 d 05 h ago | `cancelled` | medium | `False alarm — anti-surge valve cycled` | TRUE | *"Transient pressure spike traced to a downstream valve cycle, not the Filler. Cancelled without action."* |
| 6 | Source Pump | 2 d 14 h ago | `completed` | high | `Seal replacement after flow drop` | FALSE | *"Manual flag from operator — mechanical seal showed wet trace. Replaced seal kit and verified normal flow."* |
| 7 | Bottle Capper | 2 d 02 h ago | `completed` | low | `Routine — change-over between cap sizes` | FALSE | *"Line change-over from 500 ml to 1.5 L caps. 30 min. No incident."* |
| 8 | Bottle Filler | 1 d 09 h ago | `completed` | medium | `Vibration nudge — recentred impeller` | TRUE | *"Sandbox: slope_per_hour=0.008, r_squared=0.62, eta_to_trip_hours=18.4. Mild vibration uptrend; preventive impeller re-centring."* |
| 9 | UV Sterilizer | 1 d 05 h ago | `open` | medium | `Replace UV lamp 2 of 4` | FALSE | *"Scheduled replacement — lamp #2 at 7800 hours. Field team arrives 09:00 tomorrow."* |
| 10 | Source Pump | 1 d 02 h ago | `open` | low | `Visual inspection — scheduled quarterly` | FALSE | *"Walk-around + bolt torque check. Due Friday."* |
| 11 | Bottle Filler | 20 h ago | `cancelled` | high | `Spurious alarm — clock skew on simulator?` | TRUE | *"Threshold breach flagged during a sampling gap. Investigator found no physical evidence. Cancelled pending review."* |
| 12 | Bottle Capper | 14 h ago | `in_progress` | medium | `Torque drift — bench-test spindle` | FALSE | *"Night-shift observed intermittent torque variance. Day-shift technician running bench test."* |

**Populated fields per WO** (beyond the table above):
- `triggered_by_signal_def_id` — for agent-generated rows (#1, 3, 4, 5, 8, 11), set to the cell's vibration or pressure `signal_def.id`; for manual rows (#2, 6, 7, 9, 10, 12) leave `NULL`.
- `completed_at` — set for `completed`/`cancelled` rows only, `created_at + INTERVAL '<duration>'` with realistic durations (30 min-5 h).
- `recommended_actions` — a ~3-item JSON array of short strings (e.g. `["Replace upper bearing", "Verify alignment", "Re-torque coupling bolts"]`). Keep it plausibly-pump-ish for rows 1/3/5/6/8/11; routine for the rest.
- `created_by` — operator username for manual rows (rotate through `sarah.miller`, `marco.ferrari`, `priya.patel`); leave `NULL` for agent-generated rows.

**Constraint check**: **no WO must have `status IN ('detected', 'analyzed', 'open', 'in_progress')` on the Bottle Filler's vibration signal at seed time**, or Sentinel's 30-min per-(cell, signal) debounce will swallow the first demo anomaly. WO #12 is on the Capper's *torque* drive, not vibration, so it's safe.

---

## 5. Failure history — 5 recognisable rows

Five rows spread across six months. Each row carries a `signal_patterns` jsonb the Investigator's memory-scene matches against.

| # | Cell | `failure_time` | `resolved_time` | `failure_mode` | `root_cause` | `signal_patterns` |
|---|---|---|---|---|---|---|
| 1 | Bottle Filler | `NOW() - INTERVAL '3 months'` | `+ INTERVAL '4 hours'` | `bearing_wear` | *"Discharge bearing wear near end-of-life — replaced under PM-2026-01-18."* | `{"vibration_mm_s": {"peak": 5.4, "duration_min": 14, "slope_per_hour": 0.024}, "bearing_temp_c": {"peak": 78, "slope_per_hour": 0.4}}` |
| 2 | Bottle Filler | `NOW() - INTERVAL '6 months'` | `+ INTERVAL '6 hours'` | `mechanical_seal_leak` | *"Seal face wear; replaced mechanical seal kit and flushed seal chamber."* | `{"flow_l_min": {"drop_from": 533, "drop_to": 488}, "pressure_bar": {"oscillation_amplitude": 0.6}}` |
| 3 | Bottle Capper | `NOW() - INTERVAL '3 months'` | `+ INTERVAL '4 hours'` | `bearing_wear` | *"Drive bearing replaced. Same pattern as Filler's Jan incident — both pump-side rotating kit."* | `{"vibration_mm_s": {"peak": 4.8, "duration_min": 22, "slope_per_hour": 0.018}, "cap_torque_nm": {"rho_with_vibration": 0.71}}` |
| 4 | Source Pump | `NOW() - INTERVAL '4 months'` | `+ INTERVAL '2 hours'` | `impeller_imbalance` | *"Cavitation damage on impeller vanes; inspected and re-balanced, no replacement."* | `{"vibration_mm_s": {"spike_peak": 5.2, "return_to_nominal_min": 3}}` |
| 5 | UV Sterilizer | `NOW() - INTERVAL '5 months'` | `+ INTERVAL '3 hours'` | `lamp_replacement` | *"UV lamp #3 reached end-of-life. Replaced with Trojan P/N UV3K-LAMP-440W; all 4 banks verified."* | `{"uv_intensity_mw_cm2": {"drop_from": 28, "drop_to": 19}, "uv_runtime_h": {"at_failure": 7640}}` |

**Why row 3 specifically:**
The memory-scene beat narrates *"ARIA saw this exact pattern on the Capper in January."* Row 3's `failure_time = NOW() - 3 months` anchored to today means it reads as "roughly January" whenever the demo runs — adjust the interval if your recording date is already far from April (e.g. on a July demo, use `NOW() - INTERVAL '5 months'`). The `signal_patterns` dict must reference both vibration AND a coupled signal (torque) so the Investigator's coupling-class rule fires.

---

## 6. Logbook entries — 20 scripted entries

All times relative to `NOW()`. Rotate authors through `sarah.miller` (day), `marco.ferrari` (evening), `priya.patel` (night), `tom.anderson` (supervisor, occasional).

| # | `entry_time` | Cell | `author_username` | `category` | `severity` | Content |
|---|---|---|---|---|---|---|
| 1 | `NOW() - 6 d 22 h` | Bottle Filler | sarah.miller | `observation` | info | *"Quiet morning. Filler humming along. Bottles per minute holding at 180."* |
| 2 | `NOW() - 6 d 14 h` | UV Sterilizer | marco.ferrari | `maintenance` | info | *"Lamp #2 runtime counter reset after PM. Back to zero. All four lamps confirmed lit."* |
| 3 | `NOW() - 5 d 20 h` | Source Pump | priya.patel | `observation` | warning | *"Flow dropped briefly (~720 L/min) around 02:30, recovered in 90 seconds. Logged just in case."* |
| 4 | `NOW() - 5 d 10 h` | Source Pump | sarah.miller | `incident` | warning | *"Reached 02:30 note — field tech recalibrated upstream flow sensor (drift ~4%). Back to spec."* |
| 5 | `NOW() - 4 d 21 h` | Bottle Capper | priya.patel | `incident` | warning | *"Cap jam at 04:10, resolved 04:18. Usual suspect — cap rim deformity. Two bottles rejected."* |
| 6 | `NOW() - 4 d 14 h` | UV Sterilizer | marco.ferrari | `observation` | info | *"UV intensity across all four banks inside green band. No action."* |
| 7 | `NOW() - 3 d 23 h` | Bottle Filler | priya.patel | `observation` | info | *"Filler a bit noisier than usual around 03:00. Not above the limit, just noticing. Probably nothing."* |
| 8 | `NOW() - 3 d 15 h` | UV Sterilizer | tom.anderson | `maintenance` | info | *"Planned — lamp #1 runtime 7500h alarm. Scheduled replacement for next Wednesday."* |
| 9 | `NOW() - 3 d 05 h` | Bottle Filler | sarah.miller | `incident` | warning | *"Transient pressure spike, 6.8 bar for 4 seconds. ARIA flagged. Cancelled after no correlation with downstream."* |
| 10 | `NOW() - 2 d 16 h` | Source Pump | sarah.miller | `incident` | critical | *"Seal leak — water trace on the mechanical seal housing. Called field. Seal replaced in 2 hours."* |
| 11 | `NOW() - 2 d 11 h` | Bottle Capper | marco.ferrari | `changeover` | info | *"Line change-over 500 ml → 1.5 L caps. Capper torque spec updated from 3.5 to 4.1 N·m. 30 min downtime."* |
| 12 | `NOW() - 1 d 22 h` | Bottle Filler | priya.patel | `observation` | warning | *"Filler ran rough for about ten minutes after shift change. Sounded like a pulley. Settled on its own. Will watch next shift."* |
| 13 | `NOW() - 1 d 20 h` | Bottle Filler | priya.patel | `incident` | warning | *"Vibration uptrend continues. ARIA opened a WO. Scheduling impeller re-centre for next maintenance window."* |
| 14 | `NOW() - 1 d 13 h` | UV Sterilizer | sarah.miller | `maintenance` | info | *"Verified lamp #2 runtime still under 7900. Holding for Wednesday."* |
| 15 | `NOW() - 1 d 06 h` | Bottle Capper | marco.ferrari | `observation` | info | *"Line running clean at 180 bpm. No jams past two shifts."* |
| 16 | `NOW() - 18 h` | Source Pump | priya.patel | `observation` | info | *"Nothing to report from the pump — steady flow."* |
| 17 | `NOW() - 14 h` | Bottle Capper | priya.patel | `incident` | warning | *"Torque readout bouncing between 3.2 and 3.9 N·m. No audible jam. Will run a bench test on the spindle day-shift."* |
| 18 | `NOW() - 10 h` | Bottle Capper | sarah.miller | `maintenance` | info | *"Bench test on capper spindle started. Running baseline for 2h then loading."* |
| 19 | `NOW() - 5 h` | Bottle Filler | sarah.miller | `observation` | info | *"Filler motor shake back to ~3.1 mm/s after the impeller nudge. Feels right."* |
| 20 | `NOW() - 2 h` | UV Sterilizer | sarah.miller | `observation` | info | *"Pre-replacement check on lamp #2 — intensity 27.8 mW/cm². Holding steady."* |

**Plot-thread entries** (12 → 13 → 19) lay down the Filler story that row 1's RCA + row 12/13 logbook + row 19 post-action check all triangulate on. The Investigator's memory-scene narration can cite **entry 12 by author and timestamp** — *"Priya's note at 02:15 flagged the Filler running rough…"*.

---

## 7. Shift assignments — 7-day rota

21 rows (7 days × 3 shifts). Plus one extra for the current shift anchor.

**Rotation rule** (A-B-C pattern with weekends running the same):

| Day offset | Day shift (06-14) | Evening (14-22) | Night (22-06) |
|---|---|---|---|
| -6 d | Sarah Miller | Marco Ferrari | Priya Patel |
| -5 d | Sarah Miller | Marco Ferrari | Priya Patel |
| -4 d | Sarah Miller | Marco Ferrari | Priya Patel |
| -3 d | Sarah Miller | Marco Ferrari | Priya Patel |
| -2 d | Sarah Miller | Marco Ferrari | Priya Patel |
| -1 d | Sarah Miller | Marco Ferrari | Priya Patel |
| today | Sarah Miller | Marco Ferrari | **Priya Patel** ← current shift at demo time |

> [!NOTE]
> The rota is deliberately not rotated. Keeping the same operator on the same shift every day makes the memory-scene pronoun ("**Priya** was on the night shift…") work regardless of what time the demo runs — a rotating rota would force the narration to branch on the calendar date.

Tom Anderson is the **supervisor**. He is NOT in `shift_assignment` rows (that table is for on-shift operators). Instead, he appears as `created_by` on a couple of manual WOs (#8 in §4, for example) and in one logbook entry (#8 in §6). The Shift page's header can show him as `"Supervisor on call: Tom Anderson"` if desired; that string is a presentation-layer decision, not a table row.

**Shift table** (if not already seeded): 3 rows — `Day`/`Evening`/`Night` with `start_time`/`end_time` `06:00-14:00`, `14:00-22:00`, `22:00-06:00`.

---

## 8. Machine-status transitions

One maintenance window per machine in the last 7 d, plus a couple of transient faults to break up the monotony. Shape: rows in `machine_status` with `{cell_id, time, state_code}`. Typical states: `running`, `maintenance`, `fault`, `changeover`.

| Cell | When | State | Duration | Why |
|---|---|---|---|---|
| Source Pump | ~5 d 10 h ago | `fault → running` | 40 min | Flow sensor recalibration (from WO #2 + logbook #4) |
| Source Pump | ~2 d 14 h ago | `fault → maintenance → running` | 2 h 15 min | Seal replacement (WO #6) |
| UV Sterilizer | ~3 d 15 h ago | `running` | — | Tom's note about scheduled lamp swap — no downtime yet |
| Bottle Filler | ~6 d 04 h ago | `maintenance → running` | 4 h | Bearing PM (WO #1) |
| Bottle Filler | ~1 d 09 h ago | `running` | — | Impeller nudge (WO #8); no state change, runtime work |
| Bottle Capper | ~4 d 18 h ago | `fault → running` | 8 min | Cap jam (WO #3 + logbook #5) |
| Bottle Capper | ~2 d 11 h ago | `changeover → running` | 30 min | 500 ml → 1.5 L change-over (WO #7 + logbook #11) |
| Bottle Capper | ~10 h ago | `running` | — | Bench test, still on spindle; line kept running on spare spindle |

All other time: `running`. Generating these is a matter of emitting one `machine_status` row at each transition boundary.

---

## 9. Production events

Target: ~2 000 rows in `production_event` across the 7-day window, distributed realistically so OEE computation reads healthy.

**Distribution per monitored cell:**

| Cell | Events/shift (avg) | Typical event types |
|---|---|---|
| Source Pump | 10 | `run_hour` (1/h) + occasional `low_flow_transient` |
| UV Sterilizer | 6 | `run_hour` + `lamp_hour_tick` (each hour) |
| Bottle Filler | 25 | `bottle_batch` (300 bottles) every ~8 min, + `changeover_complete` |
| Bottle Capper | 25 | `bottle_batch` (300 bottles) every ~8 min (mirrors Filler), + occasional `jam_clear` |

**Yield/quality target** aggregating across the 7 days:
- ~55 000 bottles produced total (realistic for a 5-machine bottling line running 24/7)
- 99.3% first-pass yield (380 rejected bottles logged as `quality_fail`)
- OEE computation ends up around 78-85% depending on how the user's KPI query weights availability vs performance vs quality

**Correlation with WO downtimes**: during the Source Pump seal incident (~2 d 14 h ago, 2 h 15 min), the whole line stopped (no bottles produced downstream). Tag those 2 rows in `production_event` as `line_halt_due_to_upstream`. Without this correlation the KPI chart will show bottles being produced during a documented outage — sharp-eyed judge could spot it.

---

## 10. Final integrity checks

Before declaring the seed "done", run these SQL assertions. Each one catches a specific failure mode I've seen hurt demos:

| Check | Query (schematic) | Expected |
|---|---|---|
| No current-tense breach | `SELECT count(*) FROM process_signal_data psd JOIN process_signal_definition psd_def ON psd_def.id=psd.signal_def_id JOIN equipment_kb k ON k.cell_id=psd_def.cell_id WHERE psd.time > NOW() - INTERVAL '5 min' AND raw_value > (k.structured_data -> 'thresholds' -> psd_def.kb_threshold_key ->> 'alert')::float` | `0` |
| No debounce-blocking WO on Filler vibration | `SELECT count(*) FROM work_order w WHERE cell_id=<filler_id> AND triggered_by_signal_def_id=<filler_vib_id> AND status NOT IN ('completed','cancelled') AND created_at > NOW() - INTERVAL '35 min'` | `0` |
| No drift in last 6h (all signals) | see §3.2 for exact query | `0 rows` |
| Shift assignments cover current time | `SELECT count(*) FROM shift_assignment WHERE assigned_date = CURRENT_DATE` | `3` (one per shift) |
| Memory-scene target has a 3-month-old failure | `SELECT failure_mode FROM failure_history WHERE cell_id=<capper_id> AND failure_time BETWEEN NOW() - INTERVAL '4 months' AND NOW() - INTERVAL '2 months'` | `'bearing_wear'` |
| KPI query returns a non-null number | `SELECT oee FROM kpi_oee_view WHERE cell_id=<filler_id>` (adapt to actual view name) | not null, in [0,1] |

A single failure here means the demo fails in a specific rehearsal-visible way. Fix at seed time, not at rehearsal time.

---

## 11. How to use this doc

1. Read §1-§9 once.
2. Translate each table into your seed's native format (raw SQL / `asyncpg.executemany` / SQLAlchemy / whatever).
3. Run `make db.reset && make <your-seed-target>`.
4. Run the §10 integrity checks. Fix any failures.
5. Proceed to dry-run per `demo-build-spec.md §3`.

Nothing in this doc is imported or consumed at runtime — it is a content reference you translate once and forget.

---

> [!TIP]
> The two most demo-visible pieces are **logbook entry #12** (Priya's "Filler ran rough" note, which the Investigator's memory-scene narration cites by author + timestamp) and **failure_history row #3** (the Capper's 3-month-old bearing-wear pattern that the memory-scene PatternMatch card renders against). If you short-change any row, short-change the `production_event` rows, never these two.
