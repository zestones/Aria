"""Hierarchy tools (M2.4 audit add-on) — `list_cells` for name → id resolution.

The Q&A agent (M5.x) receives natural-language queries like "what's the OEE of
Bottle Filler?" and needs to resolve the name → ``cell_id`` before calling KPI tools.
Without this tool, the LLM either invents an id or we inject the full cell
list into the system prompt — both break for multi-cell sites.
"""

from __future__ import annotations

from aria_mcp._common import with_conn
from aria_mcp.server import mcp
from modules.hierarchy.repository import HierarchyRepository
from modules.hierarchy.schemas import CellOut


@mcp.tool()
async def list_cells(site_id: int | None = None) -> list[dict]:
    """Enumerate cells, optionally restricted to one site.

    Args:
        site_id: Optional site filter. When set, only cells whose parent line
            belongs to an area under this site are returned. Omit to list all
            cells across the enterprise.

    Returns:
        List of ``CellOut`` dicts (id, name, parentid, ideal_cycle_time_seconds, ...)
        ordered by ``id``. Disabled cells are included — agents should filter on
        ``disable`` if they need only operational cells.
    """
    async with with_conn() as conn:
        repo = HierarchyRepository(conn)
        if site_id is None:
            rows = await repo.list_cells()
        else:
            rows = await conn.fetch(
                """
                SELECT c.* FROM cell c
                JOIN line l ON c.parentid = l.id
                JOIN area a ON l.parentid = a.id
                WHERE a.parentid = $1
                ORDER BY c.id
                """,
                site_id,
            )
    return [CellOut.model_validate(dict(r)).model_dump(mode="json") for r in rows]
