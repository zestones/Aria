# M8 — Agentic Workspace (J5)

> Objectif : le cœur visuel du multi-agent — les 9 artifacts generative UI
> rendent, l'Activity Feed montre les agents collaborer, l'Agent Inspector
> streame le thinking d'Opus 4.7 en direct, l'onboarding wizard est complet.
> Fin J5 = flow démo cliquable end-to-end en local.

---

## Issue M8.1 — Artifact `SignalChart`

**Scope.** Composant graphique recharts rendu inline quand un agent émet
`ui_render(SignalChart, {...})`.

**Fichier.** `frontend/src/artifacts/SignalChart.tsx`

**Props.** `{signal_def_id: int, window_hours: int, mark_anomaly_at?: string, threshold?: number}`

**Comportement.**
- Fetch data via `GET /api/v1/signals/{signal_def_id}/trends?window=X` (TanStack Query)
- Recharts `AreaChart` avec :
  - Reference line threshold (dashed red)
  - Anomaly marker (X rouge) au timestamp `mark_anomaly_at`
  - Axis labels depuis unit KB (mm/s, °C, bar…)
  - Tooltip hover avec valeur exacte + timestamp
- Size compact (~320×180) fit dans une bulle chat
- Skeleton loading, toast on error

**Bloqué par.** M7.5 (registry)

**Acceptance.**
- [ ] Render via `ui_render` end-to-end
- [ ] Threshold + anomaly marker visibles si props fournis
- [ ] Skeleton pendant fetch, toast si échec

---

## Issue M8.2 — Artifact `EquipmentKbCard` (seuils éditables inline)

**Scope.** Card fiche équipement avec seuils calibrables par l'opérateur directement
dans le chat. **Démo clé** : claim "l'opérateur enrichit la KB".

**Fichier.** `frontend/src/artifacts/EquipmentKbCard.tsx`

**Props.** `{cell_id: int, highlight_fields?: string[]}`

**Comportement.**
- Fetch `GET /api/v1/equipment/{cell_id}/kb` (ou `/api/v1/kb/equipment/{cell_id}` selon route finale)
- Affiche : nom équipement, specs constructeur, **thresholds calibrés**, procédures (collapsed par défaut)
- Edit inline : click valeur → input → save via `PATCH` / `PUT` (route KB existante avec `structured_data` patch)
- Optimistic update + rollback si échec
- Fields dans `highlight_fields` → pulse ring accent

**Bloqué par.** M1.5 (KB repo update), M7.5

**Acceptance.**
- [ ] Edit threshold → persisté
- [ ] Highlight fields pulsent
- [ ] Sections collapse/expand

---

## Issue M8.3 — Artifacts bundle (WorkOrderCard + DiagnosticCard + CorrelationMatrix + PatternMatch + BarChart + AlertBanner + KbProgress)

**Scope.** 7 artifacts restants regroupés (pattern commun : card avec title + content + CTA optionnel).

**Fichiers.**
- `frontend/src/artifacts/WorkOrderCard.tsx`
- `frontend/src/artifacts/DiagnosticCard.tsx`
- `frontend/src/artifacts/CorrelationMatrix.tsx`
- `frontend/src/artifacts/PatternMatch.tsx`
- `frontend/src/artifacts/BarChart.tsx`
- `frontend/src/artifacts/AlertBanner.tsx`
- `frontend/src/artifacts/KbProgress.tsx`

**Détails par artifact.**

**WorkOrderCard** `{work_order_id, printable: true}` — résumé compact WO, badge priority, CTA "Open printable view" → nouvel onglet.

**DiagnosticCard** `{title, confidence, root_cause, contributing_factors[], pattern_match_id?}` — header avec confidence ring, facteurs bulletés, CTA "Generate work order".

**CorrelationMatrix** `{sources[], impact_matrix[][]}` — grid heatmap coloré par score.

**PatternMatch** `{current_event, past_event_ref, similarity}` — split card "Current / Past" + similarity score.

**BarChart** `{title, x_label, y_label, bars[]}` — recharts bar chart simple.

**AlertBanner** `{severity, cell_id, message, anomaly_id}` — bandeau compact inline chat (vs le banner global M7.3 qui est dans la control room).

**KbProgress** `{steps[{label, status}]}` — liste étapes avec spinner / checkmark (utilisé pendant parsing PDF).

**Bloqué par.** M7.5

**Acceptance.**
- [ ] 7 artifacts rendent via `ui_render`
- [ ] Respect tokens design system
- [ ] WorkOrderCard CTA ouvre PrintableWorkOrder (M9.1)

---

## Issue M8.4 — Agent Activity Feed

**Scope.** **Différenciateur agentic n°1.** Panel timeline temps réel qui montre
les agents collaborer. C'est ce qui fait qu'un juge réalise "ce n'est pas un
chatbot, c'est une équipe".

