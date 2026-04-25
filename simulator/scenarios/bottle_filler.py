"""
ARIA — Bottle Filler bearing-failure scenario (the demo star).

Mirrors the original P-02 scenario but keyed off the seed's new tag names
(``filler_vibration``, ``filler_bearing_temp``, ``filler_pressure``,
``filler_flow``, ``filler_bpm``). The status / quality code mapping matches
the per-cell rows installed by migration 006_aria_demo_plant.up.sql.

Mode behaviour:
  - realtime: scenario unfolds over real 72 h (drift rate calibrated for 1 tick = 1 s)
  - demo:     scenario unfolds over ~4 minutes wall-clock (240 ticks at 1 s)

Vibration drift target: 2.2 mm/s (nominal) → 5.6 mm/s (asymptote) — well past
the KB ``vibration_mm_s.alert`` (4.5 mm/s) so the live anomaly fires inside
the rehearsal window. Bearing temperature follows vibration via a derived
multiplier; flow is the production accumulator source (~533 L/min nominal);
pressure tracks the duty point; bottles-per-minute echoes the running flow.
"""

from __future__ import annotations

# ── Drift rates (per tick) ────────────────────────────────
# realtime: 72h × 3600s = 259200 ticks  → 1.2 / 259200 ≈ 4.63e-6
# demo:     ~240 ticks                   → 1.2 / 240    ≈ 5.0e-3
_DRIFT_RATES = {
    "realtime": 4.63e-6,
    "demo": 5.0e-3,
}


def build(mode: str = "demo") -> dict:
    """Build the Bottle Filler scenario config for MachineSimulator + SignalSet + ProductionCounter."""
    if mode not in _DRIFT_RATES:
        raise ValueError(f"Unknown SIMULATOR_MODE='{mode}'. Expected: realtime, demo")

    vib_drift_rate = _DRIFT_RATES[mode]

    if mode == "demo":
        transitions = {
            "stop": {"run": 0.30, "fault": 0.0},
            "run": {"stop": 0.0005, "fault": 0.001, "pause": 0.0008},
            "fault": {"stop": 0.05},
            "pause": {"run": 0.05, "stop": 0.005},
        }
    else:
        transitions = {
            "stop": {"run": 0.015, "fault": 0.0},
            "run": {"stop": 0.0003, "fault": 0.00005, "pause": 0.0001},
            "fault": {"stop": 0.0025},
            "pause": {"run": 0.005, "stop": 0.001},
        }

    return {
        "machine": {
            # Status code mapping must match cell_status_mapping in
            # 006_aria_demo_plant.up.sql:
            #   0=STOP, 1=RUN, 2=FAULT:VFD, 3=FAULT:VIB, 4=FAULT:TEMP,
            #   5=PAUSE:LOCAL, 6=PAUSE:MAINT
            "stop_code": 0,
            "run_code": 1,
            "fault_codes": [2, 3, 4],
            "pause_codes": [5, 6],
            "status_codes": {
                "0": {"label": "STOP"},
                "1": {"label": "RUN"},
                "2": {"label": "FAULT:VARIATEUR"},
                "3": {"label": "FAULT:VIBRATION"},
                "4": {"label": "FAULT:TEMPERATURE"},
                "5": {"label": "PAUSE:MODE_LOCAL"},
                "6": {"label": "PAUSE:MAINTENANCE"},
            },
            "transitions": transitions,
            # Quality codes: 0=GOOD, 1=OFF_SPEC
            "good_rate": 0.985,
            "quality_bad_codes": [1],
        },
        # Signal names MUST match signal_tag.tag_name rows seeded for the
        # Bottle Filler cell.
        "signals": [
            {
                "name": "filler_vibration",
                "setpoint": 2.2,
                "noise": 0.08,
                "unit": "mm/s",
                # Bearing wear: monotonic upward drift while running.
                # Cap raised so vibration breaches the KB alert (4.5 mm/s)
                # within the demo run — asymptote 2.2 + 3.4 = 5.6 mm/s.
                "drift": {
                    "rate_run": vib_drift_rate,
                    "rate_stop": 0.0,
                    "min": 0.0,
                    "max": 3.4,
                },
                "on_stop": {"mode": "decay_to", "target": 0.5, "rate": 0.05},
                # Trip vibration above the KB alert threshold.
                "fault_trigger": {"above": 4.5, "fault_code": 3},
            },
            {
                "name": "filler_bearing_temp",
                "setpoint": 48.0,
                "noise": 0.4,
                "unit": "°C",
                # Bearing temp follows vibration — derived signal.
                # T = vibration × 6 + 35  → 2.2 ≈ 48 °C, 4.5 ≈ 62 °C
                "derived_from": {
                    "source": "filler_vibration",
                    "factor": 6.0,
                    "offset": 35.0,
                },
                "on_stop": {"mode": "decay_to", "target": 28.0, "rate": 0.02},
                "fault_trigger": {"above": 75.0, "fault_code": 4},
            },
            {
                "name": "filler_pressure",
                "setpoint": 5.5,
                "noise": 0.05,
                "unit": "bar",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "filler_flow",
                "setpoint": 533.0,
                "noise": 4.5,
                "unit": "L/min",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "filler_bpm",
                "setpoint": 180.0,
                "noise": 1.5,
                "unit": "/min",
                "on_stop": {"mode": "zero"},
            },
        ],
        # Production: count one piece per ~1000 L pumped (≈ 1 m³).
        "production": {
            "mode": "accumulator",
            "source_signal": "filler_flow",
            "time_unit": "minute",
            "unit_per_count": 1000.0,
            "good_rate": 0.985,
            "quality_bad_codes": [1],
        },
    }
