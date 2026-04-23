"""Work Order Generator agent subpackage (#30 / M5.1).

Split by concern (mirrors :mod:`agents.kb_builder`):

- :mod:`agents.work_order_generator.prompts` — ``WO_GEN_SYSTEM`` template.
- :mod:`agents.work_order_generator.schemas` — ``SUBMIT_WORK_ORDER_TOOL``
  terminal tool schema.
- :mod:`agents.work_order_generator.service` — ``run_work_order_generator``
  entry point, loop body, tool dispatch, persistence, failure path.

Public symbols are re-exported here so callers can keep importing from
``agents.work_order_generator`` without knowing the internal layout.
"""

from agents.work_order_generator.prompts import WO_GEN_SYSTEM
from agents.work_order_generator.schemas import SUBMIT_WORK_ORDER_TOOL
from agents.work_order_generator.service import MAX_TURNS, run_work_order_generator

__all__ = [
    "MAX_TURNS",
    "SUBMIT_WORK_ORDER_TOOL",
    "WO_GEN_SYSTEM",
    "run_work_order_generator",
]
