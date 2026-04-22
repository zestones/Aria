# M4 — Sentinel + Investigator

> Objectif : une anomalie injectée dans `process_signal_data` déclenche en < 60s un
> work_order avec RCA structuré, broadcasté en temps réel via WebSocket.
> Bloquant pour scènes 2 et 3 de la démo.

---

## Issue M4.1 — `WSManager` broadcast manager

**Scope.** `backend/core/ws_manager.py` :
- Classe `WSManager` avec `connections: set[WebSocket]`
- `await connect(ws)`, `disconnect(ws)`
- `await broadcast(event_type: str, payload: dict)` → envoie JSON à tous les sockets,
  ignore les sockets fermés
- Singleton module-level `ws_manager = WSManager()`

**Events utilisés.**
- `anomaly_detected` : `{cell_id, signal_def_id, value, threshold, work_order_id}`
- `tool_call_started` : `{agent, tool_name, args}` (cf. UX `technical.md` §3.1)
- `tool_call_completed` : `{agent, tool_name, duration_ms}`
- `rca_ready` : `{work_order_id, rca_summary, confidence}`
- `work_order_ready` : `{work_order_id}`

> ✅ **DÉCIDÉ — un seul topic global.** Le frontend filtre côté client par
> `cell_id` dans le payload. Pour la démo on a 1 site, 5 cells, 1 opérateur connecté
> au max — le coup d'étoffer en rooms par cell n'apporte rien.

**Acceptance.**
- [ ] `wscat ws://localhost:8000/api/v1/events` → reçoit les events broadcastés
- [ ] Endpoint `WS /api/v1/events` enregistré dans `main.py`

---

## Issue M4.2 — Sentinel asyncio loop

**Scope.** `backend/agents/sentinel.py` :
- `async def sentinel_loop()` : boucle `while True` avec `asyncio.sleep(30)`
- À chaque tick :
  1. Liste les cells qui ont une `equipment_kb` avec `onboarding_complete=true`
  2. Pour chaque cell : récupère les 5 dernières minutes de `process_signal_data`
     pour les signaux référencés dans `kb.thresholds`
  3. Compare la dernière valeur vs `kb.thresholds.<signal>.alert`
  4. Si dépassement nouveau (pas déjà un work_order ouvert pour ce cell+signal dans
     les 30 dernières minutes) :
     - INSERT `work_order(status='detected', generated_by_agent=true,
       trigger_anomaly_time=value_time, triggered_by_signal_def_id=...,
       title="Anomalie détectée — <signal>", priority='high')`
     - `ws_manager.broadcast("anomaly_detected", ...)`
     - `asyncio.create_task(run_investigator(work_order_id))`

**Démarrage.** Lancer dans le `lifespan` de `main.py` :
```
sentinel_task = asyncio.create_task(sentinel_loop())
yield
sentinel_task.cancel()
```

> ✅ **DÉCIDÉ — cells sans KB skipées silencieusement.** Au startup du
> `sentinel_loop`, log INFO une fois la liste des cells surveillées vs ignorées. Pas
> de log répétitif à chaque tick. Côté frontend, le badge "Surveillé par ARIA" sur
> la card cell rend le statut évident.

> ✅ **DÉCIDÉ — debounce via query DB.** À chaque tick, avant d'INSERT un
> nouveau work_order, faire :
> ```sql
> SELECT 1 FROM work_order
> WHERE cell_id = $1 AND triggered_by_signal_def_id = $2
>   AND created_at > NOW() - INTERVAL '30 minutes'
>   AND status NOT IN ('completed','cancelled')
> LIMIT 1;
> ```
> Si row → skip. La DB est la source de vérité, survit aux restarts du Sentinel,
> et un humain qui ferme manuellement le WO débloque la surveillance immédiatement.

**Acceptance.**
- [ ] Simulateur monte vibration P-02 à 3.4 mm/s → 1 work_order créé en < 35s
- [ ] Pas de work_order doublon si la valeur reste élevée pendant 5 minutes

---

## Issue M4.3 — Investigator agent loop

