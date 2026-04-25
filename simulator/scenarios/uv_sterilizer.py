"""
ARIA — UV Sterilizer live scenario.

Steady state with a slow downward drift on UV intensity (lamp aging).
Runtime ticks up monotonically; the seeded baseline is ~4500 h so the
demo-day reading lives well below the 7500 h alert. Quality bad codes
lean on OUT_OF_SPEC (intensity dip translates to non-conformant UV dose).
"""

from __future__ import annotations


def build(mode: str = "demo") -> dict:
    if mode not in ("demo", "realtime"):
        raise ValueError(f"Unknown SIMULATOR_MODE='{mode}'. Expected: realtime, demo")

    transitions = (
        {
            "stop": {"run": 0.30, "fault": 0.0},
            "run": {"stop": 0.0002, "fault": 0.0001, "pause": 0.0003},
            "fault": {"stop": 0.05},
            "pause": {"run": 0.05, "stop": 0.005},
        }
        if mode == "demo"
        else {
            "stop": {"run": 0.015, "fault": 0.0},
            "run": {"stop": 0.0002, "fault": 0.00001, "pause": 0.00005},
            "fault": {"stop": 0.0025},
            "pause": {"run": 0.005, "stop": 0.001},
        }
    )

    # UV intensity drift — extremely slow, mimics lamp aging. Asymptote
    # 28 - 0.4 = 27.6 mW/cm2, comfortably above the 22 low-alert.
    intensity_drift = -1.0e-4 if mode == "demo" else -2.5e-7

    return {
        "machine": {
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
            "good_rate": 0.97,
            "quality_bad_codes": [1, 5],
        },
        "signals": [
            {
                "name": "uv_intensity",
                "setpoint": 28.0,
                "noise": 0.35,
                "unit": "mW/cm2",
                "drift": {
                    "rate_run": intensity_drift,
                    "rate_stop": 0.0,
                    "min": -0.5,
                    "max": 0.0,
                },
                "on_stop": {"mode": "decay_to", "target": 0.0, "rate": 0.1},
            },
            {
                "name": "uv_runtime",
                # Constant baseline; the live increment is small relative to
                # the ~4500 h baseline so we just emit the baseline + jitter.
                "setpoint": 4500.0,
                "noise": 0.0,
                "unit": "h",
                "on_stop": {"mode": "decay_to", "target": 4500.0, "rate": 0.0},
            },
            {
                "name": "uv_flow",
                "setpoint": 820.0,
                "noise": 18.0,
                "unit": "L/min",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "uv_motor_current",
                "setpoint": 3.2,
                "noise": 0.10,
                "unit": "A",
                "on_stop": {"mode": "zero"},
                "fault_trigger": {"above": 6.5, "fault_code": 2},
            },
        ],
        "production": {
            "mode": "accumulator",
            "source_signal": "uv_flow",
            "time_unit": "minute",
            "unit_per_count": 1500.0,
            "good_rate": 0.97,
            "quality_bad_codes": [1, 5],
        },
    }
