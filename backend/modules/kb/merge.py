"""RFC-7396 JSON Merge Patch for ``equipment_kb.structured_data``.

Audit M2.5 §1: ``update_equipment_kb`` is the only shared-write tool in M2.
Without a deterministic merge contract, the first caller wins and silently
clobbers the others. We pick RFC-7396 (https://www.rfc-editor.org/rfc/rfc7396)
for its symmetry and predictability:

- Recursive dict merge.
- Leaf values (incl. arrays) **replace** wholesale — arrays are NOT appended.
- ``null`` in patch **deletes** the corresponding key.
- Non-dict patch (e.g. ``patch={"foo": 1}`` applied to ``existing=42``) replaces
  the entire existing value.

The single exception baked into the calling tool (NOT this helper) is
``structured_data.calibration_log``, which is always append-only — see
``aria_mcp.tools.kb.update_equipment_kb``.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def merge_structured_data(existing: Any, patch: Any) -> Any:
    """Apply an RFC-7396 JSON Merge Patch to ``existing`` and return the result.

    Pure function: never mutates either argument.

    Args:
        existing: Current value (typically a dict, but the recursive call may
            see any JSON value).
        patch: Patch to apply. ``None`` deletes when nested under a dict; at
            the top level it replaces the whole document with ``None``.

    Returns:
        The merged value.
    """
    # If the patch is not a dict, it replaces the existing value wholesale
    # (RFC 7396 §1: "If the provided merge patch is not an object, the result
    #  of applying it is the merge patch itself").
    if not isinstance(patch, dict):
        return deepcopy(patch)

    # If existing is not a dict, treat it as an empty one — the patch dict
    # then becomes the new value (with null-deletes resolving to absent keys).
    base: dict[str, Any] = deepcopy(existing) if isinstance(existing, dict) else {}

    for key, value in patch.items():
        if value is None:
            base.pop(key, None)
        elif isinstance(value, dict):
            base[key] = merge_structured_data(base.get(key), value)
        else:
            # Leaves (incl. arrays) replace wholesale.
            base[key] = deepcopy(value)
    return base
