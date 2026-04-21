"""
Composable signal behavior system for the ARIA simulator engine.

Each Signal applies stacked behaviors from config in a defined evaluation order:
  1. Check machine state (RUN / not RUN)
  2. Apply drift accumulator
  3. Compute base value: setpoint + drift + noise + sinusoidal
  4. If not RUN, apply on_stop behavior (zero / decay_to)
  5. If derived, override with source × factor + offset
  6. If level behavior, use level accumulator + clamp
  7. Check fault_trigger thresholds → return optional fault code

A SignalSet manages multiple signals with topological ordering so that
derived signals resolve after their sources.
"""

from __future__ import annotations

import logging
import math
import random
from typing import Any

log = logging.getLogger("aria.simulator.signals")


class Signal:
    """A single composable signal with stacked behaviors.

    Config example::

        {
            "name": "motor_temp",
            "setpoint": 75.0,
            "noise": 1.5,
            "unit": "°C",
            "drift": { "rate_run": 0.03, "rate_stop": -0.05, "max": 25, "min": 0 },
            "on_stop": { "mode": "decay_to", "target": 35.0, "rate": 0.05 },
            "fault_trigger": { "above": 95.0, "fault_code": 4 }
        }
    """

    def __init__(self, config: dict[str, Any]) -> None:
        self.name: str = config["name"]
        self.setpoint: float = float(config.get("setpoint", 0.0))
        self.noise: float = float(config.get("noise", 0.0))
        self.unit: str = config.get("unit", "")

        # ── Behavior configs (None if not present) ───────
        self._drift_cfg: dict[str, float] | None = config.get("drift")
        self._on_stop_cfg: dict[str, Any] | None = config.get("on_stop")
        self._sinus_cfg: dict[str, float] | None = config.get("sinus")
        self._level_cfg: dict[str, float] | None = config.get("level")
        self._derived_cfg: dict[str, Any] | None = config.get("derived_from")
        self._fault_trigger_cfg: dict[str, Any] | None = config.get("fault_trigger")

        # ── Mutable state ────────────────────────────────
        self._drift_acc: float = 0.0
        self._value: float = self.setpoint

        if self._level_cfg:
            self._level_value: float = float(
                self._level_cfg.get("start", self.setpoint)
            )

    @property
    def value(self) -> float:
        """Current signal value (updated by tick)."""
        return self._value

    @property
    def drift_accumulator(self) -> float:
        """Current drift accumulator (for testing/debugging)."""
        return self._drift_acc

    @property
    def derived_source(self) -> str | None:
        """Name of the source signal if this is a derived signal, else None."""
        if self._derived_cfg is not None:
            return str(self._derived_cfg["source"])
        return None

    def tick(
        self,
        is_running: bool,
        tick_num: int,
        signals: dict[str, float] | None = None,
    ) -> int | None:
        """Advance signal by one tick.

        Args:
            is_running: Whether the machine is in RUN state.
            tick_num: Current tick number (for sinusoidal phase).
            signals: Already-computed signal values (for derived signals).

        Returns:
            A fault code if a threshold is breached, otherwise None.
        """
        # ── Step 2: Update drift accumulator ─────────────
        if self._drift_cfg is not None:
            rate = (
                self._drift_cfg["rate_run"]
                if is_running
                else self._drift_cfg.get("rate_stop", 0.0)
            )
            self._drift_acc += rate
            d_min = self._drift_cfg.get("min", float("-inf"))
            d_max = self._drift_cfg.get("max", float("inf"))
            self._drift_acc = max(d_min, min(d_max, self._drift_acc))

        # ── Step 3: Compute base value ───────────────────
        value = self.setpoint + self._drift_acc

        if is_running and self.noise:
            value += random.gauss(0, self.noise)

        if self._sinus_cfg is not None:
            amplitude = self._sinus_cfg["amplitude"]
            period = self._sinus_cfg["period_ticks"]
            value += amplitude * math.sin(2 * math.pi * tick_num / period)

        # ── Step 4: on_stop behavior ─────────────────────
        if not is_running and self._on_stop_cfg is not None:
            mode = self._on_stop_cfg["mode"]
            if mode == "zero":
                value = 0.0
            elif mode == "decay_to":
                target = float(self._on_stop_cfg["target"])
                rate = float(self._on_stop_cfg["rate"])
                value = self._value + (target - self._value) * rate

        # ── Step 5: derived override ─────────────────────
        if self._derived_cfg is not None and signals is not None:
            source_name = self._derived_cfg["source"]
            factor = float(self._derived_cfg.get("factor", 1.0))
            offset = float(self._derived_cfg.get("offset", 0.0))
            source_val = signals.get(source_name)
            if source_val is not None:
                value = source_val * factor + offset

        # ── Step 6: level behavior ───────────────────────
        if self._level_cfg is not None:
            rate = (
                self._level_cfg["rate_run"]
                if is_running
                else self._level_cfg.get("rate_stop", 0.0)
            )
            self._level_value += rate
            lo = self._level_cfg.get("min", float("-inf"))
            hi = self._level_cfg.get("max", float("inf"))
            self._level_value = max(lo, min(hi, self._level_value))
            value = self._level_value
            if self.noise:
                value += random.gauss(0, self.noise)

        self._value = value

        # ── Step 7: fault trigger ────────────────────────
        if self._fault_trigger_cfg is not None:
            above = self._fault_trigger_cfg.get("above")
            below = self._fault_trigger_cfg.get("below")
            if above is not None and self._value > float(above):
                return int(self._fault_trigger_cfg["fault_code"])
            if below is not None and self._value < float(below):
                return int(self._fault_trigger_cfg["fault_code"])

        return None


