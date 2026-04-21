# ARIA — Adaptive Real-time Industrial Agent
### Product Requirements Document — Built with Opus 4.7 Hackathon

---

## 1. Prompt Alignment

**Prompt choisi : "Build From What You Know"**

> "The process that takes weeks and should take hours. The decision was made on gut because the data's too scattered to use. The thing someone you know still does by hand."

ARIA répond exactement à ça : configurer un système de maintenance prédictive dans une usine prend aujourd'hui des mois de travail avec des data scientists. 95% des sites industriels n'y ont pas accès. ARIA le fait en quelques minutes, en uploadant simplement le manuel constructeur.

---

## 2. Le Problème

Chaque machine industrielle est unique. Les systèmes de maintenance prédictive classiques (IBM Maximo, SAP PM) nécessitent :
- 3 à 6 mois de configuration par des data scientists
- Des budgets de 50k€ à 500k€
- Une expertise métier très spécifique

Résultat : **95% des sites industriels** fonctionnent encore avec de la maintenance corrective ou préventive basée sur des intervalles fixes — pas sur l'état réel de la machine. Une panne imprévue coûte en moyenne **250k€** en production perdue + intervention d'urgence.

Le technicien terrain, lui, *sait* quand la machine va lâcher. Il entend le bruit, il sent la vibration. Mais cette connaissance ne s'intègre jamais dans les systèmes.

---

## 3. La Solution : ARIA

ARIA est un agent industriel de maintenance prédictive qui se configure lui-même à partir du manuel constructeur et du savoir-faire de l'opérateur terrain.

**En une phrase :** Upload ton manuel PDF → ARIA lit tout, comprend la machine, dialogue avec toi pour capturer ton expérience → surveille en temps réel et te prévient avant la panne.

---

## 4. Flux Utilisateur

### Phase 1 — Onboarding de la machine (< 15 minutes)

1. **Upload du manuel constructeur PDF** (peut faire 500+ pages)
2. **Opus 4.7 lit le document entier** grâce au context window étendu
3. Il extrait automatiquement :
   - Seuils nominaux (température, vibration, pression, RPM...)
   - Patterns de pannes documentés
   - Procédures de maintenance préventive
   - Indicateurs de dégradation par composant
4. **Dialogue avec l'opérateur** : ARIA pose des questions ciblées pour capturer le savoir terrain
   - *"Vous avez mentionné que le roulement droit vibre plus fort avant de lâcher — à partir de quel niveau vous intervenez ?"*
   - *"Y a-t-il des conditions particulières (température ambiante, charge...) qui changent votre seuil d'alerte ?"*
5. ARIA construit le **profil machine** : un modèle hybride manuel + expérience terrain

### Phase 2 — Surveillance temps réel

- Les agents spécialisés surveillent les signaux en continu
- Corrélation avec l'historique des logbooks (pannes passées, interventions)
- Détection d'anomalies par rapport au profil machine

### Phase 3 — Diagnostic & Work Order

Quand une anomalie est détectée, ARIA génère automatiquement :
- **Diagnostic** : composant concerné, type de défaillance probable, niveau d'urgence
- **Work Order** : pièces à prévoir, temps d'intervention estimé, procédure recommandée
- **Fenêtre d'intervention** : "Vous avez 48h avant défaillance probable"

---

## 5. Architecture Technique

### Stack

- **Frontend** : Next.js 15 + TypeScript + Tailwind CSS (UI industriel, pas AI-slop)
- **Backend** : Node.js + PostgreSQL
- **Agents** : Claude Managed Agents (SDK officiel Anthropic)
- **Infra** : Docker + déployé sur VPS

### Agents Managed (pour le prize dédié)

```
orchestrator-agent        → Coordonne l'ensemble du workflow
├── pdf-reader-agent      → Extrait et structure le contenu du manuel
├── knowledge-agent       → Construit et maintient le profil machine
├── dialogue-agent        → Dialogue avec l'opérateur pour capturer l'expertise terrain
├── monitoring-agent      → Surveille les signaux temps réel
├── anomaly-agent         → Détecte les déviations par rapport au profil
└── workorder-agent       → Génère les diagnostics et work orders
```

