"""
ARIA — P-02 FlowTech CP-3200 bearing failure scenario.

Mode behavior:
  - realtime: scenario unfolds over real 72h (drift rate calibrated for 1 tick = 1 s)
  - demo:     scenario unfolds over ~4 minutes wall-clock (240 ticks at 1 s) for live demo

Vibration drift target: 2.2 mm/s (nominal) → 3.4 mm/s (alarm zone) over the scenario.
Bearing temperature follows vibration with a multiplicative factor.
Discharge flow is the production accumulator source (≈ 533 L/min nominal).
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
    """Build the P-02 scenario config for MachineSimulator + SignalSet + ProductionCounter."""
    if mode not in _DRIFT_RATES:
        raise ValueError(f"Unknown SIMULATOR_MODE='{mode}'. Expected: realtime, demo")

    vib_drift_rate = _DRIFT_RATES[mode]

    # Demo mode wants more dramatic events; realtime mimics a real shift profile.
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
            # Status code mapping must match cell_status_mapping in 006_aria_seed_p02.up.sql:
            #   0=STOP, 1=RUN, 2=FAULT:VFD, 3=FAULT:VIB, 4=FAULT:TEMP, 5=PAUSE:LOCAL, 6=PAUSE:MAINT
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
        # Signals (names MUST match signal_tag.tag_name in seed)
        "signals": [
            {
                "name": "vibration_refoulement",
                "setpoint": 2.2,
                "noise": 0.08,
                "unit": "mm/s",
                # Bearing wear: monotonic upward drift while running.
                # Cap raised so the bearing scenario actually breaches the KB
                # ``vibration_mm_s.alert`` (4.5 mm/s) target on its intended
                # signal — demo path: 2.2 → 5.6 mm/s over the run.
                "drift": {
                    "rate_run": vib_drift_rate,
                    "rate_stop": 0.0,
                    "min": 0.0,
                    "max": 3.4,  # cap drift at +3.4 → asymptote 5.6 mm/s
                },
                "on_stop": {"mode": "decay_to", "target": 0.5, "rate": 0.05},
                # Trip vibration above 4.5 mm/s (alarm threshold from KB)
                "fault_trigger": {"above": 4.5, "fault_code": 3},
            },
            {
                "name": "temperature_palier",
                "setpoint": 48.0,
                "noise": 0.4,
                "unit": "°C",
                # Bearing temp correlates with vibration (derived signal).
                # T = vibration × 6 + 35  → 2.2 mm/s ≈ 48 °C, 3.4 mm/s ≈ 55 °C, 4.5 → 62 °C
                "derived_from": {
                    "source": "vibration_refoulement",
                    "factor": 6.0,
                    "offset": 35.0,
                },
                "on_stop": {"mode": "decay_to", "target": 28.0, "rate": 0.02},
                "fault_trigger": {"above": 75.0, "fault_code": 4},
            },
            {
                "name": "debit_refoulement",
                "setpoint": 533.0,
                "noise": 4.5,
                "unit": "L/min",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "pression_refoulement",
                "setpoint": 12.0,
                "noise": 0.2,
                "unit": "bar",
                "on_stop": {"mode": "zero"},
            },
        ],
        # Production: pump produces volume — count 1 piece per ~1000 L pumped.
        "production": {
            "mode": "accumulator",
            "source_signal": "debit_refoulement",
            "time_unit": "minute",  # signal is L/min, so use minutes
            "unit_per_count": 1000.0,  # 1 "piece" = 1 m³ pumped
            "good_rate": 0.985,
            "quality_bad_codes": [1],
        },
    }
