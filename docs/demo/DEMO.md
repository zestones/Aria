# ARIA — Demo Submission Checklist

> **Living checklist for the hackathon submission package.**
> Created 2026-04-25, J-1. Replaces the deprecated `PRD.md` (deleted).
> Authoritative sources for the **video itself** :
>   - **Voice-over + storyboard** → [`SCRIPT.md`](./SCRIPT.md) v6
>   - **Technical contracts + dry-run** → [`../planning/M9-polish-e2e/demo-build-spec.md`](../planning/M9-polish-e2e/demo-build-spec.md)
>   - **Plant scenario** → [`../planning/M9-polish-e2e/demo-plant-design.md`](../planning/M9-polish-e2e/demo-plant-design.md)
>
**This doc** = everything else needed for the submission form.
> 
---

## 0. Submission deadline

**2026-04-26 20:00 EST** · target submit at **15:00 EST** (5h buffer).

Required :
- [ ] 3-min demo video (YouTube unlisted, Loom, or similar)
- [ ] GitHub repo URL — `https://github.com/zestones/Aria`
- [ ] Written summary (100–200 words)
- [ ] Project tags
- [ ] Screenshots (3-5 recommended)

---

## 1. Pitch — one phrase

**ARIA is a maintenance copilot for industrial operators. Drop in your machine's manual, get live predictive monitoring in two minutes — instead of six months and half a million dollars.**
> 
Use this in : README headline · Login subtitle · Video thumbnail · YouTube description first line.

---

## 2. Written summary (100–200 words) — template

ARIA is a maintenance copilot for industrial operators. Classic predictive-maintenance systems cost half a million dollars and take six to eighteen months of data scientists to deploy. Ninety-five percent of plants can't afford that — they wait for things to break.
> ARIA changes that. An operator drops a machine's PDF manual into the system. Claude Opus 4.7 reads it with vision and a one-million-token context. Three calibration questions later, the machine is under live monitoring.
>
Behind the scenes: five specialized agents orchestrated through an MCP server with seventeen tools. Sentinel watches signals; Investigator runs extended thinking on anomalies — visible live, token by token; KB Builder reads manuals; Work Order Generator writes printable repair orders; Q&A answers operator questions. The Investigator runs on Claude Managed Agents and writes Python that executes inside Anthropic's cloud sandbox to produce verifiable numerical evidence in every diagnosis.
> From PDF to first prediction: two minutes. Built for every plant that can't afford the alternative.
>

> **Word count :** ~165. Within 100-200 range.
>

> Final pass before submit : re-read for tone and accuracy after the video is locked.

---

## 3. Submission tags

```
managed-agents
opus-4-7
extended-thinking
mcp
vision
generative-ui
predictive-maintenance
industrial
sandbox-execution
typescript
fastapi
```

---

## 4. Screenshots to capture (5 max)

| # | Shot                                                                           | Source surface                   | Captured ? |
|---|--------------------------------------------------------------------------------|----------------------------------|------------|
| 1 | Dashboard `/control-room` with 5 plant tiles + KPI bar populated               | Live app                         | ⏳          |
| 2 | **Inspector with thinking stream + SandboxExecution card (cyan chip visible)** | Live app, mid-investigation      | ⏳          |
| 3 | DiagnosticCard with 87% confidence + RCA text starting `Sandbox: rho=...`      | Live app, end of investigation   | ⏳          |
| 4 | PrintableWorkOrder A4 with QR code                                             | `/work-orders/:id` print preview | ⏳          |
| 5 | AgentConstellation full-screen with active handoff particles                   | Hotkey `A` overlay               | ⏳          |

**Format :** PNG 1920×1080. Names : `01-dashboard.png`, `02-thinking-sandbox.png`, etc.

---

## 5. Asset checklist (samedi 25/04)

### Pre-existing
- [x] `aria-hyperframes/` scaffolded with 8-scene composition (`~/Documents/Projets/aria-video/aria-hyperframes/index.html`)
- [x] `aria-pitch/` Remotion fallback scaffolded (`~/Documents/Projets/aria-video/aria-pitch/`)

### To produce/fetch samedi AM
- [ ] **Grundfos NB-G 65-250 IOM PDF** — fetch from `net.grundfos.com` → drop at `test-assets/grundfos-nb-g-65-250-iom.pdf` (do not commit if copyrighted)
- [ ] **Stock footage Act I (0:00–0:25)** — 3 clips Pexels/Unsplash :
  - operator writing in dusty binder (close-up hand)
  - industrial pump or control panel B-roll
  - wide shot machinery / cables
- [ ] **Voiceover.mp3** — full 3:00 narration. Stack : Adam's voice + decent mic (or ElevenLabs fallback). Source = `SCRIPT.md` "Bloc vocal pur".

### To produce samedi PM (after live stack is dry-run-passed)
- [ ] **6 screen recordings** (OBS or Screen Studio, 1080p 60fps) :
  - `scene-01-onboarding.mp4` — wizard PDF → multi-turn → KbCard reveal
  - `scene-02-forecast.mp4` — Dashboard with cool-tone forecast banner appearing
  - `scene-03-investigation.mp4` — Inspector with thinking + Sandbox card + DiagnosticCard
  - `scene-04-workorder.mp4` — `/work-orders/:id` → Print preview
  - `scene-05-memory.mp4` — Capper anomaly → PatternMatch card
  - `scene-06-shifts.mp4` — `/shifts` page with Priya's logbook note
  - `scene-07-constellation.mp4` — hotkey `A` → full-screen Constellation with handoffs

