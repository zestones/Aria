# Alignment — Backend × Frontend plans

> Document de référence croisé entre les milestones backend (M1→M5 par @zestones) et
> frontend (M6→M10 par @vgtray).
>
> **À lire par les deux devs avant de commencer J3.**

---

## Répartition des lanes

| Lane | Owner | Milestones |
|------|-------|------------|
| Backend (MCP, agents, orchestration, WS broadcast) | zestones | M1, M2, M3, M4, M5 |
| Frontend (shell, control room, chat, artifacts, onboarding, WO console) | vgtray | M6, M7, M8, M9 |
| Shared (E2E rehearsal, submission) | les deux | M10 |

**Zéro overlap de fichiers.** Backend touche `backend/*`, frontend touche `frontend/*`.
Les deux côtés parlent via :
1. REST existant (`/api/v1/hierarchy`, `/signals/current`, `/monitoring/status/current`, `/kpi/*`, `/work-orders`, `/logbook`, `/shifts/current`, `/kb/*`)
2. REST nouveaux pour KB Builder (`/kb/equipment/{cell_id}/upload`, `/kb/equipment/{cell_id}/onboarding/*`)
3. **WebSocket unique** `/api/v1/events` (broadcast global) + `/api/v1/agent/chat` (Q&A stateful)

---

## Contrat WebSocket events (v1)

Décidé après review du plan backend. Deux endpoints WS :

### `WS /api/v1/events` — broadcast global (cf. M4.1)

Envoyé par le backend à tous les clients connectés. Filtrage côté frontend par
`cell_id` dans le payload. Utilisé par l'Anomaly Banner, l'Activity Feed, le dashboard.

| Event type | Payload | Émis par |
|------------|---------|----------|
| `anomaly_detected` | `{cell_id, signal_def_id, value, threshold, work_order_id, time}` | Sentinel |
| `tool_call_started` | `{agent, tool_name, args, turn_id}` | Investigator / Q&A / WO Gen |
| `tool_call_completed` | `{agent, tool_name, duration_ms, turn_id}` | idem |
| `agent_handoff` ⭐ | `{from_agent, to_agent, reason, turn_id}` | orchestrator on `ask_*` tool call |
| `thinking_delta` ⭐ | `{agent, content, turn_id}` | Investigator (extended thinking) |
| `rca_ready` | `{work_order_id, rca_summary, confidence, turn_id}` | Investigator |
| `work_order_ready` | `{work_order_id}` | Work Order Generator |
| `ui_render` ⭐ | `{agent, component, props, turn_id}` | n'importe quel agent |
| `agent_start` | `{agent, turn_id}` | orchestrator |
| `agent_end` | `{agent, turn_id, finish_reason}` | orchestrator |

⭐ = ajouts par rapport au M4.1 initial, nécessaires pour les prix (voir gaps ci-dessous).

### `WS /api/v1/agent/chat` — Q&A stateful (cf. M5.2)

Connexion persistante par session user. Flux bidirectionnel.

**Client → serveur :**
```json
{"type": "user", "content": "Pourquoi P-02 a vibré hier soir ?"}
```

**Serveur → client :**
```json
{"type": "text_delta", "content": "Je regarde..."}
{"type": "thinking_delta", "content": "L'anomalie date de..."}         // Opus 4.7
{"type": "tool_call", "name": "get_signal_trends", "args": {...}}
{"type": "tool_result", "name": "get_signal_trends", "summary": "..."}
{"type": "ui_render", "component": "SignalChart", "props": {...}}      // generative UI
{"type": "agent_handoff", "from": "qa", "to": "investigator", "reason": "..."}
{"type": "done"}
```

### Règle de sérialisation

Tous les events JSON sur une seule ligne. Pas d'event type `error` côté stream —
les erreurs transit via HTTP status ou un `{"type": "done", "error": "..."}` final.

### `turn_id`

Généré par le backend à chaque `agent_start` (UUID v4). Permet au frontend de
corréler tous les events d'un même tour agentique dans l'Activity Feed / Inspector.

---

