# M9 — Wow-factor visuels retenus pour la démo

> [!IMPORTANT]
> Notes prises le 24 avril 2026 pendant le pre-demo audit.
> Objectif : sortir du lot sans dépendre d'un perso 3D Three.js (trop risqué à 48h, hors-message produit).
> Stack imposée : SVG / Canvas / Framer Motion. **Pas de WebGL.**

---

## Pourquoi pas de Three.js / Sentinel mascotte

- Coût 1-2 jours, risque de bug live pendant la vidéo de 3 min.
- Dilue le message *"zero-config onboarding"* qui est l'angle ARIA.
- Cliché 2026 (déjà vu sur 30 démos Devin-like).
- Le jury Anthropic note *Impact 30 / Demo 25 / Opus 4.7 use 25 / Depth 20* —
  une mascotte 3D ne coche aucun critère.
- Le design plan v2 cible *operator-calm SaaS*, pas *agent playground*.

---

## Idées rejetées

### Plant Pulse (vue isométrique animée de la cellule)

> [!CAUTION]
> **Rejetée.** Demande de connaître les machines à l'avance et de modéliser
> chaque équipement de la station Guedila. **Conflit direct avec la promesse
> plug-and-play d'ARIA** : si la vue isométrique n'apparaît pas pour un nouvel
> équipement onboardé, le pitch s'effondre.

---

## Idées retenues

### 1. Agent Constellation (priorité 1)

**Pitch.** Un panneau plein écran (raccourci `A` pendant la démo) qui montre
en temps réel le **graphe vivant des agents** d'ARIA.

**Visuel.**
- `Sentinel` au centre.
- `Investigator`, `QA`, `KB-Builder`, `WO-Generator` en orbite.
- Quand un `agent_handoff` arrive sur le WS → une particule traverse l'arête
  émetteur → cible.
- Le nœud cible se met à pulser pendant qu'il "réfléchit".
- Le `thinking_delta` s'écrit en sous-titre live sous le nœud actif.
- Quand `work_order_ready` arrive → le nœud `WO-Generator` émet une carte
  qui glisse vers la liste WO (transition de layout).
- Compteurs live par agent : tool-calls / tokens / handoffs émis.

**Stack.**
- SVG + Framer Motion (`motion.circle`, `motion.path`, `AnimatePresence`).
- Réutilise `useAgentStream`, `useAnomalyStream`, `useWorkOrdersStream` (déjà câblés).
- Pas de lib graph (pas de d3-force, pas de cytoscape) — positions fixes en orbite.

**Estimation.** ~400 LOC, 1 jour.

**Pourquoi ça gagne.**
- Rend visible *l'orchestration multi-agent* → coche directement
  *Opus 4.7 Use (25%)* et *Depth (20%)*.
- Les juges Anthropic adorent voir le routage d'agents qu'ils ont conçu.
- C'est *la* slide qui prouve "this is not a chatbot".
- Démo-safe : si le WS ne reçoit rien, le graphe reste joli en idle.

**Fichiers à créer.**
- `frontend/src/features/agents/AgentConstellation.tsx`
- `frontend/src/features/agents/constellation/AgentNode.tsx`
- `frontend/src/features/agents/constellation/HandoffParticle.tsx`
- `frontend/src/features/agents/constellation/ThinkingTrail.tsx`
- Hotkey `A` dans `AppShell` (toggle overlay plein écran).

---

### 2. Cinématique d'arrivée des artifacts dans le chat (priorité 2)

**Pitch.** Quand un `ui_render` arrive sur le WS chat, la carte n'apparaît
pas — elle se **construit** sous les yeux du juge.

**Visuel par artifact.**
| Artifact          | Animation                                                                              |
|-------------------|----------------------------------------------------------------------------------------|
| `KbProgress`      | Remplit ses 5 phases une par une avec easing, checkmarks qui s'inscrivent.             |
| `DiagnosticCard`  | S'écrit ligne par ligne (typewriter sur les bullets RCA), badge confiance qui compte.  |
| `WorkOrderCard`   | Slide-in + tampon "WO-XXX SIGNED" qui s'imprime avec un léger rotate.                  |
| `PatternMatch`    | Deux cartes (incident actuel + incident passé) qui glissent et se "snappent" alignées. |
| `AlertBanner`     | Flash rouge bref + shake horizontal subtil, puis settle.                               |
| `BarChart`        | Barres qui poussent depuis 0 avec stagger.                                             |
| `SignalChart`     | (déjà OK — garder, ajouter draw progressif de la courbe).                              |
| `EquipmentKbCard` | (déjà OK — ajouter reveal des champs calibrés en cascade quand `onboarding_complete`). |

**Stack.**
- Framer Motion `layout`, `AnimatePresence`, `motion.div` avec `initial/animate/exit`.
- Un orchestrateur `useArtifactSequence` qui chaine les variants par étapes.
- Respect de `prefers-reduced-motion` (fallback : fade simple).

**Prérequis bloquant.** Les 6 artifacts doivent d'abord être **réels** (cf.
[M9-frontend-pre-demo-audit §4.1](../../audits/M9-frontend-pre-demo-audit.md#41-the-artifact-bundle-is-mostly-placeholder)
et issues M8.3). Sans ça, la cinématique habille du vide.

**Estimation.** ~200 LOC une fois les artifacts shippés, 0.5 jour.

**Pourquoi ça gagne.**
- Transforme la "generative UI" de claim en preuve.
- Fait *ressentir* l'agentique — on voit ARIA *produire* en direct.
- Démo-safe : si rien n'arrive, rien n'apparaît, pas de régression.

**Fichiers à toucher.**
- `frontend/src/artifacts/registry.tsx` (wrapper d'animation par artifact).
- `frontend/src/artifacts/_motion.ts` (variants Framer partagés).
- Chaque artifact réel pour exposer ses étapes d'apparition.

---

## Plan 48h proposé

1. **J1 matin** — finir les 6 artifacts placeholder (Tier 1 audit).
2. **J1 aprèm** — Agent Constellation (idée 1).
3. **J2 matin** — Cinématique artifacts (idée 2).
4. **J2 aprèm** — Mode Director (raccourci démo) + tournage vidéo 3 min.

---

## Stretch goals (si temps)

- **Time-Machine scrubber** — timeline en bas d'écran, scrub à T-72h pour voir
  le signal dériver et la pattern-match KB s'illuminer. Démontre la mémoire
  sans dépendre du `/demo/trigger-memory-scene`.
- **Splash WebGL 5s** en intro de vidéo seulement (pas dans l'app) — zoom sur
  la station puis cut sur l'app 2D. Punch cinéma sans risque runtime.

---

## Références

- [M9-frontend-pre-demo-audit.md](../../audits/M9-frontend-pre-demo-audit.md)
- [frontend/docs/DESIGN_PLAN_v2.md](../../../frontend/docs/DESIGN_PLAN_v2.md)
- [idea.md](../../../idea.md)
