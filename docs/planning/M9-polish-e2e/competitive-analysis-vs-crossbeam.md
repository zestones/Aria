# ARIA vs CrossBeam — comparaison vs le précédent winner

> [!IMPORTANT]
> Note prise le 24 avril 2026.
> CrossBeam ([github.com/mikeOnBreeze/cc-crossbeam](https://github.com/mikeOnBreeze/cc-crossbeam))
> a gagné le hackathon "Built with Opus 4.6" (février 2026). 1 personne, 1 semaine.
> Cette doc compare ARIA (en l'état projeté à fin J6 si on shippe les Tier 1 + Constellation + cinématique artifacts)
> face au format gagnant précédent, sur les 4 critères de jugement Anthropic.

---

## TL;DR

**Match serré, gagnable.** ARIA a un avantage structurel sur 2 des 4 critères
(*Depth & Execution*, *Opus 4.7 Use*), un match nul sur *Impact*, et un retard
sur *Demo* à combler — c'est exactement le sens du plan 48h actuel.

> [!WARNING]
> **Le risque dominant n'est pas la qualité technique d'ARIA — c'est la *lisibilité* du pitch en 3 minutes.**
> CrossBeam gagne sur la simplicité narrative ("upload PDF → réponse permis"). ARIA est plus ambitieux mais plus dur à expliquer.
> Tout le travail "wow visuel" doit servir cette lisibilité, pas la décorer.

---

## 1. Profil des deux projets

| Axe             | CrossBeam (winner v4.6)                                   | ARIA (en cours, v4.7)                                                                            |
|-----------------|-----------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Équipe          | 1 personne                                                | 1 personne                                                                                       |
| Vertical        | Permis ADU Californie                                     | Maintenance prédictive industrielle (eau, Algérie)                                               |
| Pain point      | 90% rejet 1ʳᵉ soumission, $30k de retard moyen            | Calibration manuelle 6-18 mois, $500k-$2M, 95% du marché exclu                                   |
| User cible      | Contractor (1 persona)                                    | Opérateur + technicien + responsable maintenance (3 personas)                                    |
| Innovation core | Skills Anthropic (28 fichiers de droit ADU)               | KB dynamique multi-turn + multi-agent live + MCP                                                 |
| Démo locale     | Claude Code lit des PDF + web search                      | Stack live (FE+BE+simulator+DB) avec WS streaming                                                |
| Frontend        | Next.js + shadcn, design "Magic Dirt" premium             | React + design-system v2 "operator-calm"                                                         |
| Backend         | Express orchestrator + Vercel Sandbox + Supabase          | FastAPI 86 routes + 13 modules + TimescaleDB + MCP server                                        |
| Agents          | 1 orchestrator + sub-tâches via Agent SDK preset          | 5 agents managés (Sentinel/Investigator/QA/KB-Builder/WO-Generator) via Anthropic Managed Agents |
| Long-running    | 10-30 min jobs, Cloud Run                                 | Streaming temps réel (`thinking_delta`, `agent_handoff`, `ui_render`)                            |
| Storytelling    | "Upload corrections letter → response package" (1 phrase) | 5 scènes: Onboarding → Anomalie → RCA → WO → Memory                                              |

---

## 2. Critère par critère (pondération Anthropic)

### Impact — 30%

| Aspect                         | CrossBeam                                   | ARIA                                              |
|--------------------------------|---------------------------------------------|---------------------------------------------------|
| Marché adressable              | 480 villes CA, ~contractors locaux          | Industrie globale, eau/agro/utilities, Sud global |
| Démonstration de pain réel     | Forte (chiffres précis, persona contractor) | Forte (chiffres Guedila, persona terrain)         |
| "Could become something"       | Oui, vertical étroit, exécutable            | Oui, vertical large, plus dur à exécuter          |
| Fit "Build From What You Know" | Excellent (pote = mayor, accès terrain)     | Excellent (client Guedila, contexte Algérie)      |

**Verdict :** *Match nul.* CrossBeam gagne sur "exécutable demain", ARIA gagne sur "taille de marché".
Le scoring dépend du juge. **Pas de leverage à attendre ici.**

---

### Demo — 25%

| Aspect                  | CrossBeam                                    | ARIA aujourd'hui                | ARIA après plan 48h               |
|-------------------------|----------------------------------------------|---------------------------------|-----------------------------------|
| Tient en 3 min          | Oui, narratif simple                         | Risqué — 5 scènes tendues       | OK si Director Mode               |
| Holds up live           | Oui, démo locale `bash setup-demo.sh`        | Risqué (simulator + WS)         | OK si scénario scripté            |
| Genuinely cool to watch | Oui (premium aesthetic, output PDF tangible) | Moyen (placeholders)            | Oui (Constellation + cinématique) |
| Output tangible         | **Permis PDF imprimable**                    | Work Order imprimable (déjà OK) | Idem                              |
| Visuel signature        | Hero gradient sky→earth, photoréaliste       | Aucun                           | Agent Constellation               |

**Verdict :** *CrossBeam mène aujourd'hui. Plan 48h rend la course serrée.*

> [!CAUTION]
> Sans Constellation + cinématique artifacts + Director Mode, on perd ce critère.
> Avec, on rattrape voire on dépasse — multi-agent live est plus impressionnant qu'un PDF qui sort.

---

### Opus 4.7 Use — 25% (le critère le plus exploitable)

| Capability surface                | CrossBeam                                | ARIA                                                                           |
|-----------------------------------|------------------------------------------|--------------------------------------------------------------------------------|
| Vision (manuels/plans)            | Oui, OCR/vision plans architecturaux     | Oui, vision PDF manuels constructeur                                           |
| 1M context window                 | Oui (skill files chargées)               | Oui (manuels complets, KB historique)                                          |
| Multi-agent orchestration         | Limité (1 orchestrator + sous-tâches)    | **Fort** (5 Managed Agents, handoffs visibles live)                            |
| MCP server                        | Non explicite                            | **Oui**, surface MCP dédiée (17 tools)                                         |
| Skills Anthropic                  | **Massif** (28+ fichiers, c'est le cœur) | Limité (pas le pattern principal)                                              |
| Streaming `thinking_delta` exposé | Non                                      | **Oui**, Agent Inspector live                                                  |
| Long-running agents managés       | Oui (Vercel Sandbox)                     | Oui (Anthropic Managed Agents — c'est le sujet de la session 2 du hackathon !) |
| Generative UI (`ui_render`)       | Non                                      | **Oui**, contrat backend → frontend cards                                      |

**Verdict :** *ARIA domine ce critère, mais à condition de le rendre visible.*

> [!IMPORTANT]
> CrossBeam a gagné en partie parce qu'il a *rendu Skills lisibles* (28 fichiers exhibés, decision tree, manifest).
> ARIA doit faire pareil avec Managed Agents + MCP. **Agent Constellation est *exactement* ça : rendre l'orchestration visible.**
> C'est la pièce la plus stratégique du plan 48h.

---

### Depth & Execution — 20%

| Signal                       | CrossBeam                              | ARIA                                                        |
|------------------------------|----------------------------------------|-------------------------------------------------------------|
| LOC backend                  | ~serveur Express modeste               | 86 routes, 13 modules, 200+ tests                           |
| Tests automatisés            | Pas de mention forte                   | Unit + integration + E2E + smoke                            |
| Architecture documents       | Bons (DESIGN-BIBLE, plans, learnings)  | **Excellents** (`docs/architecture/` 5 docs + ADR + audits) |
| Voice log / progress journal | **Oui (`progress.md` détaillé)**       | Audits par milestone, équivalent                            |
| "Wrestled with — real craft" | Oui (pivots PDF extraction documentés) | Oui (M3 KB pivots, M5.5 audit, M9 audit)                    |
| Reproductibilité             | `bash scripts/setup-demo.sh`           | `docker-compose up` + Makefile                              |

**Verdict :** *ARIA gagne ce critère.* L'audit M9 montre une autocritique sévère = signal de craft pour les juges.
**Action :** s'assurer que le repo expose ces audits au top niveau du README.

---

## 3. Ce que CrossBeam a fait que ARIA ne fait *pas* (à voler)

> Lecture de [README.md](../../../../cc-crossbeam/README.md), [DEMO.md](../../../../cc-crossbeam/DEMO.md), [progress.md](../../../../cc-crossbeam/progress.md).

1. **Démo locale en 1 commande.** `bash scripts/setup-demo.sh` + invocation dans Claude Code. Pas de cloud, pas de dépendance.
   → ARIA a `make` + `docker-compose`, vérifier qu'un juge peut lancer le scénario en 1 commande **sans Docker** si possible (ou Docker mais avec un seul `make demo`).
2. **Voice-log progress public.** Le `progress.md` raw, daté, avec pivots et frustrations, *rassure les juges* sur la sincérité du build.
   → Notre équivalent existe (`docs/audits/`) mais est moins lisible. Ajouter un `JOURNAL.md` court à la racine ?
3. **Asset library pour la vidéo construite en parallèle.** Mike a généré ~214MB de visuels (fal-ai/Kling) pendant le build, pas la veille du tournage.
   → On n'a rien. Stretch goal : générer 3-4 plans B-roll de la station Guedila *cette semaine*.
4. **Output tangible "imprimable".** Le permis PDF que le contractor récupère est *physiquement* le livrable.
   → ARIA a `PrintableWorkOrder` — **mettre cette impression au centre du climax de la démo**, comme CrossBeam.
5. **Pitch en 1 phrase.** "Upload corrections letter, get response package."
   → ARIA n'a pas son équivalent. Travailler une accroche : *"Onboard a pump in 2 minutes, get a maintenance copilot for life."*
6. **Skills exhibés comme un asset.** Le README de CrossBeam liste les 4 skills avec ce qu'ils contiennent.
   → ARIA doit exhiber ses 5 Managed Agents + le serveur MCP dans le README et dans la vidéo.

---

## 4. Ce que ARIA fait que CrossBeam n'a pas (à amplifier)

1. **Multi-agent visible en temps réel** (`thinking_delta`, `agent_handoff`).
   → Constellation + Inspector. **C'est notre Magic Dirt.**
2. **MCP server avec 17 tools.** Aligné direct sur la roadmap Anthropic.
   → Mentionner MCP explicitement dans la vidéo et le pitch.
3. **Système live qui *respire*** (simulator de signaux, anomalies temps réel).
   → CrossBeam est batch. ARIA est stream. Avantage cinématographique fort.
4. **Mémoire ("ARIA recognised this matches the bearing failure from last March").**
   → Pas d'équivalent CrossBeam. Scène 5 mémoire = différenciateur unique. Doit absolument fonctionner.
5. **Multi-persona.** CrossBeam = contractor. ARIA = opérateur + technicien + responsable.
   → Risque (dispersion) ou force (plate-forme). À cadrer dans le pitch sur 1 persona principal (opérateur).
6. **Open source plus large** : backend FastAPI + simulator industriel réutilisable.
   → Mentionner que le simulator seul est utile à la communauté (peu commun).

---

## 5. Risques d'être *en dessous* de CrossBeam

> [!CAUTION]
> Probabilités estimées subjectivement après lecture du repo CrossBeam.

| Risque                                     | Probabilité | Mitigation                                                                |
|--------------------------------------------|-------------|---------------------------------------------------------------------------|
| Démo crash live (5 scènes, simulator, WS)  | Moyenne     | Director Mode + scénario scripté + dry-run J6                             |
| Pitch "trop technique", juge décroche      | Moyenne     | Accroche en 1 phrase + premier plan = persona opérateur, pas archi        |
| Visuel moins premium que CrossBeam         | Forte       | Constellation + cinématique artifacts + soigner la typo de la vidéo       |
| Pas de "moment WOW" lisible en 5s          | Moyenne     | Constellation = ce moment. Le mettre à 0:30 de la vidéo.                  |
| Juges ne voient pas l'usage Managed Agents | Forte       | L'inscrire en sur-titre du panel Inspector + mention vocale dans la vidéo |
| Output moins tangible qu'un permis PDF     | Faible      | Work Order imprimable existe — le sortir physiquement à l'écran à la fin  |

---

## 6. Décisions à prendre maintenant

1. **Garder Constellation en priorité 1 absolue.** C'est notre `DESIGN-BIBLE` aesthetic à nous *et* notre preuve Opus 4.7 Use.
2. **Garder cinématique artifacts en priorité 2.** Sans elle, generative UI reste un claim.
3. **Ajouter** :
   - [ ] `make demo` qui lance tout en 1 commande (vérifier).
   - [ ] Accroche 1-phrase à valider (cf. *"Onboard a pump in 2 minutes, get a maintenance copilot for life."*).
   - [ ] README racine qui exhibe les 5 Managed Agents + MCP comme CrossBeam exhibe ses Skills.
   - [ ] Mentionner les audits (`docs/audits/`) en signal de craft.
   - [ ] B-roll visuels (3-4 plans station Guedila) pour la vidéo — stretch.

---

## Références

- [cc-crossbeam/README.md](../../../../cc-crossbeam/README.md)
- [cc-crossbeam/DEMO.md](../../../../cc-crossbeam/DEMO.md)
- [cc-crossbeam/progress.md](../../../../cc-crossbeam/progress.md)
- [cc-crossbeam/docs/DESIGN-BIBLE.md](../../../../cc-crossbeam/docs/DESIGN-BIBLE.md)
- [docs/audits/M9-frontend-pre-demo-audit.md](../../audits/M9-frontend-pre-demo-audit.md)
- [docs/planning/M9-polish-e2e/wow-factor-ideas.md](./wow-factor-ideas.md)
- [docs/hackathon/rules.md](../../hackathon/rules.md) (critères de jugement)