## Les 4 issues à ajouter dans le plan backend pour sécuriser les prix

Ces 4 issues manquent actuellement dans M1–M5 et bloquent des features de l'UI qui
sont critiques pour les prix "Best Managed Agents $5k" et "Opus 4.7 Use" (25% de
la note).

### 🔴 Issue M4.5 (nouveau) — Extended thinking sur Investigator

**Scope.** Activer `thinking` sur l'agent loop Investigator (cf. M4.3).

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

**Streaming des `thinking_delta`.** À chaque chunk `thinking_delta` reçu de
l'Anthropic API, broadcaster via WSManager :
```python
await ws_manager.broadcast("thinking_delta", {
    "agent": "investigator",
    "content": chunk.thinking_delta.text,
    "turn_id": turn_id,
})
```

**Décision.** Budget 10k tokens suffit pour un RCA. Coûte ~5¢ par exécution avec
Opus 4.7. Activé uniquement sur Investigator (pas les autres agents — pas besoin).

**Pourquoi critique.** C'est la feature flagship Opus 4.7 vs Sonnet/Opus 4.6.
Sans ça, les juges ne voient pas de différence "pourquoi Opus 4.7 plutôt que
Sonnet ?". Le frontend (M8.5 Agent Inspector) streame le thinking en direct dans
un panel dédié → le juge **voit** Opus réfléchir. C'est LE wow factor.

**Acceptance.**
- [ ] `thinking_delta` events streamés pendant un run Investigator
- [ ] Frontend peut afficher le thinking en live (vérifié avec M8.5)

**Bloque.** Frontend M8.5 (Agent Inspector thinking tab).

---

### 🔴 Issue M4.6 (nouveau) — Agent-as-tool pattern (handoffs dynamiques)

**Scope.** Déclarer les autres agents comme tools que Investigator peut appeler.

**Problème actuel.** M4.3 propose `asyncio.create_task(run_work_order_generator(...))`
en fin d'Investigator — c'est un pipeline scripté. Les juges voient "orchestration
Python", pas "multi-agent".

**Décision.** Déclarer 2 tools locaux côté Investigator :

```python
ASK_KB_BUILDER_TOOL = {
  "name": "ask_kb_builder",
  "description": "Consulte le KB Builder pour obtenir un détail constructeur "
                 "non présent dans la KB actuelle (ex: torque max d'un boulon, "
                 "référence pièce introuvable).",
  "input_schema": {"type": "object", "properties": {
    "question": {"type": "string"},
    "cell_id": {"type": "integer"}
  }, "required": ["question", "cell_id"]}
}
```

Quand Investigator appelle `ask_kb_builder` :
1. `ws_manager.broadcast("agent_handoff", {from: "investigator", to: "kb_builder", reason: args.question})`
2. Spawn une session KB Builder courte (Messages API loop, system prompt spécialisé
   "tu réponds factuellement à une question de collègue agent")
3. Retourne la réponse comme `tool_result` à Investigator
4. `ws_manager.broadcast("agent_end", {agent: "kb_builder", ...})`

**Idem côté Q&A (M5.2).** Déclarer `ask_investigator` pour que Q&A délègue
les questions diagnostiques pointues.

**Pourquoi critique.** Sans ce pattern, le multi-agent est un workflow scripté.
Avec, les handoffs sont **décidés par les agents** via tool call. C'est le
critère différenciant pour le prix "Best Managed Agents".

**Minimum démo.** Au moins 2 handoffs dynamiques visibles :
- Scène 3 (Investigation) : Investigator → KB Builder pour chercher une référence pièce
- Scène 5 (Q&A) : Q&A → Investigator pour une question diagnostique

**Acceptance.**
- [ ] Investigator peut appeler `ask_kb_builder` et reçoit une réponse structurée
- [ ] Event `agent_handoff` broadcasté visible dans le WS stream
- [ ] Scénario démo P-02 fait au moins 1 handoff dynamique

**Bloque.** Pitch "Best Managed Agents" crédible.

---

### 🔴 Issue M5.4 (nouveau) — Q&A migration vers Claude Managed Agents

