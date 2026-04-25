## ARIA — Script Voix-Off Final (v7)

> Version grand public. Zero jargon. Comprehensible par n'importe qui.
> 3:00 strict · Anglais · Voice-over AI (ElevenLabs) OU voix reelle Adam
>
> **v7 — v6 + ajout note de tournage WO card framing identique acte 1 → scene 4 (boucle visuelle cinematographique zestones)**

---

## Regle d'or
> **The Grandparent Test.** Si ma grand-mere comprend pas pourquoi c'est impressionnant, la ligne est ratee.

---

## ACT I — Le probleme (0:00–0:25)

**0:00–0:05** — Cold open emotionnel
*"In every factory, every plant, every water station in the world — there's one person who knows."*

> [Stock footage industriel : gros plan sur un technicien senior qui ecrit a la main dans un classeur papier, bruit d'usine en arriere-plan]

---

**0:05–0:15** — Setup du pain
*"He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever."*

> [Stock footage : pompes qui vibrent, cables, panneaux de controle, le classeur papier]

---

**0:15–0:25** — ARIA intro + Constellation tease
*"Companies have tried to fix this for ten years. Setting it up costs half a million dollars and takes six months of specialists. So ninety-five percent of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Five AI agents. Claude Opus 4.7."*

> [Logo ARIA s'anime + tagline "Adaptive Runtime Intelligence for Industrial Assets" + chiffres "95% · $500K · 6 months" + brief AgentConstellation reveal (2s) qui referme]

---

## ACT II — ARIA au travail (0:25–2:35)

### Scene 1 — Onboarding Bottle Labeler (0:25–0:50)

**0:25–0:50**
*"Take a water-bottling factory. One line, four machines. Today a fifth one comes online — the Bottle Labeler. Normally, configuring its monitoring takes a specialist two days. Drop in the manual. ARIA reads it. Asks three questions. Two minutes later, it's live."*

> [Dashboard `/control-room` avec ses 5 tiles visibles brievement (Source Pump, UV Sterilizer, Bottle Filler, Bottle Capper, Bottle Labeler). Click sur Labeler tile → OnboardingPage avec EquipmentBootstrap.]
> [Drag & drop PDF Grundfos NB-G. 5-phase KbProgress ("Validating PDF / Reading pages with Opus vision / Extracting thresholds / Validating schema / Saving KB") → MultiTurnDialog → EquipmentKbCard reveal avec thresholds calibres.]
> `[ANNOTATION : "Opus 4.7 vision · 1M context"]`

---

### Scene 2 — Forecast cool (0:50–1:00)

**0:50–1:00**
*"Look at the Bottle Filler. Motor shake is rising. Nothing is broken. But ARIA is forecasting a breach in two hours. Predictive, not reactive."*

> [Retour Dashboard. Card "Open anomalies" affiche "Bottle Filler · forecast breach in 2h". Click → SignalChart avec forecast OLS overlay. AnomalyBanner cool-tone visible.]
> `[ANNOTATION : "Predictive, not reactive"]`

---

### Scene 3 — Investigation (1:00–2:00) ⭐ HERO BLOCK

#### 3a · Sentinel breach + thinking (1:00–1:15)

**1:00–1:15**
*"Now the real breach hits. Sentinel catches it. Watch what happens next. That's extended thinking on Opus 4.7 — streamed live, token by token."*

> [AnomalyBanner flip destructive-tone. Click "Investigate" → chat drawer ouvre. Inspector header "Opus 4.7 · Extended thinking · Managed Agent". thinking_delta stream commence a defiler.]

---

#### 3b · ⭐⭐⭐ SANDBOX PYTHON HERO (1:15–1:45, 30s)

**Le single most important cut du storyboard. Cyan chip "Ran in Anthropic sandbox" doit etre visible lisible ≥3s continu. Close-up, pas zoomed out. Silence de musique pour cette scene.**

**1:15–1:45**
*"Here is the part that cannot happen without Managed Agents. The agent just wrote Python. Ran it inside Anthropic's cloud sandbox. Pulled the raw vibration data. Ran a correlation analysis across three signals. Got a rho of zero point nine nine four over twenty one thousand samples. That is real Python — not tokens."*

> [GROS PLAN sur SandboxExecution card inline dans le chat. Visible explicitement :
> - Bloc code Python verbatim (~8-12 lignes, correlation numpy/pandas)
> - Output verbatim `rho_pressure_flow=0.9944` / `n=21443` en format `key=value`
> - **Chip cyan "Ran in Anthropic sandbox"** en haut-droite de la card
> - Le card reste a l'ecran 3s minimum pour que le juge le lise]
> `[ANNOTATION : fleche vers le cyan chip "Runs on Claude Managed Agents"]`

---

#### 3c · RCA avec "Sandbox:" prefix (1:45–2:00)

**1:45–2:00**
*"Same numbers end up in the root cause analysis. First-class numerical evidence, straight in the work order."*

> [Pan vers DiagnosticCard. Zoom sur le texte RCA qui commence par `Sandbox: rho_pressure_flow=0.9944, n=21443. Root cause: bearing wear — discharge side...` + confidence 87%.]
> `[ANNOTATION : surligner "Sandbox:" prefix + "87% confidence"]`

---

### Scene 4 — Printable Work Order (2:00–2:15)

**2:00–2:15**
*"The work order is already written. The exact steps. The exact part. Bearing 6205-2RS — found in the manual. The technician walks out with a printed sheet."*

> [Navigation vers `/work-orders/:id`. WorkOrderDetail affiche actions list + parts "1x bearing 6205-2RS" + failure-history strip. Click Print → PrintableWorkOrder A4 avec QR code. Layout noir sur blanc propre.]

> **📽️ NOTE DE TOURNAGE CRITIQUE — boucle visuelle :** Le WO card ici doit avoir **exactement le même framing** que celui visible dans le zoom arrière de l'ACT I (même crop, même taille, même position à l'écran). Le cerveau du juge fait le match subconscient sans qu'on lui explique — il réalise que ce WO était déjà là depuis la première seconde. C'est du cinéma, pas du pitch deck. Enregistre le WO card en plein écran dans les deux cas, même résolution, même zoom. Si tu dois choisir entre un beau travelling et ce framing identique — choisis le framing identique.

---

### Scene 5 — Memory recall Bottle Capper (2:15–2:35)

**2:15–2:35**
*"Another anomaly — this time on the Bottle Capper. And ARIA remembers. It saw this same pattern in January. Tom closed that incident. Now ARIA is predicting four hours to failure and telling the operator what fixed it last time."*

> [AnomalyBanner sur Capper. Click → Inspector → PatternMatch card apparait : "Same pattern as Jan 2026 · Predicted MTTF: 4.0h · Recommended action: replace roller bearing · Closed by Tom Anderson".]
> `[ANNOTATION : "Memory hit — recognised from failure 3 months ago"]`

---

### Scene 6 — Shift page / human-in-the-loop (2:35–2:50)

**2:35–2:50**
*"Priya, the night shift operator, wrote a note at 2am. ARIA read it. Used it in the investigation. Human stays in the loop."*

> [Click `Shifts` dans sidebar → `/shifts`. Current-shift header "Night shift · 22:00-06:00 · Priya Patel". Pan sur le ShiftLogbookPanel — entry de Priya "unusual noise on Filler at 02:14" surligne. Rota table + activity metrics visibles en arriere-plan.]
> `[ANNOTATION : surligner la logbook entry Priya]`

---

## ACT III — Closing (2:50–3:00)

**2:50–3:00** — Outro + Constellation callback

*"Five agents. One MCP server. One cloud sandbox. Seventeen tools. One million tokens of context. Two minutes from PDF to prediction — not detection — prediction. Built for every plant that can't afford the alternative. And for the one person who knows."*

> [Hotkey `A` → AgentConstellation plein ecran 3s avec sur-title caption "5 Managed Agents · MCP · 17 tools · 1M context". Puis fade vers stock footage industriel final : bottles en mouvement + technicien serein + logo ARIA + credits "vgtray · zestones".]

**Callback :** "the one person who knows" = boucle sur ouverture 0:00. Emotional arc complete.

---

## Notes pour Heygen / ElevenLabs / voix reelle Adam

- **Ton** : calme, documentaire. Pas corporate. Pas excite.
- **Rythme** : laisser respirer les silences entre les phrases courtes. Surtout ACT I.
- **Accent** : neutre international (AI voice) OU accent fr leger mais clair (Adam). Pas de surplay americain force.

### Directions specifiques

| Ligne | Direction |
|---|---|
| *"He just knows."* (0:10) | Pause 0.5s AVANT. Moment humain. |
| *"Claude Opus 4.7."* (0:22) | Debit ralenti. Premiere mention. |
| *"Predictive, not reactive."* (0:58) | Emphase "forecasts". Pivot predictif. |
| *"Watch what happens next."* (1:10) | Emphase. Pause 0.3s avant. |
| *"Here is the part that cannot happen without Managed Agents."* (1:15) | Phrase pivot. Emphase grave sur "Managed Agents". |
| *"That is real Python — not tokens."* (1:43) | Punchline technique. Pause 0.3s. |
| *"And ARIA remembers."* (2:20) | Pause 0.5s avant. Beat memoire. |
| *"prediction — not detection — prediction"* (2:54) | Double emphase. Punchline final. |
| *"And for the one person who knows."* (2:58) | Ralentir. Pause 0.5s avant. Close-up emotional. |

### Mots-cles a prononcer distinctement

- **"Opus 4.7"** : 3 mentions (0:22, 0:40 "Opus 4.7 vision", 1:10 "extended thinking on Opus 4.7")
- **"Claude Managed Agents"** : 2 mentions (1:15 explicite + 2:50 "Five agents")
- **"Anthropic's cloud sandbox"** : Scene 3b (1:20) — HERO
- **"Extended thinking"** : Scene 3a (1:10) — prize Creative
- **"MCP"** / **"17 tools"** : Act III (2:51)
- **"1M context"** : Act III (2:51)
- **"Forecasting"** / **"prediction, not detection"** : 0:58 + 2:54 — Keep Thinking
- **"Priya"** (Scene 6) + **"Tom"** (Scene 5) — humanisation via shifts feature

---

## Timing total

| Act / Scene | Duree | Mots approx. |
|---|---|---|
| ACT I — Probleme | 25s | ~75 mots |
| Scene 1 Onboarding Labeler | 25s | ~55 mots |
| Scene 2 Forecast Filler | 10s | ~35 mots |
| Scene 3a Breach + thinking | 15s | ~40 mots |
| **Scene 3b SANDBOX HERO** | **30s** | **~70 mots** |
| Scene 3c RCA "Sandbox:" | 15s | ~25 mots |
| Scene 4 Work Order | 15s | ~45 mots |
| Scene 5 Memory Capper | 20s | ~55 mots |
| Scene 6 Shift / Priya | 15s | ~30 mots |
| ACT III Outro + Constellation | 10s | ~50 mots |
| **TOTAL** | **3:00** | **~480 mots** |

Debit moyen ~2.7 mots/sec = documentaire. Marge de ~15s pour pauses + title cards + silence sur Sandbox beat.

---

## Bloc vocal pur (pour ElevenLabs / Heygen, sans didascalies)

> In every factory, every plant, every water station in the world — there's one person who knows. He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever. Companies have tried to fix this for ten years. Setting it up costs half a million dollars and takes six months of specialists. So ninety-five percent of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Five AI agents. Claude Opus 4.7.
>
> A water-bottling plant. Five machines. Today a new one comes online — the Bottle Labeler. Drop in the manual. ARIA reads it with Opus 4.7 vision. Asks three questions. Two minutes later, it's live.
>
> Look at the Bottle Filler. Motor shake is rising. Nothing is broken. But ARIA is forecasting a breach in two hours. Predictive, not reactive.
>
> Now the real breach hits. Sentinel catches it. Watch what happens next. That's extended thinking on Opus 4.7 — streamed live, token by token.
>
> Here is the part that cannot happen without Managed Agents. The agent just wrote Python. Ran it inside Anthropic's cloud sandbox. Pulled the raw vibration data. Ran a correlation analysis across three signals. Got a rho of zero point nine nine four over twenty one thousand samples. That is real Python — not tokens.
>
> Same numbers end up in the root cause analysis. First-class numerical evidence, straight in the work order.
>
> The work order is already written. The exact steps. The exact part. Bearing 6205-2RS — found in the manual. The technician walks out with a printed sheet.
>
> Another anomaly — this time on the Bottle Capper. And ARIA remembers. It saw this same pattern in January. Tom closed that incident. Now ARIA is predicting four hours to failure and telling the operator what fixed it last time.
>
> Priya, the night shift operator, wrote a note at 2am. ARIA read it. Used it in the investigation. Human stays in the loop.
>
> Five agents. One MCP server. One cloud sandbox. Seventeen tools. One million tokens of context. Two minutes from PDF to prediction — not detection — prediction. Built for every plant that can't afford the alternative. And for the one person who knows.

---

## Mapping prizes → moments clefs

| Prize | Moment cle | Ligne voice-over |
|---|---|---|
| **Top 3 global** (50k/30k/10k) | Excellence globale | Tout le script |
| **Keep Thinking ($5k)** | Real problem nobody pointed Claude at | Intro 0:00-0:25 (pain + 95%) + outro "one person who knows" |
| **Best Managed Agents ($5k)** | Long-running tasks, ship-ready | Scene 3b SANDBOX HERO 1:15-1:45 *"cannot happen without Managed Agents"* + Act III "Five agents" |
| **Creative Opus 4.7 ($5k)** | Expressive, alive, made us feel | Hook emotional 0:00 + callback outro 2:58 + Sandbox Python real code visible |

---

**Status :** v7 final · v6 + boucle visuelle WO card framing identique ACT I → Scene 4 · pret pour tournage
