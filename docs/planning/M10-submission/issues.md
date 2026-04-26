# M10 — Submission (J7, 26/04, deadline 20h EST)

> Objectif : livrer avant 20h EST le 26/04. README final, vidéo 3 min scénarisée,
> package submission rempli.
> Shared milestone — les deux devs contribuent.

---

## Issue M10.1 — README + DEMO.md final polish

**Scope.** Le README est la première chose que les juges lisent avant la vidéo.
Doit être tight.

**Fichiers.**
- `README.md` : hero image (existe déjà), pitch 2 lignes, section "Why agentic",
  les 5 agents illustrés, diagramme archi, quickstart `make up`
- `docs/DEMO.md` : script scène-par-scène avec screenshots

**Owner.** Adam (vgtray) principal, zestones relit.

**Acceptance.**
- [ ] README rend correctement sur GitHub (preview)
- [ ] Lien vidéo démo en haut
- [ ] 5 agents + capabilities documentés
- [ ] Diagramme archi à jour (agents + MCP + Managed Agents sur Q&A)

---

## Issue M10.2 — Vidéo démo 3 minutes

**Scope.** Vidéo = 60% de ce que les juges évaluent. Script tight.

**Procédure.**
- Screen recording OBS ou Loom, 1920×1080 60fps
- Voice-over (English) scripté depuis `docs/DEMO.md`
- Outro : noms de l'équipe + stack credits
- Export MP4 <100 MB
- Upload YouTube unlisted → shareable link

**Script recommandé (English).**
- 0:00–0:15 Hook : "95% of industrial sites can't access predictive maintenance.
  Here's why, and what we built."
- 0:15–1:00 Scene 1 Onboarding (PDF upload, KB Builder multi-turn, equipment ready)
- 1:00–1:45 Scenes 2 + 3 Anomaly → Investigator thinking stream (show Opus 4.7
  extended thinking explicitly) → handoff to KB Builder → RCA
- 1:45–2:15 Scene 4 Work Order printable
- 2:15–2:40 Scene 5 Q&A + memory flex (optional)
- 2:40–3:00 Recap "team of autonomous agents, zero config, 2 hours to first prediction"

**Owner.** Les deux.

**Acceptance.**
- [ ] Sous 3 minutes
- [ ] 5 scènes visibles + thinking stream Opus 4.7 clairement mis en avant
- [ ] Audio clair, pas de silence
- [ ] YouTube link dans README

---

## Issue M10.3 — Submission package

**Scope.** Submission hackathon avant 19h EST (buffer 1h).

**Contenu submission form.**
- Repo URL `https://github.com/zestones/Aria`
- Vidéo URL (YouTube unlisted)
- Written summary ~150 mots (adapter depuis `idea.md` §12)
- Tags : `managed-agents`, `opus-4-7`, `vision`, `extended-thinking`, `mcp`,
  `industrial`, `generative-ui`
- Screenshots (3–5) : control room P&ID, chat avec thinking stream, diagnostic
  card, work order printable, onboarding wizard

**Owner.** Les deux.

**Acceptance.**
- [ ] Submission envoyée avant 19h EST
- [ ] Email de confirmation reçu

---

## Bloque

- Rien (terminal)

## Bloqué par

- M9 (démo polie), backend M5 (tous les agents live)
