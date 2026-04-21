"""
Production counter modes for the ARIA simulator engine.

Supports three counting strategies, selectable via config:

  - cycle:         Deterministic cycle-time accumulation.
                   Emits +1 piece when accumulated time >= ideal_cycle_ms.
  - probabilistic: Random chance per tick while running.
                   Each tick: random() < cycle_chance → +1 piece.
  - accumulator:   Flow-based volume integration.
                   Integrates a signal value over time and emits when >= threshold.
"""

from __future__ import annotations

import random
from typing import Any


class ProductionCounter:
    """Config-driven production counter with quality assignment.

    Config example (cycle mode)::

        { "mode": "cycle", "ideal_cycle_ms": 25000 }

    Config example (probabilistic mode)::

        { "mode": "probabilistic", "cycle_chance": 0.08 }

    Config example (accumulator / flow-based)::

        {
            "mode": "accumulator",
            "source_signal": "flow_rate",
            "time_unit": "hour",
            "unit_per_count": 1.0
        }
    """

    # Time-unit divisors: convert seconds to the target unit
    _TIME_DIVISORS = {"second": 1.0, "minute": 60.0, "hour": 3600.0}

    def __init__(self, config: dict[str, Any]) -> None:
        self._mode: str = config.get("mode", "cycle")
        if self._mode not in ("cycle", "probabilistic", "accumulator"):
            raise ValueError(
                f"Unknown production mode '{self._mode}'. "
                f"Expected: cycle, probabilistic, accumulator"
            )

        # ── Quality config ───────────────────────────────
        self._good_rate: float = float(config.get("good_rate", 0.95))
        bad_codes = config.get("quality_bad_codes", [1])
        if not bad_codes:
            raise ValueError("quality_bad_codes must contain at least one code")
        self._quality_bad_codes: list[int] = [int(c) for c in bad_codes]

        # ── Counter config ───────────────────────────────
        self._max_count: int = int(config.get("max_count", 65535))

        # ── Mode-specific config ─────────────────────────
        if self._mode == "cycle":
            self._ideal_cycle_ms: float = float(config.get("ideal_cycle_ms", 25000))
        elif self._mode == "probabilistic":
            self._cycle_chance: float = float(config.get("cycle_chance", 0.08))
        elif self._mode == "accumulator":
            self._source_signal: str = config["source_signal"]
            time_unit = config.get("time_unit", "hour")
            if time_unit not in self._TIME_DIVISORS:
                raise ValueError(
                    f"Unknown time_unit '{time_unit}'. "
                    f"Expected: {', '.join(self._TIME_DIVISORS)}"
                )
            self._time_divisor: float = self._TIME_DIVISORS[time_unit]
            self._unit_per_count: float = float(config.get("unit_per_count", 1.0))

        # ── Mutable state ────────────────────────────────
        self._counter: int = 0
        self._quality: int = 0
        self._cycle_acc: float = 0.0  # for cycle mode (ms) and accumulator mode

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
        return list(self._quality_bad_codes)

    @property
    def mode(self) -> str:
        return self._mode

    def tick(
        self,
        interval_s: float,
        is_running: bool,
        signals: dict[str, float] | None = None,
    ) -> tuple[bool, int]:
        """Advance counter by one tick.

        Args:
            interval_s: Elapsed time since last tick (seconds).
            is_running: Whether the machine is in RUN state.
            signals: Current signal values (needed for accumulator mode).

        Returns:
            (produced, quality_code): produced is True if a piece was counted,
            quality_code is 0 for good or a bad code otherwise.
        """
        if not is_running:
            if self._mode == "cycle":
                self._cycle_acc = 0.0
            return False, self._quality

        if self._mode == "cycle":
            return self._tick_cycle(interval_s)
        elif self._mode == "probabilistic":
            return self._tick_probabilistic()
        else:  # accumulator
            return self._tick_accumulator(interval_s, signals or {})

    def _tick_cycle(self, interval_s: float) -> tuple[bool, int]:
        self._cycle_acc += interval_s * 1000
        if self._cycle_acc >= self._ideal_cycle_ms:
            self._cycle_acc -= self._ideal_cycle_ms
            return self._emit()
        return False, self._quality

    def _tick_probabilistic(self) -> tuple[bool, int]:
        if random.random() < self._cycle_chance:
            return self._emit()
        return False, self._quality

    def _tick_accumulator(
        self, interval_s: float, signals: dict[str, float]
    ) -> tuple[bool, int]:
        signal_value = signals.get(self._source_signal, 0.0)
        self._cycle_acc += signal_value * interval_s / self._time_divisor
        if self._cycle_acc >= self._unit_per_count:
            self._cycle_acc -= self._unit_per_count
            return self._emit()
        return False, self._quality

    def _emit(self) -> tuple[bool, int]:
        """Emit one piece: increment counter and assign quality."""
        self._counter = (self._counter + 1) % (self._max_count + 1)
        self._quality = (
            0
            if random.random() < self._good_rate
            else random.choice(self._quality_bad_codes)
        )
        return True, self._quality
