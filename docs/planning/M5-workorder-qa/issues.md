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
  `{title, description, recommended_actions: [step1, step2, ...], parts_required: [{ref, qty}], priority, estimated_duration_min, suggested_window_start, suggested_window_end}`"
- Agent loop (court — typiquement 2 tool calls : `get_equipment_kb` + `submit_work_order`)
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

## Bloque

- Scènes 4 (work order imprimable) et 5 (Q&A) de la démo
- Frontend Chat (M6)

## Bloqué par

- M1, M2, M4 (chaîne RCA → WO)
