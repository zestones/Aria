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

**Events utilisés** (contrat aligné avec frontend, cf. `docs/planning/ALIGNMENT.md`).

| Event type            | Payload                                                           | Émis par                          |
|-----------------------|-------------------------------------------------------------------|-----------------------------------|
| `anomaly_detected`    | `{cell_id, signal_def_id, value, threshold, work_order_id, time}` | Sentinel                          |
| `agent_start`         | `{agent, turn_id}`                                                | orchestrator                      |
| `agent_end`           | `{agent, turn_id, finish_reason}`                                 | orchestrator                      |
| `tool_call_started`   | `{agent, tool_name, args, turn_id}`                               | Investigator / Q&A / WO Gen       |
| `tool_call_completed` | `{agent, tool_name, duration_ms, turn_id}`                        | idem                              |
| `agent_handoff`       | `{from_agent, to_agent, reason, turn_id}` (cf. M4.6)              | orchestrator on `ask_*` tool call |
| `thinking_delta`      | `{agent, content, turn_id}` (cf. M4.5)                            | Investigator (extended thinking)  |
| `ui_render`           | `{agent, component, props, turn_id}` (cf. M2.9)                   | tout agent appelant un `render_*` |
| `rca_ready`           | `{work_order_id, rca_summary, confidence, turn_id}`               | Investigator                      |
| `work_order_ready`    | `{work_order_id}`                                                 | Work Order Generator              |

**`turn_id`.** UUID v4 généré par l'orchestrateur à chaque `agent_start`.
Corrèle tous les events d'un même tour agentique côté frontend (Activity Feed,
Agent Inspector). Stocker dans une `ContextVar` Python pour ne pas le passer
explicitement à chaque `ws_manager.broadcast()`.

**Sérialisation.** JSON une ligne par event. Pas d'event `error` — erreurs via
HTTP status ou `{type: "done", error: "..."}` final côté `/agent/chat`.

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
  - `tools_schema = await mcp_client.get_tools_schema() + UI_TOOLS + [SUBMIT_RCA_TOOL, ASK_KB_BUILDER_TOOL]`
    (UI_TOOLS cf. M2.9, ASK_KB_BUILDER_TOOL cf. M4.6)
  - while not end_turn :
    - `messages.create(...)` avec model agent + tools
    - pour chaque `tool_use` block :
      - si `tool_name.startswith("render_")` → broadcast `ui_render` + tool_result "rendered" (cf. M2.9)
      - si `tool_name == "ask_kb_builder"` → spawn mini-session KB Builder (cf. M3.5) + tool_result
      - si `tool_name == "submit_rca"` → capture args, break loop
      - sinon → broadcast `tool_call_started` → `mcp_client.call_tool()` → broadcast `tool_call_completed`
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

## Issue M4.5 🔴 — Extended thinking sur Investigator (Opus 4.7 wow factor)

**Scope.** Activer `thinking` sur l'agent loop Investigator. C'est le seul argument
visible "pourquoi Opus 4.7 vs Sonnet" pour les juges.

```python
response = await anthropic.messages.create(
    model=model_for("agent"),
    thinking={"type": "enabled", "budget_tokens": 10000},
    system=INVESTIGATOR_SYSTEM,
    messages=messages,
    tools=tools_schema,
    stream=True,
)
```

**Streaming.** À chaque chunk `thinking_delta` reçu du SDK Anthropic, broadcast :
```python
await ws_manager.broadcast("thinking_delta", {
    "agent": "investigator",
    "content": chunk.thinking_delta.text,
    "turn_id": turn_id,
})
```

**Périmètre.** Activé **uniquement** sur Investigator. Budget 10k tokens ≈ 5¢ par
run avec Opus 4.7, négligeable. Les autres agents n'en ont pas besoin (et économie
coûts).

**Pourquoi critique.** Le frontend (M8.5 Agent Inspector) streame le thinking en
live dans un panel dédié → le juge **voit** Opus réfléchir. Sans ça, *"pourquoi
Opus 4.7 ?"* n'a pas de réponse visuelle. 25% de la note.

**Acceptance.**
- [ ] `thinking_delta` events streamed pendant un run Investigator
- [ ] Frontend M8.5 affiche le thinking en live (vérifié J6)
- [ ] Latence end-to-end Investigator reste < 60s avec thinking activé

