# M7 — Control Room & Backend Wire (J4)

> Objectif : le P&ID industriel est animé et live, les KPIs tournent, le chat
> parle au vrai backend, et le dispatcher d'artifacts generative UI est prêt
> à rendre les composants émis par les agents.
> Fin J4 = control room vivante + premier artifact rendu depuis un vrai agent.

---

## Issue M7.1 — P&ID diagram animé (SVG)

**Scope.** Canvas principal de la salle de contrôle : diagramme Piping &
Instrumentation (SVG pur) représentant la ligne P-02 réelle.

**Fichiers.**
- `frontend/src/features/control-room/PidDiagram.tsx`
- `frontend/src/features/control-room/EquipmentNode.tsx`
- `frontend/src/features/control-room/FlowEdge.tsx`
- `frontend/src/features/control-room/EquipmentInspector.tsx`

**Éléments visuels.**
- Nodes : Tank, P-01, P-02, Valve, Outlet (cohérent avec seed P-02 / scénario démo)
- Edges animées : `stroke-dashoffset` keyframes → effet "flux qui coule"
- Status par node : nominal (glow emerald) / warning (pulse amber) / critical (ripple red + shake)
- Click node → `EquipmentInspector` drawer gauche : signaux 10 derniers points, KB badge, derniers WO

**Data sources.**
- `GET /api/v1/monitoring/status/current` (poll 2s via TanStack Query)
- `GET /api/v1/signals/current`
- Sur `anomaly_detected` event (WS `/events`) → node concerné passe `critical` + `anomalyPulse`

✅ **DÉCIDÉ — SVG pur, pas de three.js.** Décision validée Discord J3 matin avec
zestones (risque 3D trop haut pour 1 journée). Langage visuel P&ID = ce que les
vrais opérateurs industriels connaissent → argument crédibilité pour les juges.

**Acceptance.**
- [ ] 5 nodes rendent et s'update depuis l'API live
- [ ] Flow edges s'animent en continu
- [ ] Anomalie P-02 → état rouge visible + ripple
- [ ] Click node → inspector affiche signaux + KB badge
- [ ] 60fps sur MacBook 2020 (vérifié DevTools Performance)

**Bloqué par.** M6.2 (design system), M6.3 (app shell)

**Bloque.** Démo Scène 2.

---

## Issue M7.2 — KPI bar live (OEE, MTBF, MTTR, anomalies 24h)

**Scope.** Strip de KPIs dans la topbar. Tourne 24/7 → preuve "système vivant".

**Fichier.** `frontend/src/features/control-room/KpiBar.tsx`

**Contenu.**
- 4 tuiles compactes : OEE %, MTBF h, MTTR min, Anomalies 24h
- Chaque tuile : label + valeur + sparkline recharts (dernières 24h)
- Refresh 15s via TanStack Query
- Flash subtil accent color sur changement de valeur

**Data sources.**
- `GET /api/v1/kpi/oee`, `/kpi/mtbf`, `/kpi/mttr`
- `GET /api/v1/signals/anomalies?window=24h` (ou équivalent existant)

**Acceptance.**
- [ ] 4 tuiles visibles dans topbar
- [ ] Sparklines rendent
- [ ] Values update sans flicker de re-render

**Bloqué par.** M6.3

---

## Issue M7.3 — Anomaly banner real-time

**Scope.** Banner sticky sous la topbar quand anomalie active. Sentinel doit être
visible en < 500ms dès détection.

**Fichier.** `frontend/src/features/control-room/AnomalyBanner.tsx`

**Comportement.**
- Écoute `WS /api/v1/events` → event `anomaly_detected`
- Affichage : severity color (amber/red), nom équipement, message court,
  timestamp relatif ("just now", "2 min ago")
- CTA "Investigate" → ouvre chat drawer + prefill input + envoi auto
- Dismiss (×) masque localement, revient si nouvel event
- Multi-anomalies : banner affiche le dernier + compteur "+2 more"

**Bloqué par.** M6.4 (WS client), M4.1 + M4.2 (WSManager + Sentinel broadcast)

**Acceptance.**
- [ ] Event Sentinel → banner apparaît
- [ ] CTA Investigate déclenche chat session pré-contextualisée
- [ ] Compteur "+N more" si anomalies multiples

**Bloque.** Démo Scène 2.

---

## Issue M7.4 — Wire ChatPanel au vrai WS `/api/v1/agent/chat`

**Scope.** Remplacer le mock WS (M6.5) par la connexion réelle Q&A backend.

**Fichiers modifiés.**
- `frontend/src/features/chat/ChatPanel.tsx`
- `frontend/src/store/chat.ts`

**Fichiers supprimés.**
- `frontend/src/features/chat/mockWs.ts`

**Comportement.**
- Ouvre connexion WS au mount du ChatPanel (auth cookie auto via handshake)
- Handle tous les event types du contrat `ALIGNMENT.md` : `user`, `text_delta`,
  `thinking_delta`, `tool_call`, `tool_result`, `ui_render`, `agent_handoff`, `done`
- Error handling : network drop → reconnect exponentiel M6.4 / 401 → refresh token
- `session_id` persisté zustand + localStorage

**Scope OUT.**
- Rendering des artifacts reste placeholder jusqu'à M7.5

**Acceptance.**
- [ ] Message envoyé → stream réel backend reçu
- [ ] Agent name badge se met à jour sur `agent_start` / `agent_handoff`
- [ ] Tous les events loggés en dev console

**Bloqué par.** M6.5 (shell chat), M5.2 + M5.4 (WS `/agent/chat` live)

---

## Issue M7.5 — Artifact registry + dispatcher

**Scope.** Infrastructure qui permet au chat d'afficher des composants React
inline quand le backend émet un event `ui_render`. C'est le cœur de la
Generative UI d'ARIA.

**Fichiers.**
- `frontend/src/artifacts/registry.ts` — map `{componentName: ReactFC}`
- `frontend/src/artifacts/ArtifactRenderer.tsx` — lookup + error boundary
- `frontend/src/artifacts/schemas.ts` — Zod schemas pour chaque artifact props

**Comportement.**
- Reçoit `ui_render` event `{component, props, turn_id}` depuis WS
- Look up dans le registry → rend le composant (error boundary)
- Validation Zod des props à runtime → fallback "artifact error" si invalide
- Unknown component → fallback "unknown artifact: X"
- Chaque artifact wrappé dans `artifactReveal` motion variant
- Placement dans `Message` : les artifacts s'insèrent inline dans l'ordre d'arrivée
  entre les `text_delta` bubbles

**Scope OUT.**
- Les 9 artifacts individuels sont les issues M8.1 à M8.3

**Bloqué par.** M2.9 (tools `render_*` déclarés backend)

**Acceptance.**
- [ ] Backend émet `ui_render` avec nom enregistré → artifact rend
- [ ] Nom inconnu → fallback, chat ne crash pas
- [ ] Props invalides → error boundary, session continue
- [ ] Artifacts s'animent en entrée

**Bloque.** M8.1, M8.2, M8.3

---

## Bloque

- M8 (artifacts rendering), M9 (polish E2E)

## Bloqué par

- M6 (foundation), M2.9 (ui_render tools backend), M4.1 (WSManager), M5.4 (Q&A Managed Agents)
