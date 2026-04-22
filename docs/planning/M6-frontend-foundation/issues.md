# M6 — Frontend Foundation (J3)

> Objectif : poser les fondations du frontend (design system, app shell,
> WS client, chat shell mocké, upload PDF). Fin J3 = chat UI qui stream du
> contenu mocké, layout définitif, fondations réutilisables.
> Bloquant pour M7, M8, M9.

---

## Issue M6.1 — Installer les libs UI manquantes

**Scope.** Ajouter les dépendances nécessaires aux features J4–J6 : charts,
animation, markdown, PDF, state management.

**Dépendances.**
- `recharts` — charts (SignalChart, BarChart, sparklines KPI)
- `framer-motion` — animations (streaming, transitions, artifacts reveal)
- `react-markdown` + `remark-gfm` — rendu markdown dans les bulles chat
- `pdfjs-dist` — preview PDF dans OnboardingWizard
- `zustand` — store client (chat session, agents actifs, activity feed)
- `lucide-react` — icônes
- `qrcode` — QR code sur les work orders imprimables (dynamic import)

**Fichier.** `frontend/package.json` + `frontend/vite.config.ts` (worker pdfjs)

**Acceptance.**
- [ ] `npm run build` vert
- [ ] `npm run typecheck` vert
- [ ] `pdfjs` worker charge en dev
- [ ] `npm audit` sans warning critique

**Bloque.** M6.2 à M9.*

---

## Issue M6.2 — Design system foundation

**Scope.** Créer le système de design unique du projet : tokens CSS, fonts,
motion primitives, composants primitifs. **Dark mode uniquement pour v1.**

**Fichiers.**
- `frontend/src/design-system/tokens.css` — CSS vars (bg, fg, accent, status, agents)
- `frontend/src/design-system/motion.ts` — variants framer-motion
- `frontend/src/design-system/{Button,Card,Badge,Drawer,Tabs,StatusDot,KbdKey}.tsx` — primitives
- `frontend/src/design-system/icons.tsx` — re-export lucide
- `frontend/src/styles/index.css` — `@theme` Tailwind v4 bindings

**Tokens (valeurs retenues).**
```
--bg-base: #0a0e14        /* deep slate */
--bg-surface: #121821
--bg-elevated: #1a2130
--border: #232d3f
--fg-primary: #e4e9f2
--fg-muted: #8491a8
--fg-subtle: #52627a

--accent: #00d4ff          /* ARIA cyan industriel */
--accent-glow: #00d4ff40

--status-nominal: #10b981
--status-warning: #f59e0b
--status-critical: #ef4444

--agent-sentinel: #60a5fa
--agent-investigator: #a78bfa
--agent-kb-builder: #34d399
--agent-work-order: #fbbf24
--agent-qa: #f472b6
```

**Fonts.** Geist Sans (UI) + JetBrains Mono (data). `font-display: swap`.

**Motion variants.** `fadeInUp`, `streamToken`, `artifactReveal`, `anomalyPulse`,
`handoffSweep`. Timing commun : 220ms ease-out pour les entrées, respect
`prefers-reduced-motion`.

✅ **DÉCIDÉ — pas de Storybook.** Route debug `/design` qui liste les primitives
dans tous leurs états. Suffisant pour 5 jours de dev.

**Acceptance.**
- [ ] Zéro hex literal dans les composants (tous via vars)
- [ ] `/design` montre toutes les primitives
- [ ] `prefers-reduced-motion` coupe les animations destructrices (ripple, shake)

**Bloque.** Tout le reste du frontend.

---

## Issue M6.3 — App shell (topbar + control room area + chat drawer)

**Scope.** Layout unique qui héberge toute la démo.

**Structure.**
- Topbar fixe : logo ARIA, sélecteur équipement (P-01, P-02, Tank, …), `KpiBar`
  (placeholder ici, rempli M7.2), indicateur shift
- Main grid : control room (gauche) + chat drawer (droite, resizable 360–640px, collapsible)
- Drawer state persisté `localStorage`
- Keyboard shortcut : `cmd+k` toggle drawer / focus input
- Routes existantes conservées : `/login`, `/data` (admin debug)
- Nouvelle route par défaut : `/` redirect vers `/control-room`

**Fichiers.**
- `frontend/src/app/AppShell.tsx`
- `frontend/src/app/TopBar.tsx`
- `frontend/src/app/Drawer.tsx`
- `frontend/src/app/routes.tsx` (modifier)

**Acceptance.**
- [ ] Resize drawer persist entre reloads
- [ ] Toggle `cmd+k` fonctionne
- [ ] Viewport min 1280×800 supporté (machine démo)
- [ ] Topbar ne scroll jamais

**Bloque.** M7.1, M6.5

---

## Issue M6.4 — WebSocket client typé (dispatcher + reconnect)