**Bloque.** Frontend M8.5, prix "Opus 4.7 Use".

---

## Issue M4.6 🔴 — Agent-as-tool (handoffs dynamiques)

**Scope.** Remplacer le pipeline scripted (`asyncio.create_task(run_work_order_generator)`
en fin de M4.3) par des handoffs **décidés par l'agent** via tool call. Sans ça, le
"multi-agent" est juste un workflow Python aux yeux des juges.

**Décision — garder les deux chemins.**
- Pipeline scripted RCA → WO Gen reste en place (chemin garanti pour la démo)
- En plus, l'Investigator a des tools `ask_*` qu'il peut choisir d'appeler en
  cours de raisonnement (chemin wow factor)

**Tools à déclarer (locaux, pas via FastMCP).**
```python
ASK_KB_BUILDER_TOOL = {
  "name": "ask_kb_builder",
  "description": "Consulte le KB Builder pour un détail constructeur absent de la "
                 "KB courante (ex: torque max d'un boulon, réf pièce introuvable).",
  "input_schema": {"type": "object", "properties": {
    "question": {"type": "string"},
    "cell_id": {"type": "integer"}
  }, "required": ["question", "cell_id"]}
}
```

**Handler.** Quand Investigator appelle `ask_kb_builder` :
1. `ws_manager.broadcast("agent_handoff", {from: "investigator", to: "kb_builder", reason: args.question, turn_id})`
2. `ws_manager.broadcast("agent_start", {agent: "kb_builder", turn_id: new_turn_id})`
3. Spawn une mini-session KB Builder (Messages API loop, system prompt spécialisé
   "réponds factuellement à un collègue agent, format JSON")
4. `ws_manager.broadcast("agent_end", {agent: "kb_builder", turn_id, finish_reason: "end_turn"})`
5. Retour comme `tool_result` à Investigator

**Symétrique côté Q&A (M5.2/M5.4).** Déclarer `ask_investigator` pour que Q&A
délègue les questions diagnostiques pointues.

**Scénarios démo (au moins 2 handoffs visibles).**
- Scène 3 (Investigation) : Investigator → KB Builder pour chercher une réf pièce
- Scène 5 (Q&A) : Q&A → Investigator pour une question diagnostique poussée

**Acceptance.**
- [ ] Investigator peut appeler `ask_kb_builder` et reçoit une réponse structurée
- [ ] Event `agent_handoff` visible dans le WS stream
- [ ] Scénario démo P-02 déclenche au moins 1 handoff dynamique

**Bloque.** Pitch "Best Managed Agents" crédible.

---

## Issue M4.7 🟡 (P1 bonus) — Memory flex scene

**Scope.** L'Investigator charge `failure_history` du cell dans son contexte initial
et produit un RCA visiblement plus rapide/précis au 2e diagnostic similaire.

**Implem.**
- Début du run : `past_failures = await mcp_client.call_tool("get_failure_history", {cell_id, limit: 5})`
- Inject dans le system prompt : *"Pannes précédentes de cet équipement : {past_failures}.
  Si le pattern actuel matche une panne passée, cite-la explicitement dans `similar_past_failure`."*
- Le tool `submit_rca` (cf. M4.3) accepte déjà `similar_past_failure` → rien à
  changer côté schema

**Scène démo dédiée.** `POST /api/v1/demo/trigger-memory-scene` :
1. INSERT une fausse `failure_history` datée de 3 mois (pattern P-02 similaire)
2. Trigger une anomalie P-02 actuelle
3. L'Investigator match → RCA cite la panne passée → scène flex "l'agent apprend"

**Priorité.** P1. Skip si serré J6 PM. Si skipé, l'essentiel reste : Investigator
utilise `failure_history` en contexte (sans la scène scénarisée).

**Acceptance.**
- [ ] Investigator cite la panne passée dans son RCA si pattern matche
- [ ] Endpoint demo `/trigger-memory-scene` rejouable autant de fois que voulu

---

## Bloque

- Scène 2 (anomalie live) et Scène 3 (RCA) de la démo
- M5 (le Work Order Generator est triggered par l'Investigator)

## Bloqué par

- M1 (`work_order` colonnes)
- M2 (tools, MCPClient, M2.9 UI tools)
- M3 (KB doit exister pour que Sentinel ait des seuils)