**Scope.** Remplacer l'agent loop Messages API du M5.2 par **Claude Managed Agents**.

**Problème actuel.** M5.2 implémente Q&A en Messages API loop classique. Or on vise
le prix **Best Managed Agents $5k** — il faut l'utiliser.

**Décision.** Q&A = seul agent en Managed Agents. Les 4 autres (Sentinel,
Investigator, KB Builder, Work Order Gen) restent Messages API + orchestrateur
maison + agent-as-tool. Raison : Q&A est interactif, stateful, long-running — le
cas d'usage idéal pour Managed Agents. Les autres n'en ont pas besoin.

**Implémentation.**
- Utiliser la Managed Agents SDK (custom tools)
- Tools exposés : les 14 MCP tools + `ask_investigator` (agent-as-tool)
- Streaming via WebSocket (voir contrat `WS /api/v1/agent/chat`)

**Fallback (M5.3 actuel).** Si Managed Agents instable → switch vers l'agent loop
Messages API écrit dans M5.2. 10 min de switch. Prévoir un feature flag
`USE_MANAGED_AGENTS=true/false` pour bascule rapide.

**Pourquoi critique.** Sans Managed Agents sur au moins 1 agent, aucune chance de
gagner le prix $5k dédié. L'implémentation est modérée (30–60 min de code).

**Acceptance.**
- [ ] Q&A répond via Managed Agents, streaming visible côté WS
- [ ] Fallback feature flag testé (switch OK en <5 min)
- [ ] Tools MCP accessibles depuis le Managed Agent

**Bloque.** Prix "Best Managed Agents $5k".

---

### 🔴 Issue M2.9 (nouveau) — UI tools generative (`render_*`) déclarés dans les agents

**Scope.** Ajouter dans les tools déclarés aux agents (en plus des 14 MCP tools
data) 9 tools "generative UI" que les agents invoquent pour émettre des
`ui_render` events visibles dans le chat.

**Pas d'implémentation Python.** Ces tools n'ont pas de code backend — ils sont
des **schémas** passés au LLM. Quand l'agent décide d'appeler `render_signal_chart`,
l'orchestrateur capture le `tool_use`, broadcast un event `ui_render`, et retourne
immédiatement un `tool_result` `"rendered"` sans effet de bord.

**Les 9 tools (cf. M8 frontend) :**

| Tool name | Used by | Props schema (summary) |
|---|---|---|
| `render_signal_chart` | Investigator, Q&A | `{signal_def_id, window_hours, mark_anomaly_at?, threshold?}` |
| `render_equipment_kb_card` | KB Builder, Q&A | `{cell_id, highlight_fields?}` |
| `render_work_order_card` | Work Order Gen | `{work_order_id, printable: true}` |
| `render_diagnostic_card` | Investigator | `{title, confidence, root_cause, contributing_factors[], pattern_match_id?}` |
| `render_correlation_matrix` | Investigator | `{sources[], impact_matrix[][]}` |
| `render_pattern_match` | Investigator | `{current_event, past_event_ref, similarity}` |
| `render_bar_chart` | Q&A | `{title, x_label, y_label, bars[]}` |
| `render_alert_banner` | Sentinel (auto-emit) | `{severity, cell_id, message, anomaly_id}` |
| `render_kb_progress` | KB Builder | `{steps[{label, status}]}` |

**Pourquoi critique.** Sans ces tools, Q&A / Investigator répondent en markdown
texte uniquement. Avec, le chat affiche inline des graphes, cards, diagnostics
**rendus par l'agent lui-même** — c'est le pattern Generative UI / Claude artifacts.
C'est ce qui rend la démo visuellement agentique et distingue ARIA d'un chatbot
classique.

**Implémentation.**
- Ajouter dans `backend/agents/ui_tools.py` les 9 schémas (type `dict`)
- Dans chaque agent loop, concaténer : `tools = mcp_tools + ui_tools + submit_tool`
- Dans le handler de `tool_use` : si `tool_name.startswith("render_")` →
  `ws_manager.broadcast("ui_render", {...})` + immédiatement `tool_result={"content": "rendered"}`

