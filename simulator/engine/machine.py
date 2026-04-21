"""
Config-driven Markov-chain state machine for industrial equipment simulation.

All domain knowledge (status codes, transitions, fault codes, quality codes)
is loaded from config — zero hardcoded constants.
"""

from __future__ import annotations

import logging
import random
from typing import Any

log = logging.getLogger("aria.simulator.engine")

# ── Macro states (internal, not PLC codes) ───────────────
MACRO_STOP = 0
MACRO_RUN = 1
MACRO_FAULT = 2
MACRO_PAUSE = 3

_MACRO_NAMES: dict[str, int] = {
    "stop": MACRO_STOP,
    "run": MACRO_RUN,
    "fault": MACRO_FAULT,
    "pause": MACRO_PAUSE,
}

_MACRO_LABELS: dict[int, str] = {v: k.upper() for k, v in _MACRO_NAMES.items()}


def _parse_transitions(
    raw: dict[str, dict[str, float]],
) -> dict[int, list[tuple[int, float]]]:
    """Convert config transitions to internal format.

    Accepts named keys ("stop", "run", "fault", "pause"):
        { "stop": { "run": 0.015 }, "run": { "stop": 0.0003, "fault": 0.0002 } }

    Returns: { macro_int: [(target_macro_int, probability), ...] }
    """
    result: dict[int, list[tuple[int, float]]] = {}
    for from_key, targets in raw.items():
        from_state = _MACRO_NAMES.get(from_key)
        if from_state is None:
            raise ValueError(
                f"Unknown macro state '{from_key}'. "
                f"Expected one of: {', '.join(_MACRO_NAMES)}"
            )
        pairs: list[tuple[int, float]] = []
        for to_key, prob in targets.items():
            to_state = _MACRO_NAMES.get(to_key)
            if to_state is None:
                raise ValueError(
                    f"Unknown macro state '{to_key}' in transitions['{from_key}']. "
                    f"Expected one of: {', '.join(_MACRO_NAMES)}"
                )
            if not (0.0 <= prob <= 1.0):
                raise ValueError(
                    f"Transition probability {prob} for "
                    f"'{from_key}'→'{to_key}' must be in [0, 1]"
                )
            pairs.append((to_state, prob))
        result[from_state] = pairs
    return result


