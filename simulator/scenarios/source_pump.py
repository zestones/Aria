"""
ARIA — Source Pump live scenario.

Mostly steady state — the Source Pump is the upstream feed and rarely
breaches in the demo. Vibration drifts only very slowly (so forecast-watch
won't fire on this cell during a take), and the only fault path is the
flow-drop seal-leak signature. Quality bad codes lean on OUT_OF_SPEC.
"""

from __future__ import annotations


def build(mode: str = "demo") -> dict:
    if mode not in ("demo", "realtime"):
        raise ValueError(f"Unknown SIMULATOR_MODE='{mode}'. Expected: realtime, demo")

    transitions = (
        {
            "stop": {"run": 0.30, "fault": 0.0},
            "run": {"stop": 0.0003, "fault": 0.00015, "pause": 0.0005},
            "fault": {"stop": 0.05},
            "pause": {"run": 0.05, "stop": 0.005},
        }
        if mode == "demo"
        else {
            "stop": {"run": 0.015, "fault": 0.0},
            "run": {"stop": 0.0002, "fault": 0.00002, "pause": 0.00008},
            "fault": {"stop": 0.0025},
            "pause": {"run": 0.005, "stop": 0.001},
        }
    )

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
            "good_rate": 0.96,
            # Source Pump bad codes — mostly process out-of-spec.
            "quality_bad_codes": [1, 5],
        },
        # Tag names match signal_tag rows seeded for Source Pump.
        "signals": [
            {
                "name": "pump_motor_current",
                "setpoint": 12.0,
                "noise": 0.30,
                "unit": "A",
                "on_stop": {"mode": "zero"},
                "fault_trigger": {"above": 22.0, "fault_code": 2},
            },
            {
                "name": "pump_discharge_pressure",
                "setpoint": 4.8,
                "noise": 0.08,
                "unit": "bar",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "pump_flow",
                "setpoint": 820.0,
                "noise": 18.0,
                "unit": "L/min",
                "on_stop": {"mode": "zero"},
            },
            {
                "name": "pump_vibration",
                "setpoint": 2.5,
                "noise": 0.10,
                "unit": "mm/s",
                "on_stop": {"mode": "decay_to", "target": 0.4, "rate": 0.05},
                "fault_trigger": {"above": 7.1, "fault_code": 3},
            },
        ],
        "production": {
            "mode": "accumulator",
            "source_signal": "pump_flow",
            "time_unit": "minute",
            "unit_per_count": 1500.0,  # 1 piece per 1500 L pumped
            "good_rate": 0.96,
            "quality_bad_codes": [1, 5],
        },
    }