**Fichier.** `frontend/src/features/agents/ActivityFeed.tsx`

**Contenu.**
- Column dans le drawer chat (toggleable) ou panel sous le chat
- Row par event : agent color dot + name + action + timestamp
- Actions affichées :
  - `agent_start` → "{Agent} thinking..."
  - `tool_call_started` → "{Agent} calls: {tool_name}"
  - `tool_call_completed` → durée à côté
  - `agent_handoff` → "{From} → {To}: {reason}" avec animation `handoffSweep`
  - `agent_end` → finish reason
  - `anomaly_detected` → "Sentinel: Anomaly on {cell}"
- Rows persistent 5 min puis fade out
- Filter chips : `All` / `Sentinel` / `Investigator` / `KB Builder` / `Work Order` / `Q&A`

**Store.** `zustand frontend/src/store/agents.ts` — buffer circulaire des events.

**Bloqué par.** M6.4 (WS client), M4.1 + M4.6 (events + handoffs)

**Acceptance.**
- [ ] Events stream live
- [ ] Handoffs visuellement distincts (arrow sweep)
- [ ] Filter chips fonctionnels

---

## Issue M8.5 — Agent Inspector + thinking stream ⭐

**Scope.** **LA FEATURE WIN.** Panel drawer qui montre Opus 4.7 réfléchir en
direct (extended thinking streamed). Aucune autre équipe ne le montrera.

**Fichier.** `frontend/src/features/agents/AgentInspector.tsx`

**Structure.**
- Drawer bottom (40vh, ouvrable au click sur un agent row)
- 4 tabs : `Thinking` / `Tools used` / `Inputs & outputs` / `Memory`

**Thinking tab.**
- Stream des `thinking_delta` events en temps réel
- Rendu en font mono, couleur subtle grey-purple (différent du texte assistant)
- Auto-scroll bottom
- Spinner "thinking..." en fin de stream tant que l'agent n'a pas émis `agent_end`

**Tools used tab.**
- Liste des tool calls du turn : name, durée ms, expandable result

**Inputs & outputs tab.**
- JSON raw des messages passés à l'agent (dev-style, utile pour démo "inspect")

**Memory tab.**
- Liste des entries KB ou failure_history que l'agent a touché

**Bloqué par.** M4.5 (extended thinking backend), M4.1 (WSManager)

**Pourquoi critique.** C'est ce qui différencie Opus 4.7 vs Sonnet vs Opus 4.6
pour les juges. Score "Opus 4.7 Use" = 25% de la note. Sans ça, invisible.

**Acceptance.**
- [ ] Click agent → inspector ouvre
- [ ] Thinking streame live pendant un turn actif
- [ ] Pas d'obstruction control room / chat
- [ ] Close inspector n'interrompt pas l'agent

---

## Issue M8.6 — Onboarding wizard (PDF → KB Builder multi-turn → KB ready)

**Scope.** Scène 1 de la démo. Flow complet d'enrôlement équipement.

**Fichiers.**
- `frontend/src/features/onboarding/OnboardingWizard.tsx`
- `frontend/src/features/onboarding/MultiTurnDialog.tsx`

**Steps.**
1. **Parsing** — affiche `KbProgress` artifact pendant que KB Builder lit le PDF
   (appelle `POST /api/v1/kb/equipment/{cell_id}/upload`, poll status ou WS)
2. **Calibration** — dialogue multi-turn :
   - Frontend appelle `POST /api/v1/kb/equipment/{cell_id}/onboarding/start`
   - Backend retourne première question
   - Opérateur répond → `POST /.../onboarding/message` → question suivante
   - Répété 3–4 tours
3. **Ready** — final `EquipmentKbCard` avec seuils calibrés, CTA "Return to control room"

**Route.** `/onboarding/:session_id`

**Back button** sur chaque step (préserve progression locale).

**Bloqué par.** M6.6 (PdfUpload), M3.2 + M3.3 (endpoints backend onboarding)

✅ **DÉCIDÉ — sync request/response OK.** Le backend M3.3 fait du request/response
classique (pas de streaming des questions caractère par caractère). Acceptable
pour la démo — les questions arrivent instantanément, l'UX reste propre.

**Acceptance.**
- [ ] Upload PDF → parsing progress visible
- [ ] Questions multi-turn streamées, réponses POST back
- [ ] Final KB card affichée
- [ ] Return navigate vers `/control-room`

**Bloque.** Démo Scène 1.

---

## Bloque

- M9 (polish E2E, Scène 5)

## Bloqué par

- M7 (shell, registry, wire chat), backend M2.9 + M3.2 + M3.3 + M4.5 + M4.6 + M5.4