### Tournage prerequisites (per `demo-build-spec.md` §3 + §4 pre-record)
- [ ] Stack up via `make up` or `docker compose up -d`
- [ ] `ARIA_DEMO_ENABLED=true` in `.env` AND `docker-compose.yaml` `environment:` block
- [ ] Tunnel live (`aria-cloudflared`)
- [ ] User-owned seed + migrations applied within last hour
- [ ] One full dry-run of all 17 build-spec checklist beats passing
- [ ] Browser : DevTools closed, full-screen, no bookmark bar
- [ ] DemoControlStrip visible OR screen-crop excludes it (decide once and stick)

---

## 6. Video stack — final decision

**Production tool :** **Hyperframes** (HTML + CSS + GSAP, Apache 2.0).
- Repo : `~/Documents/Projets/aria-video/aria-hyperframes/`
- Differentiation rationale : most hackathon entries use Remotion; Hyperframes is rarer + the Claude Code skill `/hyperframes` accelerates iteration.
- Fallback if blocking issue : DaVinci Resolve (free) — assemble screen recordings + voiceover + minimal annotations, no GSAP overlays.

**Voice :** Adam's real voice in English.
- Rationale : authenticity > AI (per CM Barbara `feel > mechanics`). Also unlocks prize **Creative Opus 4.7** ("voice, point of view, alive").
- Mic minimum : EarPods/AirPods. Better : dedicated headset mic.
- Setup : Audacity for record + clean (denoise, normalize). 5-10 takes per scene.

**Facecam :** **NO.** Per discussion : a kitchen/desk facecam doesn't reinforce the industrial pitch. Stock footage industriel in Act I covers Adrian's "humain visible" advice without exposing Adam personally.

**Sound design :** ambient low-bed music throughout EXCEPT 1:15–1:45 (Sandbox HERO beat). Silence + a subtle "click" on the card appearance per zestones storyboard.

**Render :** 1920×1080 minimum, 30fps acceptable, 60fps preferred. MP4. Code in Sandbox card MUST be readable.

---

## 7. Prizes mapping (recap court)

| Prize                          | Hook moment in video                                                                                                     | Strength       |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------|----------------|
| **Top 3 global** (50k/30k/10k) | Excellence on all 4 criteria across the full 3:00                                                                        | Realistic      |
| **Keep Thinking ($5k)**        | Cold open 0:00–0:15 + outro callback "for the one person who knows" — real-world problem nobody pointed Claude at        | **Strong fit** |
| **Best Managed Agents ($5k)**  | Scene 3b 1:15–1:45 Sandbox Python execution + voice-over *"cannot happen without Managed Agents"* + Constellation reveal | **Strong fit** |
| **Creative Opus 4.7 ($5k)**    | Cold open emotional + Sandbox card cyan chip + extended thinking visible + outro callback                                | **Strong fit** |

Long-form mapping in `SCRIPT.md` "Mapping prizes" section.

---

## 8. Production timeline

| When                                | What                                                                                                                      | Who             |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------|-----------------|
| **Sat 25/04 AM**                    | User-owned seed + migrations applied · stock footage fetched · Grundfos PDF fetched · DemoControlStrip ready · dry-run x1 | Adam + zestones |
| **Sat 25/04 PM (13:00–18:00)**      | 6 screen recordings + voiceover full take                                                                                 | Adam            |
| **Sat 25/04 evening (18:00–24:00)** | Hyperframes composition assembly + render v1 + review                                                                     | Adam            |
| **Sun 26/04 AM (09:00–12:00)**      | Dry-run video x3 · final tweaks · README polish · capture 5 screenshots                                                   | Adam            |
| **Sun 26/04 (12:00–15:00)**         | Export final MP4 · upload YouTube unlisted · submission form fill                                                         | Adam            |
| **Sun 26/04 15:00 EST**             | **SUBMIT** (5h before deadline)                                                                                           | Adam            |

---

## 9. Authoritative sources

If you need detail beyond this checklist :

- **What I say in the video** → [`SCRIPT.md`](./SCRIPT.md) v6 (voice-over text + scene timings + bloc vocal pur for ElevenLabs paste)
- **What I show in the video** → [`../planning/M9-polish-e2e/demo-build-spec.md`](../planning/M9-polish-e2e/demo-build-spec.md) §4 storyboard + §3 dry-run checklist
- **How to fire scenes** → `demo-build-spec.md` §2.2 endpoints
- **What the plant is** → [`../planning/M9-polish-e2e/demo-plant-design.md`](../planning/M9-polish-e2e/demo-plant-design.md)
- **Strategic plan** → [`../planning/M9-polish-e2e/win-plan-48h.md`](../planning/M9-polish-e2e/win-plan-48h.md)

---

**Status :** v1 · J-1 (samedi 25/04) · live until submit