### Utilisation d'Opus 4.7

- **Lecture PDF entier** : manuels de 200-800 pages lus en une seule passe grâce au context window
- **Extraction structurée** : identification automatique des seuils, patterns, procédures dans des documents non structurés
- **Dialogue technique** : compréhension du jargon industriel terrain ("ça claque", "ça chauffe plus que d'habitude")
- **Raisonnement causal** : corrélation multi-signaux pour le diagnostic

---

## 6. Critères de Jugement — Comment ARIA gagne

| Critère | Poids | Stratégie ARIA |
|---|---|---|
| **Impact** | 30% | 95% des sites industriels sans accès à la maint. prédictive. Marché = toutes les PME industrielles mondiales. Une panne évitée = 250k€ économisés |
| **Demo** | 25% | Upload manuel → extraction live → dialogue opérateur → alerte générée. 3 minutes chrono, visuellement fort |
| **Opus 4.7 Use** | 25% | Lecture PDF 500 pages entier, extraction technique, dialogue terrain, raisonnement causal multi-signaux |
| **Depth & Execution** | 20% | Architecture multi-agents propre, vraies données industrielles, profil machine hybride (doc + expertise humaine) |

### Prix visés

- **Top 3** (10k-50k) : impact + démo + Opus 4.7 bien utilisé
- **Best Managed Agents** (5k) : architecture multi-agents complète et bien orchestrée
- **"Keep Thinking" Prize** (5k) : personne n'a pensé à pointer l'IA sur ce problème industriel précis

---

## 7. Démo (3 minutes)

**Structure narrative :**

0:00 → Problème en une phrase + chiffre choc (95% des usines, 250k€ par panne)

0:30 → Upload d'un vrai manuel PDF constructeur

1:00 → ARIA extrait les seuils en live (on voit Opus 4.7 travailler)

1:45 → Dialogue avec l'opérateur : ARIA pose des questions, l'opérateur répond

2:15 → Simulation d'anomalie → diagnostic généré + work order automatique

2:45 → Impact : "Ce process prenait 6 mois et 100k€. ARIA le fait en 10 minutes."

---

## 8. Répartition des Rôles (Équipe 2 personnes)

| Tâche | Responsable |
|---|---|
| Architecture multi-agents Managed Agents | Adam |
| Frontend / UX / Design (zéro AI-slop) | Adam |
| Déploiement VPS + CI/CD | Adam |
| Intégration données industrielles réelles | Builder 2 |
| Manuels PDF réels pour la démo | Builder 2 |
| Logique de monitoring temps réel | Builder 2 |

---

## 9. Règles Hackathon — Conformité

- ✅ **Open Source** : tout publié sur GitHub sous licence MIT
- ✅ **New Work Only** : started from scratch le 21 avril
- ✅ **Team Size** : max 2 membres
- ✅ **Soumission** : vidéo 3min + repo GitHub + summary 100-200 mots

---

## 10. Résumé (100-200 mots pour la soumission)

> ARIA is an industrial predictive maintenance agent that solves a problem 95% of industrial sites face: they can't afford the months of data science work required to configure predictive maintenance systems. ARIA changes that in minutes.
>
> Upload any machine's PDF manual — ARIA uses Opus 4.7's full context window to read hundreds of pages, extract operational thresholds, failure patterns, and maintenance procedures. It then dialogues with the floor operator to capture their tacit expertise ("it makes a different noise before it fails"). This hybrid profile — documentation + human knowledge — is what makes ARIA unique.
>
> Six specialized Managed Agents then monitor real-time signals, correlate with historical logbooks, and automatically generate a diagnosis and work order before the machine fails — with an estimated intervention window.
>
> A process that costs $100K and takes 6 months now takes 10 minutes.
