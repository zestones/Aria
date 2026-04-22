# M5 — Work Order Generator + Q&A

> Objectif : compléter la chaîne agent (RCA → work_order actionnable) et offrir une
> interface conversationnelle Q&A en streaming pour la scène 5 de la démo.

---

## Issue M5.1 — Work Order Generator agent

**Scope.** `backend/agents/work_order_generator.py` :
- `async def run_work_order_generator(work_order_id: int) -> None`
- Charge work_order (avec `rca_summary`) + cell + KB
- User message : "RCA: <rca_summary>. Génère un work order actionnable basé sur la
  KB de l'équipement (procedures + parts disponibles)."
- System prompt : "Tu génères des work orders de maintenance. Tu as accès à la KB
  équipement via tools. Output JSON via `submit_work_order(...)` :
  `{title, description, recommended_actions: [step1, step2, ...], parts_required: [{ref, qty}], priority, estimated_duration_min, suggested_window_start, suggested_window_end}`. Après soumission, appelle `render_work_order_card(work_order_id, printable: true)` pour l'afficher en chat."
- Tools : `tools = await mcp_client.get_tools_schema() + UI_TOOLS + [SUBMIT_WORK_ORDER_TOOL]`
  (UI_TOOLS cf. M2.9 — utilise `render_work_order_card` ; SUBMIT_WORK_ORDER_TOOL déclaré inline comme `SUBMIT_RCA_TOOL`)
- Agent loop (court — typiquement 2–3 tool calls : `get_equipment_kb` + `submit_work_order` + `render_work_order_card`)
- UPDATE work_order avec les champs structurés
- `ws_manager.broadcast("work_order_ready", ...)`

> ✅ **DÉCIDÉ — garder séparé.** Le critère hackathon "5 agents orchestrés" est
> non-négociable, c'est un argument clé du pitch. La séparation permet aussi de
> ré-exécuter `run_work_order_generator(work_order_id)` manuellement depuis le
> frontend ("Re-générer le work order") — cas d'usage crédible à montrer en démo
> si on a 30s. Fallback fusion *seulement* si bug bloquant J6 après-midi.

**Acceptance.**
- [ ] Après Investigator → work_order a `recommended_actions`, `parts_required`,
  `priority`, `suggested_window_*` non-nulls
- [ ] Status passe à `'open'`

---

## Issue M5.2 — Q&A WebSocket endpoint

**Scope.** `backend/agents/qa_agent.py` + route dans `main.py` :
- `WS /api/v1/agent/chat`
- Stateful per connection : maintient `messages: list` côté serveur
- Sur message client `{type: "user", content: str}` :
  - Append au history
  - Lance agent loop avec `MCPClient` tools + Anthropic streaming
  - Pour chaque event reçu de l'API Anthropic :
    - Si `content_block_delta` text → envoie `{type: "text_delta", content: ...}` au client
    - Si `tool_use` block → envoie `{type: "tool_call", name, args}` puis appelle
      `mcp_client.call_tool()` puis envoie `{type: "tool_result", name, ...}`
  - À end_turn → envoie `{type: "done"}`

**System prompt.** "Tu es ARIA, assistant maintenance. Réponds aux questions de
l'opérateur sur ses équipements en utilisant les tools. Cite toujours les sources
(KB, logbook, signaux, RCA passés)."

> ✅ **DÉCIDÉ — frontend gère le multi-tour.** Le `ChatPanel` (M6.5) affiche les
> blocs dans l'ordre reçu : `text_delta` accumule dans une bulle assistant en
> cours, `tool_call` crée une carte collapsable inline, `tool_result` enrichit la
> carte, puis nouveau `text_delta` crée une nouvelle bulle. Événement `done` libre
> l'input. Pattern éprouvé (Claude.ai, Cursor) — pas de risque.

> ✅ **DÉCIDÉ — auth via cookie + decode manuel.** Au handshake :
> ```python
> token = ws.cookies.get("access_token")
> try:
>     payload = decode_jwt(token)
>     user_id = payload["sub"]
> except Exception:
>     await ws.close(code=4401)
>     return
> await ws.accept()
> ```
> Helper réutilisable `core/security/ws_auth.py` (même fonction utilisée par
> `WS /api/v1/events` en M4.1).

**Acceptance.**
- [ ] `wscat -c ws://localhost:8000/api/v1/agent/chat` (avec cookie auth) →
  question "OEE de la pompe P-02 ce mois ?" → stream texte cohérent + tool_call
  `get_oee` visible

---

## Issue M5.3 — Q&A REST fallback (carte de triche)

**Scope.** Endpoint `POST /api/v1/agent/chat` non-streaming, prend `{messages: [...]}`
et retourne `{response, tool_calls: [...]}`.

> ✅ **DÉCIDÉ — SKIP par défaut.** Pas d'implémentation tant que M5.2 (WS) n'est
> pas testé KO. Le streaming WebSocket est *le* wow effect de la démo Q&A — sans
> lui, le pitch perd un argument. À ressortir uniquement comme carte de triche J6
> matin si bug WS impossible à fixer en 1h.

---

## Issue M5.4 🔴 — Q&A migration vers Claude Managed Agents

**Scope.** Remplacer l'agent loop Messages API du M5.2 par **Claude Managed
Agents** sur le seul agent Q&A. Sans ça, aucune chance de gagner le prix dédié
**Best Managed Agents $5k**.

**Périmètre clair.**
- Q&A = seul agent en Managed Agents (interactif, stateful, long-running —
  cas d'usage idéal)
- Sentinel, Investigator, KB Builder, Work Order Gen restent en Messages API
  + orchestrateur maison + agent-as-tool (cf. M4.6)

**Implémentation.**
- Utiliser la Managed Agents SDK (custom tools)
- Tools exposés : les 14 MCP tools + `UI_TOOLS` (cf. M2.9) + `ask_investigator`
  (cf. M4.6)
- Streaming via WebSocket `/api/v1/agent/chat` (même contrat que M5.2)
- L'état conversationnel est géré par Managed Agents côté Anthropic — plus
  besoin du dict `messages` per-connection en mémoire

**Feature flag.** `USE_MANAGED_AGENTS=true|false` dans `core/config.py`.
- `true` (défaut J6) → route `/agent/chat` utilise Managed Agents
- `false` → route `/agent/chat` utilise l'impl Messages API du M5.2

Le handler WS choisit l'impl au runtime. Switch testable en < 5 min : changer
l'env var, restart backend.

**Pourquoi M5.2 reste implémenté.** M5.2 = filet de sécurité garanti.
Managed Agents est nouveau dans l'écosystème — si bug, instabilité SDK, ou
rate limit pendant la démo, on bascule en 1 commande.

**Acceptance.**
- [ ] Q&A répond via Managed Agents avec streaming WS visible
- [ ] Tools MCP accessibles depuis le Managed Agent (au moins 1 tool call par
  question complexe)
- [ ] Feature flag testé → switch Managed Agents ↔ Messages API en < 5 min
- [ ] Latence p50 réponse complète < 8s pour question type "OEE pompe P-02 ?"

**Bloque.** Prix "Best Managed Agents $5k".

---

## Bloque

- Scènes 4 (work order imprimable) et 5 (Q&A) de la démo
- Frontend Chat (M6)
- Prix "Best Managed Agents" (via M5.4)

## Bloqué par

- M1, M2, M4 (chaîne RCA → WO)
- M2.9 (UI tools pour Q&A enrichi)
- M4.6 (`ask_investigator` agent-as-tool pour handoffs Q&A → Investigator)
