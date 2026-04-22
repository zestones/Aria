# M9 — Polish & E2E (J6)

> Objectif : la démo 5 scènes tourne end-to-end sans crash sous 3 minutes,
> tout est poli visuellement, les fallbacks sont en place.
> Fin J6 = prête à filmer J7.

---

## Issue M9.1 — Work Orders console (list + detail + printable)

**Scope.** Le livrable tangible du système. Scène 4 de la démo : le juge imagine
un technicien repartir avec ce papier imprimé.

**Fichiers.**
- `frontend/src/features/work-orders/WorkOrderList.tsx`
- `frontend/src/features/work-orders/WorkOrderDetail.tsx`
- `frontend/src/features/work-orders/PrintableWorkOrder.tsx`

**Route.** `/work-orders` + `/work-orders/:id`

**Fonctions.**
- List : table avec filters priority/type/status/cell/date, sort par priority
- **WS live update** : écoute `WS /api/v1/events` → event `work_order_ready` →
  `queryClient.invalidateQueries(['work-orders'])` pour rafraîchir la liste en
  temps réel sans reload. Event `rca_ready` → badge RCA disponible apparaît sur
  la row concernée.
- Detail : tous les champs depuis `GET /api/v1/work-orders/{id}` incluant `rca_summary`,
  `recommended_actions`, `parts_required`
- Printable : CSS `@media print`, layout A4, QR code WO id (via `qrcode` dynamic import)
- Bouton "Print" → `window.print()`

**Acceptance.**
- [ ] Filtres et sort fonctionnels
- [ ] Quand Sentinel crée un WO → apparaît dans la liste en < 5s (sans reload)
- [ ] Quand Investigator finit → badge RCA s'affiche sur la row en live
- [ ] Detail page rend tous les champs
- [ ] Print preview pro (no chrome, black on white, hiérarchie claire)

**Bloqué par.** M1.2 + M1.6 (colonnes work_order), M5.1 (WO Gen backend)

**Bloque.** Démo Scène 4.

---

## Issue M9.2 — Motion polish pass

**Scope.** Pass complet sur le feel animations. C'est ce qui transforme
"démo fonctionne" en "démo mémorable".

**Audit à faire sur toutes les features.**
- Streaming tokens chat : smooth token-by-token (rAF batching, pas de jitter)
- Artifact reveal : `artifactReveal` variant, timing cohérent (220ms ease-out)
- Agent handoff : `handoffSweep` arrow entre badges agents (Activity Feed)
- Anomaly on P-02 : pulse + ripple + flash screen 150ms red (subtil)
- Thinking stream : fade-in drawer Agent Inspector
- Route transitions : View Transitions API (React 19) si supporté
- `prefers-reduced-motion` respecté (kill ripple/shake, garde fades)

**Acceptance.**
- [ ] 60fps toutes scènes (DevTools Performance, no long task >50ms)
- [ ] Reduced-motion testé
- [ ] Pas de motion sickness (shakes <300ms, rien de destructif)

**Priorité.** P1 — skip si J6 soir trop serré.

---

## Issue M9.3 — Memory flex scene (UI)

**Scope.** Scène dédiée démo pour prouver que l'agent apprend. 2e diagnostic
visiblement plus rapide grâce à `failure_history`.

**Fichier.** `frontend/src/features/demo/MemoryScene.tsx`

**Route (cachée).** `/demo/memory`

**UI.**
- Bouton "Replay" → POST vers endpoint backend M4.7 qui trigger le scénario
- Split view : "Past event (3 months ago)" vs "Current event"
- Investigator output side-by-side : 1er diagnostic time vs 2e diagnostic time
- Badge "Pattern match: 92% similarity" avec lien vers l'entry `failure_history`

**Bloqué par.** M4.7 (backend memory scene)

**Priorité.** P1 — bonus si ok côté backend. Sinon scène coupée de la démo.

**Acceptance.**
- [ ] Bouton Replay déclenche le scénario backend
- [ ] Split comparaison clair
- [ ] Time-to-diagnosis visible plus bas au 2e run

---

## Issue M9.4 — E2E demo rehearsal (P-02 scripted)

**Scope.** Jouer la démo 5 scènes en conditions réelles, chronométrer, noter
les bugs, stabiliser.

**Prérequis.** Simulator tourne en mode `demo` → scénario P-02 compressé ~4 min.

**Procédure.**
- Lancer les 5 scènes en séquence (cf. idea.md §8) :
  1. Onboarding pump P-02 (45s target)
  2. Anomaly detection (45s)
  3. Investigation RCA (45s) — **scène clé, thinking stream visible**
  4. Work order généré + printable (30s)
  5. Q&A ("Night shift failures more frequent?") (15s)
- Chaque scène sous son budget
- Fallback par scène : si agent hang >15s, switch vers réponse pré-enregistrée

**Livrable.** `docs/DEMO.md` — script scène-par-scène avec timings + captures + fallbacks.

**Top 5 bugs** : noter et fixer en priorité.

**Acceptance.**
- [ ] Démo 5 scènes sous 3 minutes
- [ ] Zéro crash
- [ ] Fallback déclenché en simulant une panne backend

**Bloque.** M10 (submission).

---

## Bloque

- M10

## Bloqué par

- M7 + M8 (toutes les features UI), backend M4.7 (memory scene bonus)
