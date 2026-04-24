"""Sentinel package — reactive detection + predictive forecast-watch.

Two sibling loops, started together by the FastAPI lifespan:

- :func:`agents.sentinel.service.sentinel_loop` (M4) — 30 s reactive
  threshold-breach detection. Opens a ``work_order(status='detected')`` and
  spawns the Investigator on every breach.
- :func:`agents.sentinel.forecast.forecast_watch_loop` (M9) — 60 s
  regression-based predictive alerting. Emits ``forecast_warning`` on the
  events bus when a signal's projected trajectory crosses a threshold
  within the 12 h horizon. Never opens a work order — advisory only.

The two loops share no state. They live in one package because they answer
the same operator question from two directions (reactive and predictive),
and the packaging mirrors the other agent packages (``kb_builder``,
``investigator``, ``qa``, ``work_order_generator``).

See [docs/architecture/04-sentinel-investigator.md](../../../docs/architecture/04-sentinel-investigator.md)
and [docs/architecture/06-forecast-watch.md](../../../docs/architecture/06-forecast-watch.md).
"""

from agents.sentinel.forecast import forecast_watch_loop
from agents.sentinel.service import sentinel_loop

__all__ = ["forecast_watch_loop", "sentinel_loop"]