**Scope.** Un client WS réutilisable pour les 2 endpoints backend (`WS /api/v1/events`
et `WS /api/v1/agent/chat`). Typé, avec reconnect exponentiel et cleanup propre.

**Fichiers.**
- `frontend/src/lib/ws.ts` — factory générique
- `frontend/src/lib/ws.types.ts` — event maps typés (cf. `docs/planning/ALIGNMENT.md`)
- `frontend/src/lib/ws.test.ts` — tests unit

**API cible.**
```ts
const events = createWsClient<EventBusMap>({
  url: "/api/v1/events",
  onEvent: (type, payload) => { ... },
  onError: (err) => { ... },
})
events.close() // cleanup
```

**Comportement.**
- Auto-reconnect exponentiel, max 3 retries, reset après 30s stable
- Abort propre sur unmount (`AbortController`)
- Parse JSON par message, dispatch sur `type` field
- Types forts : `EventBusMap` pour `/events`, `ChatMap` pour `/agent/chat`

✅ **DÉCIDÉ — auth via cookie.** Le navigateur envoie automatiquement `access_token`
dans le handshake WS (cf. M5.2). Pas de gestion token côté client ici.

**Acceptance.**
- [ ] Test : parse fixture multi-event → events typés corrects
- [ ] Test : reconnect déclenché après déconnexion
- [ ] Test : pas de leak (listeners nettoyés)

**Bloque.** M6.5, M7.3, M7.4, M8.4

---

## Issue M6.5 — Chat shell avec WS mocké

**Scope.** Construire le `ChatPanel` complet en bas du drawer (cf. M6.3) contre
un mock WS. Fin J3 = chat fonctionnel visuellement, prêt à brancher J4.

**Fichiers.**
- `frontend/src/features/chat/ChatPanel.tsx`
- `frontend/src/features/chat/MessageList.tsx`
- `frontend/src/features/chat/Message.tsx`
- `frontend/src/features/chat/ChatInput.tsx`
- `frontend/src/features/chat/mockWs.ts`
- `frontend/src/store/chat.ts`

**Composants.**
- `MessageList` : auto-scroll bottom, bouton "scroll to bottom" si l'user a scroll up
- `Message` : bulle user vs bulle agent ; badge agent coloré par `--agent-*`
- Streaming token-by-token fluide (rAF batching, pas de re-render par caractère)
- Markdown via `react-markdown` + `remark-gfm` (tables, code, blockquote)
- `ChatInput` : textarea auto-resize, enter send, shift+enter newline
- Mock WS : générateur local qui émet `agent_start`, `thinking_delta`, `text_delta`,
  `ui_render` (placeholder), `tool_call`, `done` avec timings réalistes

**Store zustand `chat.ts`.**
```
session_id: string
messages: ChatMessage[]
activeAgent: AgentId | null
isStreaming: boolean
```

**Scope OUT.**
- Pas encore d'artifact rendering (placeholder `[artifact: SignalChart]`)
- Pas encore de drawer thinking (text + thinking inline en 2 couleurs)
- Pas encore de vrai endpoint `/agent/chat` (mock seulement)

**Acceptance.**
- [ ] Envoi message → réponse streamée avec délais réalistes
- [ ] Tables markdown rendues
- [ ] Auto-scroll suit bottom sauf si user a scroll up
- [ ] Badge agent coloré
- [ ] `cmd+k` focus input

**Bloque.** M7.4 (wire vrai WS)

---

## Issue M6.6 — PDF upload component (shell)

**Scope.** Composant d'upload PDF minimal pour Scène 1 Onboarding. Le flux
complet (wizard multi-step) vient J5 avec M8.6.

**Fichiers.**
- `frontend/src/features/onboarding/PdfUpload.tsx`
- Route stub `/onboarding/:session_id` dans `routes.tsx`

**Fonctions.**
- Drag & drop + click to browse
- Validation : `.pdf` uniquement, 50 MB max (cf. limite backend M3.2)
- Preview première page via `pdfjs-dist`
- `POST /api/v1/kb/equipment/{cell_id}/upload` (multipart, field `file`)
- Sur succès : `navigate('/onboarding/{session_id}')`
- États : idle / uploading (spinner + abort) / error (message clair)

**Scope OUT.** Le wizard multi-step est M8.6.

**Acceptance.**
- [ ] Drop un PDF → preview → POST → redirect
- [ ] Rejet clair des non-PDF
- [ ] Spinner + abort pendant l'upload

**Bloqué par.** M3.2 (endpoint backend upload)

**Bloque.** M8.6 (wizard complet)

---

## Bloque

- M7 (control room, wire chat réel)
- M8 (artifacts, agentic UI)
- M9 (polish, E2E)

## Bloqué par

- Aucun (fondation)