**Pattern d'intégration dans le system prompt de chaque agent :**
```
Pour rendre visuels tes résultats, tu peux appeler :
- render_signal_chart(...) pour afficher une courbe
- render_diagnostic_card(...) pour afficher ton diagnostic final
- ...
Appelle-les quand c'est plus parlant qu'une réponse texte.
```

**Acceptance.**
- [ ] Investigator émet `ui_render` pour `render_diagnostic_card` à la fin du RCA
- [ ] Q&A émet `ui_render` pour `render_signal_chart` si la question porte sur un signal
- [ ] Frontend (M7.5 + M8.1–M8.3) rend les composants correctement

**Bloque.** Frontend M7.5 (artifact registry), M8.1–M8.3 (artifacts individuels).

---

### 🟡 Bonus — Issue M4.7 (nouveau, P1) — Memory flex scene

**Scope.** L'Investigator doit charger `failure_history` du cell dans son contexte
et produire un RCA **visiblement plus rapide/précis au 2e diagnostic similaire**.

**Implémentation.**
- Au début du run Investigator : `past_failures = await get_failure_history(cell_id, limit=5)`
- Injecter dans le system prompt : "Pannes précédentes : {past_failures}. Si le
  pattern actuel matche une panne précédente, cite-la explicitement."
- Dans le RCA output, remplir `similar_past_failure` avec l'id du match

**Scène démo dédiée.** Route backend `POST /api/v1/demo/trigger-memory-scene` qui :
1. Insert une fausse entrée `failure_history` datée de 3 mois (pattern P-02)
2. Trigger une anomalie P-02 actuelle
3. L'Investigator match → RCA cite la panne passée

**Pourquoi intéressant.** Feature "l'agent apprend" mise en scène visuellement.
Prouve que la KB sert vraiment.

**Priorité.** P1 — bonus si reste du temps J6 PM. Si serré : skip, l'essentiel
c'est que l'Investigator utilise `failure_history` en contexte.

---

## Issues frontend — résumé

Les 4 milestones frontend (voir fichiers dédiés dans `docs/planning/M6-*/` à
`M9-*/`) dépendent directement de :

| Frontend issue | Dépend de backend |
|---|---|
| M6.4 WS client typé | M4.1 (WSManager) |
| M6.5 Chat shell mocké | aucun (mock) |
| M7.3 Anomaly banner | M4.1 + M4.2 (events `anomaly_detected`) |
| M7.4 Wire chat réel | M5.2 + M5.4 (WS /agent/chat) |
| M7.5 Artifact registry | M2.9 (ui_render tools déclarés) |
| M8.1–M8.3 Artifacts | M2.9 |
| M8.4 Activity Feed | M4.1 + M4.6 (handoffs) |
| M8.5 Agent Inspector + thinking | M4.5 (extended thinking) ⭐ |
| M8.6 Onboarding wizard | M3.2 + M3.3 (upload + session) |
| M9.3 Memory scene | M4.7 |

---

## Checklist décisions à valider ensemble J3 matin

Avant que l'un ou l'autre commence à coder, les deux doivent confirmer :

- [ ] **Architecture agents** : Q&A en Managed Agents + 4 autres en Messages API + orchestrateur maison — OK pour les deux ?
- [ ] **Agent-as-tool pattern** : Investigator a `ask_kb_builder`, Q&A a `ask_investigator` — OK ?
- [ ] **Extended thinking** : activé sur Investigator (budget 10k tokens) — OK ?
- [ ] **UI tools generative** : 9 `render_*` tools déclarés dans les agents — OK ?
- [ ] **Transport** : WebSocket pour `/events` et `/agent/chat` — OK ? (Décision retenue, cf. M4.1 et M5.2)
- [ ] **Event names** : liste finale ci-dessus — OK ou on ajoute/retire ?
- [ ] **Memory flex scene** : P1 bonus, skip si serré — OK ?

Une fois ces 7 points cochés, chacun code sa lane sans se bloquer.
