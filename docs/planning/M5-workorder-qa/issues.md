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
- Tools : `tools = await mcp_client.get_tools_schema() + UI_TOOLS + [ASK_INVESTIGATOR_TOOL]`
  (M5.2 est le fallback impl des M5.4 Managed Agents — même toolset)
- Sur message client `{type: "user", content: str}` :
  - Append au history
  - Lance agent loop avec tools + Anthropic streaming
  - Pour chaque event reçu de l'API Anthropic :
    - Si `content_block_delta` text → envoie `{type: "text_delta", content: ...}` au client
    - Si `tool_use` block avec `render_*` → broadcast `ui_render` + envoie `{type: "ui_render", component, props}` au client
    - Si `tool_use` block avec `ask_investigator` → broadcast `agent_handoff` + spawn mini-session Investigator
      + envoie `{type: "agent_handoff", from: "qa", to: "investigator", reason}` au client
    - Si `tool_use` autre → envoie `{type: "tool_call", name, args}` + appelle `mcp_client.call_tool()`
      + envoie `{type: "tool_result", name, ...}`
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

## Issue M5.4 — Q&A migration vers Claude Managed Agents

> Ajoutée après alignement front/back. Contexte complet dans `docs/planning/ALIGNMENT.md`.

**Scope.** Remplacer l'agent loop Messages API du **M5.2** par **Claude Managed
Agents** (custom tools). Le M5.2 actuel devient le fallback (M5.3 carte de triche).

**Problème actuel.** M5.2 implémente Q&A en agent loop classique Messages API +
streaming Anthropic standard. Correct mais on rate le prix **Best Managed Agents
\$5k** qui est la raison d'être du pattern. Il faut au minimum 1 agent en
Managed Agents pour cocher la case.

**Décision.** Q&A = **seul** agent en Managed Agents. Les 4 autres (Sentinel,
Investigator, KB Builder, Work Order Gen) restent en Messages API + orchestrateur
maison + agent-as-tool (cf. M4.6). Raison : Q&A est interactif, stateful,
long-running — cas d'usage idéal. Les autres n'en ont pas besoin.

**Implémentation.**
- Utiliser la Claude Managed Agents SDK (custom tools)
- Tools exposés au Managed Agent :
  - Les 17 MCP tools (via `mcp_client.get_tools_schema()`)
  - `ask_investigator` (agent-as-tool cf. M4.6)
  - Les `render_*` generative UI tools (cf. M2.9)
- Streaming vers le frontend via `WS /api/v1/agent/chat` (cf. contrat `ALIGNMENT.md`)
- System prompt : identique à M5.2 ("Tu es ARIA, assistant maintenance...")
- Session stateful maintenue côté Managed Agents (plus besoin de `messages: list` manuel)

**Fallback.** Feature flag `USE_MANAGED_AGENTS=true/false` dans `.env`. Si Managed
Agents KO en démo → bascule à `false` → Q&A retombe sur l'agent loop M5.2
(code pas supprimé, juste contourné). Switch testable en <5 min.

✅ **DÉCIDÉ — Managed Agents pour Q&A uniquement.** Pas les 4 autres. Faire tourner
5 agents en Managed Agents est over-engineered et risqué. 1 seul Managed Agent +
4 agents loop Messages API + pattern agent-as-tool = le bon compromis (cf.
discussion Discord J3 13h45).

**Pourquoi critique.** Sans ça, aucune chance de gagner le prix **Best Managed
Agents \$5k**. L'implémentation est modérée (30–60 min) et le fallback existe
déjà (M5.2 devient le plan B).

**Acceptance.**
- [ ] Q&A répond via Managed Agents, streaming visible côté WS
- [ ] Fallback testé : `USE_MANAGED_AGENTS=false` → Q&A tourne sur M5.2 sans break
- [ ] Les 17 MCP tools accessibles depuis le Managed Agent
- [ ] `ask_investigator` appelable par le Managed Agent (vérifié avec M4.6)

**Bloque.** Éligibilité prix "Best Managed Agents \$5k".

---

## Bloque

- Scènes 4 (work order imprimable) et 5 (Q&A) de la démo
- Frontend Chat (M7.4 wire vrai WS)

## Bloqué par

- M1, M2, M4 (chaîne RCA → WO, M4.6 pour `ask_investigator`, M2.9 pour UI tools)