class SignalSet:
    """Manages a collection of signals with dependency resolution.

    Evaluates signals in topological order so that derived signals
    resolve after their source signals have been computed.
    """

    def __init__(self, configs: list[dict[str, Any]]) -> None:
        self._signals: dict[str, Signal] = {}
        for cfg in configs:
            sig = Signal(cfg)
            if sig.name in self._signals:
                raise ValueError(f"Duplicate signal name: '{sig.name}'")
            self._signals[sig.name] = sig

        self._eval_order: list[str] = self._topo_sort()

    def _topo_sort(self) -> list[str]:
        """Return signal names in topological order (sources before derived)."""
        non_derived: list[str] = []
        derived: dict[str, str] = {}  # name → source_name

        for name, sig in self._signals.items():
            source = sig.derived_source
            if source is not None:
                if source not in self._signals:
                    raise ValueError(
                        f"Signal '{name}' derives from unknown signal '{source}'"
                    )
                derived[name] = source
            else:
                non_derived.append(name)

        order = list(non_derived)
        resolved: set[str] = set(order)
        remaining = dict(derived)

        while remaining:
            resolved_this_round: list[str] = []
            for name, source in remaining.items():
                if source in resolved:
                    order.append(name)
                    resolved.add(name)
                    resolved_this_round.append(name)

            if not resolved_this_round:
                raise ValueError(
                    f"Circular dependency in derived signals: "
                    f"{list(remaining.keys())}"
                )

            for name in resolved_this_round:
                del remaining[name]

        return order

    @property
    def names(self) -> list[str]:
        """Signal names in evaluation order."""
        return list(self._eval_order)

    def tick(
        self, is_running: bool, tick_num: int
    ) -> tuple[dict[str, float], int | None]:
        """Tick all signals in topological order.

        Returns:
            A tuple of (signal_values_dict, fault_code_or_None).
            If multiple signals trigger faults, the first one wins.
        """
        values: dict[str, float] = {}
        fault_code: int | None = None

        for name in self._eval_order:
            sig = self._signals[name]
            fc = sig.tick(is_running, tick_num, values)
            values[name] = sig.value
            if fc is not None and fault_code is None:
                fault_code = fc

        return values, fault_code

    def get(self, name: str) -> Signal | None:
        """Get a signal by name, or None if not found."""
        return self._signals.get(name)

    def __getitem__(self, name: str) -> Signal:
        return self._signals[name]

    def __contains__(self, name: str) -> bool:
        return name in self._signals

    def __len__(self) -> int:
        return len(self._signals)

    def __iter__(self):
        return iter(self._signals.values())
