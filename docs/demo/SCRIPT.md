# ARIA — Script Voix-Off Final (v5)

> Version grand public. Zero jargon. Comprehensible par n'importe qui.
> 3:00 strict · Anglais · Voice-over AI (Heygen ou ElevenLabs) OU voix reelle Adam (decision pending)
>
> **v5 — aligne sur la branche `133-m95-full-frontend-polish` au 2026-04-24 21h (13 commits apres v4) :**
> - DashboardPage remplace ControlRoomPage sur `/control-room` — landing operateur avec hero shift + KPI tiles + top anomalies + top WOs + logbook recent
> - Equipment grid (5 tiles machines) extrait vers `/equipment`
> - Shifts feature live (`/shifts`) avec Karim/Amina/Yacine/Samir navigables
> - ActivityFeed supprimee (-312 LOC) — plus d'arriere-plan agent-stream, le Constellation reste le wow-factor
> - `/design` et `/data` supprimes des routes publiques
> - SessionsMenu dans chat (session management)

---

## Regle d'or appliquee a chaque ligne
> **The Grandparent Test.** Si ma grand-mere comprend pas pourquoi c'est impressionnant, la ligne est ratee.
> Corollaire : si elle comprend pas ce que fait la machine, le nom est rate aussi.

---

## ACT I — Le probleme (0:00–0:30)

**0:00–0:05**
*"In every factory, every plant, every water station in the world — there's one person who knows."*