**Scope.** `backend/agents/investigator.py` :
- `async def run_investigator(work_order_id: int) -> None`
- Charge le contexte initial : work_order + cell + signal_def + anomaly_time
- Construit user message : "Anomalie détectée sur <cell.name>. Signal <signal.name>
  a atteint <value> à <time> (seuil alerte: <threshold>). Investigue."
- System prompt : "Tu es un expert maintenance industrielle. Une anomalie a été
  détectée. Utilise les tools disponibles pour investiguer librement — tu décides
  quoi consulter, dans quel ordre. Produis ensuite un RCA structuré au format JSON :
  `{root_cause, confidence, contributing_factors, similar_past_failure, recommended_action}`."
- Boucle agent (cf. pattern `technical.md` §2.2 mais avec `MCPClient`) :
  - `tools_schema = await mcp_client.get_tools_schema()`
  - while not end_turn :
    - `messages.create(...)` avec model agent + tools
    - pour chaque `tool_use` block : broadcast `tool_call_started` → `mcp_client.call_tool()` → broadcast `tool_call_completed`
    - append assistant + tool_results à messages
- À end_turn : extract le bloc JSON RCA du dernier message texte
- UPDATE `work_order SET rca_summary=..., status='analyzed'`
- INSERT `failure_history(cell_id, failure_time, failure_mode, root_cause, signal_patterns, work_order_id)`
- `ws_manager.broadcast("rca_ready", ...)`
- `asyncio.create_task(run_work_order_generator(work_order_id))`

> ✅ **DÉCIDÉ — tool `submit_rca` (Option A).** Plus robuste que parser du markdown.
> Déclaré inline côté Python (pas via FastMCP server) :
> ```python
> SUBMIT_RCA_TOOL = {
>   "name": "submit_rca",
>   "description": "À appeler une fois pour soumettre le RCA final.",
>   "input_schema": {"type": "object", "properties": {
>     "root_cause": {"type": "string"},
>     "confidence": {"type": "number"},
>     "contributing_factors": {"type": "array", "items": {"type": "string"}},
>     "similar_past_failure": {"type": "string"},
>     "recommended_action": {"type": "string"}
>   }, "required": ["root_cause", "confidence", "recommended_action"]}
> }
> tools = await mcp_client.get_tools_schema() + [SUBMIT_RCA_TOOL]
> ```
> Quand l'agent appelle `submit_rca`, on ne fait PAS de tool_result back — on
> stoppe la boucle, persiste le RCA, et break.

> ✅ **DÉCIDÉ — `submit_rca` est local au module Investigator.** Déclaré inline
> dans `agents/investigator.py` et concaténé manuellement à `tools_schema`. Le MCP
> server n'expose JAMAIS `submit_rca`. Même pattern pour `submit_work_order`
> (Investigator only) et tout futur tool spécifique à un agent. Règle générale :
> tool d'output structuré = local agent ; tool de lecture/écriture DB partagée =
> MCP.

**Acceptance.**
- [ ] Anomalie injectée → work_order avec `rca_summary` non-null en < 60s
- [ ] `failure_history` contient une nouvelle entrée
- [ ] Frontend voit les `tool_call_started` events streamer en live

---

## Issue M4.4 — Lifespan integration

**Scope.** Modifier `backend/main.py` lifespan pour :
- Démarrer `sentinel_task` au startup
- L'annuler au shutdown
- Logger les exceptions du `sentinel_loop` sans laisser la task mourir silencieusement
  (wrapper `try/except` avec re-raise contrôlé)

**Acceptance.**
- [ ] `docker compose up` → log "Sentinel started" visible
- [ ] `docker compose down` → log "Sentinel cancelled"

---

## Bloque

- Scène 2 (anomalie live) et Scène 3 (RCA) de la démo
- M5 (le Work Order Generator est triggered par l'Investigator)

## Bloqué par

- M1 (`work_order` colonnes)
- M2 (tools, MCPClient)
- M3 (KB doit exister pour que Sentinel ait des seuils)
