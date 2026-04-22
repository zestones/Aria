# M2 — MCP Server (14 tools)

> Objectif : exposer les 14 tools MCP via FastMCP monté sur FastAPI, et offrir un
> client MCP (`MCPClient`) singleton pour les agents (cf. `technical.md` §2.1, §2.2).
> Bloquant pour M3, M4, M5.

---

## Issue M2.1 — FastMCP server + mount

**Scope.** Créer `backend/mcp/server.py` qui instancie `FastMCP("aria-tools")` et
expose un getter pour le `mount` côté `main.py`.

**Fichiers.**
- `backend/mcp/__init__.py`
- `backend/mcp/server.py`
- `backend/main.py` (ajouter `app.mount("/mcp", mcp.streamable_http_app())`)

**Décision API.** FastMCP a deux modes HTTP : `streamable_http_app()` (recommandé) et
SSE legacy. Utiliser **streamable HTTP** — c'est ce que l'Anthropic SDK + le Python
client MCP supportent.

**Acceptance.**
- [ ] `curl http://localhost:8000/mcp/` répond avec un endpoint MCP valide
- [ ] `npx @modelcontextprotocol/inspector http://localhost:8000/mcp` se connecte et liste 0 tools (pour l'instant)

---

## Issue M2.2 — `tools.py` : 4 tools KPI

**Scope.** Implémenter les 4 tools KPI en wrappers async autour de `KpiRepository`
existant (déjà branché sur les fonctions SQL `fn_oee`, `fn_mtbf`, `fn_mttr`).

**Tools.**
- `get_oee(cell_ids: list[int], window_start: str, window_end: str) -> dict`
- `get_mtbf(cell_ids: list[int], window_start: str, window_end: str) -> dict`
- `get_mttr(cell_ids: list[int], window_start: str, window_end: str) -> dict`
- `get_downtime_events(cell_ids: list[int], window_start: str, window_end: str, categories: list[str] | None = None) -> list[dict]`

**Pattern d'accès DB.** Les tools tournent dans le contexte du process FastAPI. Réutiliser
la pool `db.pool` du module `core.database`.

✅ **DÉCIDÉ — helper `_with_conn()`.** Créer dans `backend/mcp/tools.py` un
async context manager qui acquire+release proprement la connection à chaque tool
call :
```python
from contextlib import asynccontextmanager
from core.database import db

@asynccontextmanager
async def _with_conn():
    async with db.pool.acquire() as conn:
        yield conn
```
Chaque tool fait `async with _with_conn() as conn: ...`. Pas de DI FastAPI ici (les
tools FastMCP n'ont pas accès à `Depends(get_db)`), pas de session persistante
(évite les leaks si un agent boucle).

**Acceptance.**
- [ ] Test : `MCPClient.call_tool("get_oee", {...})` sur P-02 retourne un dict cohérent

---

## Issue M2.3 — `tools.py` : 2 tools Signaux

**Tools.**
- `get_signal_trends(signal_def_id: int, window_start: str, window_end: str, aggregation: str = "1m") -> list[dict]`
  → query `process_signal_data` agrégée
- `get_signal_anomalies(cell_id: int, window_start: str, window_end: str) -> list[dict]`
  → compare valeurs vs `equipment_kb.structured_data.thresholds.*.alert`

**Dépendance.** `get_signal_anomalies` lit la KB → bloqué tant que M1.5 pas mergé.

**Acceptance.**
- [ ] Tendance vibration P-02 sur 24h → liste de buckets temps/valeur
- [ ] Si la KB P-02 a `vibration_mm_s.alert = 2.8`, et la valeur dépasse, l'anomalie remonte

---

## Issue M2.4 — `tools.py` : 3 tools Contexte humain

**Tools.**
- `get_logbook_entries(cell_id: int, window_start: str, window_end: str) -> list[dict]`
- `get_shift_assignments(cell_id: int, date_start: str, date_end: str) -> list[dict]`
- `get_work_orders(cell_id: int | None, status: str | None, date_start: str | None, date_end: str | None) -> list[dict]`

Wrappers directs sur `LogbookRepository`, `ShiftRepository`, `WorkOrderRepository` existants.

**Acceptance.**
- [ ] Chaque tool retourne les rows seedées pour P-02

---

## Issue M2.5 — `tools.py` : 3 tools KB

**Tools.**
- `get_equipment_kb(cell_id: int) -> dict` → renvoie `structured_data` parsé
- `get_failure_history(cell_id: int, limit: int = 50) -> list[dict]`
- `update_equipment_kb(cell_id: int, structured_data_patch: dict, source: str, calibrated_by: str) -> dict`
  → merge partiel sur `structured_data`, append `calibration_log`

> ✅ **DÉCIDÉ — exposer le tool tel quel (Option A).** Faire confiance au system
> prompt du KB Builder. L'agent qui appelle ce tool est orchestré par notre code
> (pas un agent libre tiers), le risque de pollution KB est maîtrisé. Bonus :
> chaque write append une entry dans `calibration_log` avec `source` et
> `calibrated_by`, donc tout est auditable.

**Acceptance.**
- [ ] Patch sur `thresholds.vibration_mm_s.alert` est appliqué et visible via `get_equipment_kb`
- [ ] `calibration_log` contient une nouvelle entrée

---

## Issue M2.6 — `tools.py` : 2 tools Production (peuvent être skippés)

**Tools.**
- `get_quality_metrics(cell_ids: list[int], window_start: str, window_end: str) -> dict`
- `get_production_stats(cell_ids: list[int], date_start: str, date_end: str) -> dict`

> ✅ **DÉCIDÉ — premier sacrifice si débord.** Le scénario démo P-02 ne consomme
> pas ces tools dans le RCA. Ordre de priorité :
> 1. Si M2.1→M2.5 OK à J4 midi → implem ces 2 tools (renforce le pitch "14 tools")
> 2. Si retard → skip, livrer 12 tools, mentionner les 2 manquants comme
>    "scope étendu post-démo" dans le pitch
> 3. Ne JAMAIS bloquer M3/M4/M5 pour ces 2 tools

**Acceptance.** Optionnelle.

---

## Issue M2.7 — `MCPClient` singleton (auto-discovery + call_tool)

**Scope.** Créer `backend/mcp/client.py` selon le pattern décrit dans `technical.md`
§2.2 :
- Classe `MCPClient(url: str)`
- `await get_tools_schema() -> list[dict]` : connexion HTTP courte → `list_tools()` →
  conversion format Anthropic SDK → cache mémoire
- `await call_tool(name, arguments) -> str` : connexion HTTP courte → `call_tool` →
  return text content

**Pattern lifecycle.** Connexion HTTP **par appel**, pas de session persistante (cf.
note `technical.md` §2.2 sur le bug de closure). Overhead ~5–15ms localhost.

**Singleton.** Module-level instance : `mcp_client = MCPClient("http://localhost:8000/mcp")`.

> ✅ **DÉCIDÉ — HTTP loopback intra-process accepté.** Le `MCPClient` qui
> appelle `localhost:8000/mcp` parle au même process FastAPI. Overhead ~5–15ms,
> pas un bug. Avantage : un seul endpoint MCP réutilisable par d'autres clients
> (Claude Desktop, MCP Inspector, futurs agents externes). Avantage clé pour le
> pitch hackathon : "notre serveur MCP est exposable tel quel à n'importe quel
> assistant LLM".

**Acceptance.**
- [ ] `await mcp_client.get_tools_schema()` retourne la liste des 12–14 tools en format Anthropic
- [ ] `await mcp_client.call_tool("get_oee", {...})` retourne le résultat sérialisé

---

## Issue M2.8 — Script de test isolation

**Scope.** `backend/tests/test_mcp_tools.py` (script standalone, pas pytest formel) :
- Pour chaque tool, appel direct via `MCPClient` avec args sur P-02 (cell_id=2)
- Print du résultat + assert non-vide

**But.** Avant J4, valider que les 14 tools tournent en isolation. Sans ça, debugger
un agent loop est un cauchemar.

**Acceptance.**
- [ ] `python -m backend.tests.test_mcp_tools` → 14 ✅ (ou 12 ✅ si M2.6 skippé)

---

## Bloque

- M3 (KB Builder utilise `update_equipment_kb` indirectement)
- M4 (Sentinel lit signaux + KB ; Investigator a besoin des 14 tools)
- M5 (Q&A consomme les 14 tools)
