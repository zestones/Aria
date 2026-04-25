"""
ARIA — Bottle Capper live scenario.

Steady state with occasional cap-jam spikes on torque. The Capper is the
memory-scene target; its 3-month-old bearing_wear failure_history row is
seeded. Live data stays well below alert during the demo so the Capper
tile reads green at idle — `trigger-memory-scene` injects the spike when
the demo beat fires.
"""

from __future__ import annotations


def build(mode: str = "demo") -> dict:
    if mode not in ("demo", "realtime"):
        raise ValueError(f"Unknown SIMULATOR_MODE='{mode}'. Expected: realtime, demo")

    transitions = (
        {
            "stop": {"run": 0.30, "fault": 0.0},
            "run": {"stop": 0.0003, "fault": 0.0002, "pause": 0.0005},
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
            "good_rate": 0.95,
            # Capper bias — CAP_DEFECT (3) leads, OUT_OF_SPEC (1) and
            # BOTTLE_DAMAGE (5) trail.
            "quality_bad_codes": [3, 3, 3, 1, 5],
        },
        "signals": [
            {
                "name": "capper_vibration",
                "setpoint": 1.8,
                "noise": 0.06,
                "unit": "mm/s",
                "on_stop": {"mode": "decay_to", "target": 0.3, "rate": 0.05},
                "fault_trigger": {"above": 6.5, "fault_code": 3},
            },
            {
                "name": "capper_torque",
                "setpoint": 3.5,
                "noise": 0.08,
                "unit": "Nm",
                "on_stop": {"mode": "decay_to", "target": 0.0, "rate": 0.1},
            },
            {
                "name": "capper_motor_current",
                "setpoint": 4.1,
                "noise": 0.12,
                "unit": "A",
                "on_stop": {"mode": "zero"},
                "fault_trigger": {"above": 7.5, "fault_code": 2},
            },
            {
                "name": "capper_jam_rate",
                "setpoint": 0.2,
                "noise": 0.05,
                "unit": "/h",
                "on_stop": {"mode": "zero"},
            },
        ],
        # Capper produces one piece per cycle — use probabilistic mode
        # since the cycle-time accumulator approach doesn't fit a torque/jam
        # signal. ~6 % chance per second ≈ one bottle every ~17 s ≈ 210/hr.
        "production": {
            "mode": "probabilistic",
            "cycle_chance": 0.06,
            "good_rate": 0.95,
            "quality_bad_codes": [3, 3, 3, 1, 5],
        },
    }