class MachineSimulator:
    """Config-driven Markov-chain state machine for industrial equipment.

    Manages:
    - Macro state transitions (stop / run / fault / pause)
    - PLC status code emission (specific fault/pause codes)
    - Transition logging with human-readable labels

    Config example::

        {
            "status_codes": {
                "0": { "label": "STOP" },
                "1": { "label": "RUN" },
                "2": { "label": "FAULT:VARIATEUR" },
                "6": { "label": "PAUSE:MODE_LOCAL" }
            },
            "stop_code": 0,
            "run_code": 1,
            "fault_codes": [2, 3, 4, 5],
            "pause_codes": [6, 7],
            "transitions": {
                "stop":  { "run": 0.015, "fault": 0.0003 },
                "run":   { "stop": 0.0003, "fault": 0.0002, "pause": 0.0001 },
                "fault": { "stop": 0.0025 },
                "pause": { "run": 0.005, "stop": 0.001 }
            },
            "good_rate": 0.95,
            "quality_bad_codes": [1, 2, 3]
        }
    """

    def __init__(self, config: dict[str, Any]) -> None:
        # ── PLC code mapping ─────────────────────────────
        self._stop_code: int = int(config.get("stop_code", 0))
        self._run_code: int = int(config.get("run_code", 1))

        fault_codes = config.get("fault_codes", [2])
        pause_codes = config.get("pause_codes", [3])
        if not fault_codes:
            raise ValueError("fault_codes must contain at least one code")
        if not pause_codes:
            raise ValueError("pause_codes must contain at least one code")
        self._fault_codes: list[int] = [int(c) for c in fault_codes]
        self._pause_codes: list[int] = [int(c) for c in pause_codes]

        # ── Status labels (for logging) ──────────────────
        self._status_labels: dict[int, str] = {}
        for code_str, info in config.get("status_codes", {}).items():
            if isinstance(info, dict):
                self._status_labels[int(code_str)] = info.get(
                    "label", f"CODE:{code_str}"
                )
            else:
                # Support simple { "0": "STOP" } format
                self._status_labels[int(code_str)] = str(info)

        # ── Transition matrix ────────────────────────────
        raw_transitions = config.get("transitions", {})
        if not raw_transitions:
            raise ValueError("transitions must be provided in config")
        self._transitions = _parse_transitions(raw_transitions)

        # ── Quality ──────────────────────────────────────
        self._good_rate: float = float(config.get("good_rate", 0.95))
        bad_codes = config.get("quality_bad_codes", [1])
        if not bad_codes:
            raise ValueError("quality_bad_codes must contain at least one code")
        self._quality_bad_codes: list[int] = [int(c) for c in bad_codes]

        # ── Mutable state ────────────────────────────────
        self._macro: int = MACRO_STOP
        self._status: int = self._stop_code
        self._counter: int = 0
        self._quality: int = 0
        self._tick: int = 0

    # ── Public read-only properties ──────────────────────

    @property
    def macro_state(self) -> int:
        """Current macro state (MACRO_STOP/RUN/FAULT/PAUSE)."""
        return self._macro

    @property
    def macro_state_name(self) -> str:
        """Current macro state as readable string."""
        return _MACRO_LABELS.get(self._macro, "UNKNOWN")

    @property
    def is_running(self) -> bool:
        return self._macro == MACRO_RUN

    @property
    def status(self) -> int:
        """Current PLC status code (the rich code, not macro)."""
        return self._status

    @property
    def counter(self) -> int:
        return self._counter

    @counter.setter
    def counter(self, value: int) -> None:
        self._counter = value

    @property
    def quality(self) -> int:
        return self._quality

    @quality.setter
    def quality(self, value: int) -> None:
        self._quality = value

    @property
    def good_rate(self) -> float:
        return self._good_rate

    @property
    def quality_bad_codes(self) -> list[int]:
        return self._quality_bad_codes

    @property
    def tick(self) -> int:
        return self._tick

    # ── Core simulation step ─────────────────────────────

    def step(self) -> dict[str, int]:
        """Advance the state machine by one tick.

        Returns a dict with at least:
            - "status": PLC raw status code
            - "counter": piece counter
            - "quality": quality code
        """
        self._tick += 1
        prev_macro = self._macro
        prev_status = self._status

        # ── Markov transition ────────────────────────────
        self._macro = self._next_macro()

        # ── Map macro → PLC code ─────────────────────────
        if self._macro == MACRO_STOP:
            self._status = self._stop_code
        elif self._macro == MACRO_RUN:
            self._status = self._run_code
        elif self._macro == MACRO_FAULT:
            if prev_macro != MACRO_FAULT:
                self._status = random.choice(self._fault_codes)
        elif self._macro == MACRO_PAUSE and prev_macro != MACRO_PAUSE:
            self._status = random.choice(self._pause_codes)

        # ── Log transition ───────────────────────────────
        if prev_status != self._status:
            label = self._status_labels.get(self._status, f"CODE:{self._status}")
            log.info(
                "Status → %s (code=%d, counter=%d)",
                label,
                self._status,
                self._counter,
            )

        return {
            "status": self._status,
            "counter": self._counter,
            "quality": self._quality,
        }

    def _next_macro(self) -> int:
        """Sample next macro state via sequential Bernoulli trials.

        For each possible transition from the current state, roll an independent
        random check. First one that fires wins. If none fire, stay in current state.

        This matches the approach used in the existing Modbus and S7 simulators.
        With small probabilities (<0.01), this is equivalent to the cumulative
        sampling used in the OPC UA simulator.
        """
        for target, prob in self._transitions.get(self._macro, []):
            if random.random() < prob:
                return target
        return self._macro