> [Visuel : technicien senior qui ecrit a la main sur une fiche, bruit d'usine]

---

**0:05–0:15**
*"He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever."*

> [Visuel : machines d'usine, cables, panneaux de controle, le classeur papier]

---

**0:15–0:30**
*"Companies have tried to fix this for ten years. The software exists. But setting it up costs half a million dollars and takes six months of specialists. So ninety-five percent of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Powered by Claude Opus 4.7."*

> [Logo ARIA apparait + tagline "Adaptive Runtime Intelligence for Industrial Assets"]
> `[ANNOTATION : "95% of sites · $500K · 6 months"]`

---

## ACT II — ARIA en action (0:30–2:40)

### Scene 1 — Onboarding a new machine (0:30–0:55)

**0:30–0:40**
*"This is a water-bottling plant in southern Algeria. Five machines, serving fifty thousand people. And today, a new machine comes online — the Bottle Labeler."*

> [Visuel : Dashboard `/control-room` visible brievement pour poser le contexte (shift header avec operateur du jour, 5 tiles EquipmentGrid). Puis navigation vers `/onboarding`. EquipmentBootstrap propose la creation du Bottle Labeler.]

---

**0:40–0:55**
*"You drop in its manual — the PDF that came in the box. ARIA reads the whole thing with Opus 4.7 vision. Then it asks you three questions. Not a consultant. Not a form. Just: what do you actually see on this machine every day?"*

> [Drag & drop PDF. 5-phase progress : "Validating PDF / Reading pages with Opus vision / Extracting thresholds / Validating schema / Saving KB". MultiTurnDialog apparait.]
> `[ANNOTATION : "Opus 4.7 vision · 1M context window"]`

*"In under two minutes, the Labeler is live."*

---

### Scene 2 — ARIA predicts (0:55–1:15) ⭐ PREDICTIVE HOOK

**0:55–1:05**
*"The next morning, the shift operator logs in. This is their dashboard. And ARIA has already flagged something. Top of the anomaly card: Bottle Filler, motor shake rising."*

> [Hero shot Dashboard `/control-room` : hero strip avec "Current shift: Amina Haddad — day shift", KPI tiles KPIBar, card "Open anomalies (top 5)" avec "Bottle Filler · forecast breach in 2 hours" en tete de liste. Card AnomalyBanner visible en overlay via `useAnomalyStream`.]

---

**1:05–1:15**
*"ARIA doesn't wait for the breach. It forecasts it. Two hours before the Filler would actually cross the safe limit, a warning fires. This is a prediction, not an alarm."*

> [Click sur l'anomaly card → focus sur le Bottle Filler. SignalChart avec forecast overlay OLS visible.]
> `[ANNOTATION : "Predictive, not reactive. ARIA sees drift before it becomes failure."]`

---

### Scene 3 — Investigation (1:15–2:05) ⭐ HERO SCENE

**1:15–1:25**
*"A few minutes later, the real breach hits. Motor shake crosses the safe limit. Sentinel catches it. But ARIA doesn't just send an alert and leave. Watch what happens next."*

> [Forecast banner turns into AnomalyBanner red. Click on it → Inspector drawer opens. Header "Opus 4.7 · Extended thinking · Managed Agent".]

---

**1:25–1:55**
*"The Investigator is thinking. That's extended thinking on Opus 4.7 — you are watching the reasoning live. It reads the maintenance log written by Karim at 2am — the night shift operator wrote 'unusual noise'. The repair history — that same bearing was replaced nineteen hundred hours ago. The motor temperature, which has been creeping up eight degrees over the past week. It connects the dots."*

> [Gros plan texte : thinking stream defile. Phrases visibles : "Logbook entry by Karim Belkacem (night shift)... bearing replacement 1900h ago... temperature delta +8°C... vibration signature matches..." Tool calls collapsible (ToolCallRow) visibles : `get_logbook_entries`, `get_failure_history`, `get_signal_trends`. Shift header discret montre "Karim — night shift 22:00-06:00".]
> `[ANNOTATION : fleches vers "Logbook · Repair history · Temperature · Vibration"]`

---

**1:55–2:05**
*"What would take a senior technician an hour to piece together — Opus 4.7 does in seconds. Bearing wear on the Filler drive motor. Eighty-seven percent confidence."*

> [DiagnosticCard apparait : "Bearing wear — discharge side · 87% confidence · Predicted MTTF: 14 hours". Bouton "View generated work order" visible.]

---

### Scene 4 — The repair order (2:05–2:25)

**2:05–2:15**
*"Then it writes the repair order. Not a generic recommendation. The exact steps. The exact part."*

> [Click "View generated work order" → WorkOrderDetail. Badge HIGH priority. Actions list. Parts: "1x bearing 6205-2RS". Failure-history strip visible : "Similar incidents: 2 on Filler, 1 on Capper — Jan 2026".]

---

**2:15–2:25**
*"Bearing 6205-2RS. ARIA found that reference in the manual. Karim walks out with a printed sheet and knows exactly what to do."*

> [Click Print → PrintableWorkOrder A4 avec QR code. Layout propre, noir sur blanc.]

---

### Scene 5 — Memory recall (2:25–2:40) ⭐ MEMORY BEAT

**2:25–2:35**
*"Now watch this. Another anomaly — on the Bottle Capper this time. And ARIA remembers."*

> [AnomalyBanner sur le Capper. Click → Inspector. Pattern Match card apparait.]

---

**2:35–2:40**
*"It saw this same pattern on the Capper in January — Samir, the shift supervisor, closed that incident. Now ARIA is predicting four hours to failure and telling the operator exactly what fixed it last time."*

> [PatternMatch card : "Same pattern as Capper incident, Jan 2026 · predicted MTTF 4h · recommended action: replace roller bearing · closed by Samir Ouazene".]
> `[ANNOTATION : "Memory hit — recognised from failure 3 months ago"]`

---

## ACT III — L'orchestration (2:40–3:00)

**2:40–2:55** — **SCREEN-RECORD AGENT CONSTELLATION LIVE**

*"Behind all of this — five AI agents on Claude Managed Agents, talking to each other through an MCP server. Sentinel watches the signals. Investigator reasons. KB Builder reads manuals. Work Order Generator writes repairs. Q&A answers questions. Seventeen tools. One million tokens of context. Every handoff visible."*

> [Hotkey `A` → AgentConstellation plein ecran. Sentinel au centre. 4 agents en orbite. Particules de handoff qui circulent sur les arcs. Tool-call rail anime. Thinking trail sous le node actif.]
> `[ANNOTATION : "5 Managed Agents · MCP server · 17 tools · 1M context"]`

---

**2:55–3:00**
*"From PDF to prediction — not detection — in two minutes. Built for plants like this one in Algeria. And for every site like them."*

> [Retour brievement shot usine calme. Bottles en mouvement sur la ligne. Logo ARIA.]
> `[ANNOTATION : "ARIA — Adaptive Runtime Intelligence for Industrial Assets" + "vgtray · zestones"]`

---

## Notes pour Heygen / ElevenLabs / voix reelle Adam

- **Ton** : calme, factuel, un peu comme un documentaire. Pas corporate. Pas excite.
- **Rythme** : laisser respirer les silences entre les phrases courtes. Surtout en ACT I.
- **Accent** : neutre international (AI voice) OU accent fr leger mais clair (Adam). Pas de surplay americain force.
- **Phrases courtes = pauses courtes. Phrases longues = debit legerement plus rapide.**

### Directions specifiques

| Ligne | Direction |
|---|---|
| *"He just knows."* (0:10) | Pause de 0.5s AVANT. Moment humain. |
| *"Powered by Claude Opus 4.7."* (0:28) | Debit ralenti, clair. Premiere mention du modele. |
| *"ARIA doesn't wait for the breach. It forecasts it."* (1:07) | Emphase sur "forecasts". Pivot predictive. |
| *"And you see it think — in real-time."* (1:17) | Emphase sur "see it think". Pause 0.3s avant. |
| *"written by Karim at 2am"* (1:30) | Nommer Karim lentement — rend la machine "humaine". |
| *"And ARIA remembers."* (2:27) | Pause 0.5s avant. C'est le beat memoire. |
| *"Samir, the shift supervisor, closed that incident"* (2:37) | Nommer Samir rend l'historique organisationnel tangible. |
| *"From PDF to prediction — not detection, prediction"* (2:57) | Double emphase "prediction". Punchline final. |

### Mots-cles a prononcer distinctement

- **"Opus 4.7"** : 2 fois (0:28, 1:57). Doit etre audible au 1er passage.
- **"Extended thinking"** / **"see it think"** : 1:17. Hook prize Creative Opus 4.7.
- **"Claude Managed Agents"** : Scene 3 header Inspector (1:17) + Act III (2:42). Hook prize Best Managed Agents.
- **"MCP"** / **"17 tools"** : Act III (2:44). Profondeur integration.
- **"1M context"** : Act III (2:45). Scope Opus 4.7.
- **"Forecasts"** / **"prediction, not reactive"** : Scene 2 (1:07). Hook prize Keep Thinking.
- **"Algeria"** / **"southern Algeria"** : intro (0:30) + outro (2:57). Ancrage "Build From What You Know".
- **"Bottle Filler"** / **"Bottle Capper"** / **"Bottle Labeler"** : Grandparent Test — noms entendus a chaque scene.
- **"Karim"** (Scene 3) + **"Samir"** (Scene 5) + **"Amina"** (Scene 2 implicite) : humanisation via shifts feature live.

---

## Timing total estime

| Act | Duree | Mots prononces approx. |
|---|---|---|
| ACT I — Probleme | 30s | ~85 mots |
| ACT II Scene 1 — Onboarding Labeler | 25s | ~75 mots |
| ACT II Scene 2 — Predictive Filler | 20s | ~60 mots |
| ACT II Scene 3 — Investigation | 50s | ~145 mots |
| ACT II Scene 4 — Work Order | 20s | ~55 mots |
| ACT II Scene 5 — Memory recall Capper | 15s | ~55 mots |
| ACT III — Constellation + closing | 20s | ~75 mots |
| **TOTAL** | **3:00** | **~550 mots** |

Debit moyen ~3.0 mots/sec = tendu mais tenable pour un documentaire rythme.

---

## Version print / prompt pour Heygen / ElevenLabs

Bloc vocal pur (a coller sans didascalies visuelles) :

> In every factory, every plant, every water station in the world — there's one person who knows. He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever. Companies have tried to fix this for ten years. The software exists. But setting it up costs half a million dollars and takes six months of specialists. So ninety-five percent of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Powered by Claude Opus 4.7.
>
> This is a water-bottling plant in southern Algeria. Five machines, serving fifty thousand people. And today, a new machine comes online — the Bottle Labeler. You drop in its manual — the PDF that came in the box. ARIA reads the whole thing with Opus 4.7 vision. Then it asks you three questions. Not a consultant. Not a form. Just: what do you actually see on this machine every day? In under two minutes, the Labeler is live.
>
> The next morning, the shift operator logs in. This is their dashboard. And ARIA has already flagged something. Top of the anomaly card: Bottle Filler, motor shake rising. ARIA doesn't wait for the breach. It forecasts it. Two hours before the Filler would actually cross the safe limit, a warning fires. This is a prediction, not an alarm.
>
> A few minutes later, the real breach hits. Motor shake crosses the safe limit. Sentinel catches it. But ARIA doesn't just send an alert and leave. Watch what happens next. The Investigator is thinking. That's extended thinking on Opus 4.7 — you are watching the reasoning live. It reads the maintenance log written by Karim at 2am — the night shift operator wrote "unusual noise". The repair history — that same bearing was replaced nineteen hundred hours ago. The motor temperature, which has been creeping up eight degrees over the past week. It connects the dots. What would take a senior technician an hour to piece together — Opus 4.7 does in seconds. Bearing wear on the Filler drive motor. Eighty-seven percent confidence.
>
> Then it writes the repair order. Not a generic recommendation. The exact steps. The exact part. Bearing 6205-2RS. ARIA found that reference in the manual. Karim walks out with a printed sheet and knows exactly what to do.
>
> Now watch this. Another anomaly — on the Bottle Capper this time. And ARIA remembers. It saw this same pattern on the Capper in January — Samir, the shift supervisor, closed that incident. Now ARIA is predicting four hours to failure and telling the operator exactly what fixed it last time.
>
> Behind all of this — five AI agents on Claude Managed Agents, talking to each other through an MCP server. Sentinel watches the signals. Investigator reasons. KB Builder reads manuals. Work Order Generator writes repairs. Q&A answers questions. Seventeen tools. One million tokens of context. Every handoff visible.
>
> From PDF to prediction — not detection — in two minutes. Built for plants like this one in Algeria. And for every site like them.

---

**Status :** v5 final · aligne sur polish branche 2026-04-24 21h · pret pour voice-over une fois le merge + seed bottled-water + shifts assignments deployes
