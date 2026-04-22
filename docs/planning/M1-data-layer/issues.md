# M1 — Data Layer

> Objectif : aligner le schema DB et les Pydantic sur l'architecture KB / work_order
> décidée dans `technical.md` §2.4.
> Bloquant pour M2, M3, M4.

---

## Issue M1.1 — Migration 007 : `equipment_kb` colonnes manquantes

**Scope.** Étendre la table `equipment_kb` (créée en migration 005) avec les colonnes que
les agents et le frontend Onboarding attendent.

**Fichier.** `backend/infrastructure/database/migrations/versions/007_aria_kb_workorder_extension.up.sql`

**Colonnes à ajouter.**

| Colonne               | Type          | Default       | Rôle                                    |
|-----------------------|---------------|---------------|-----------------------------------------|
| `structured_data`     | `jsonb`       | `'{}'::jsonb` | Document principal validé Pydantic      |
| `raw_markdown`        | `text`        | `null`        | Sortie brute Opus avant parsing (audit) |
| `confidence_score`    | `real`        | `0.0`         | Complétude 0.0–1.0                      |
| `last_enriched_at`    | `timestamptz` | `null`        | Trace dernier enrichissement            |
| `onboarding_complete` | `boolean`     | `false`       | Flag UI Onboarding                      |

**Décision — migration destructive.**
✅ **DROP** des 3 colonnes héritées (`nominal_specs`, `common_failure_modes`,
`maintenance_recommendations`). On est en dev, on drop la DB et on rejoue les
migrations from scratch. `structured_data` est la seule source de vérité KB.

À faire dans la même migration 007 :
```sql
ALTER TABLE equipment_kb
  DROP COLUMN nominal_specs,
  DROP COLUMN common_failure_modes,
  DROP COLUMN maintenance_recommendations;
```

Mettre à jour `006_aria_seed_p02.up.sql` pour seeder directement `structured_data`
avec un blob `EquipmentKB` minimal valide (Grundfos CR 32-2 réaliste pour P-02).

**Acceptance.**
- [ ] `make db.reset` (drop + recreate + apply 001→007) passe sans erreur
- [ ] `\d equipment_kb` ne montre QUE les nouvelles colonnes (plus les 3 héritées)
- [ ] Seed 006 produit un `structured_data` parsable par `EquipmentKB.model_validate()`
- [ ] Pas de fichier `.down.sql`

---

## Issue M1.2 — Migration 007 : `work_order` colonnes manquantes

**Scope.** Étendre `work_order` pour porter les sorties d'agents.

**Colonnes à ajouter.**

| Colonne                | Type          | Default | Rôle                         |
|------------------------|---------------|---------|------------------------------|
| `rca_summary`          | `text`        | `null`  | RCA produit par Investigator |
| `recommended_actions`  | `jsonb`       | `null`  | Actions structurées (steps)  |
| `generated_by_agent`   | `boolean`     | `false` | Distinguer manuels vs agents |
| `trigger_anomaly_time` | `timestamptz` | `null`  | Timestamp anomalie source    |

**Note sur `status`.** La contrainte actuelle est
`CHECK (status IN ('open','in_progress','completed','cancelled'))`. Le flow agent
introduit `'detected'` (Sentinel) et `'analyzed'` (post-Investigator).

✅ **DÉCIDÉ — étendre le CHECK.** Migration 007 :
```sql
ALTER TABLE work_order DROP CONSTRAINT work_order_status_check;
ALTER TABLE work_order ADD CONSTRAINT work_order_status_check
  CHECK (status IN ('detected','analyzed','open','in_progress','completed','cancelled'));
```
Flow : `detected` (Sentinel) → `analyzed` (Investigator a posé `rca_summary`) →
`open` (Work Order Generator a posé `recommended_actions`) → `in_progress` →
`completed`. Frontend filtre/colore par statut.

**Acceptance.**
- [ ] Migration applique proprement
- [ ] INSERT avec `status='detected'` accepté
- [ ] `WorkOrderCreate` Pydantic mis à jour pour accepter ces champs (issue M1.6)

---

## Issue M1.3 — Migration 007 : `failure_history.signal_patterns`

**Scope.** Ajouter `signal_patterns jsonb` à `failure_history` pour que l'Investigator
puisse stocker la signature signaux de la panne (utile pour le pattern matching dans
les futures investigations).

**Colonne.** `signal_patterns jsonb DEFAULT NULL`

**Acceptance.**
- [ ] Colonne présente
- [ ] `FailureHistoryOut` Pydantic accepte le champ

---

## Issue M1.4 — Pydantic `EquipmentKB` complet

**Scope.** Créer `backend/modules/kb/kb_schema.py` avec les 4 classes définies dans
`technical.md` §2.4 (`ThresholdValue`, `FailurePattern`, `MaintenanceProcedure`,
`EquipmentKB`).

**Critères de design.**
- Tous les sous-champs ont des defaults sains pour permettre une KB partielle
  (pendant l'onboarding, beaucoup de champs sont vides)
- `EquipmentKB.kb_meta` doit contenir au minimum :
  `{version, completeness_score, onboarding_complete, last_calibrated_by}`
- Une méthode utilitaire `EquipmentKB.compute_completeness() -> float` qui retourne
  un score 0.0–1.0

✅ **DÉCIDÉ — `completeness_score` pondéré.** Algorithme :
```
weights = {
    "thresholds": 0.50,        # cœur de la valeur (Sentinel les utilise)
    "failure_patterns": 0.20,  # base du pattern matching Investigator
    "maintenance_procedures": 0.20,  # nourrit le Work Order Generator
    "equipment": 0.10,         # métadonnées identifiantes
}
score = Σ weight_i × (champs_remplis_i / champs_attendus_i)
```
Retourne float ∈ [0.0, 1.0]. Un threshold compte comme "rempli" si
`alert IS NOT NULL`. Test seuil démo : Onboarding doit faire passer P-02 de ~0.40
(PDF only) à ~0.85 (après calibration opérateur) — c'est le moment "aha".

**Acceptance.**
- [ ] `from modules.kb.kb_schema import EquipmentKB; EquipmentKB(equipment={}, thresholds={}, ...).model_dump()` passe
- [ ] `EquipmentKB.model_validate(json.loads(structured_data))` fonctionne sur seed P-02

---

## Issue M1.5 — Adapter `KbRepository.upsert()` pour `structured_data`

**Scope.** Modifier `backend/modules/kb/repository.py` :
- Étendre `JSON_FIELDS` pour inclure `structured_data` (et `signal_patterns` côté failures)
- Réécrire `EquipmentKbUpsert` Pydantic dans `schemas.py` :
  `structured_data: EquipmentKB`, `raw_markdown: str | None`,
  `confidence_score: float`, `last_enriched_at: datetime | None`,
  `onboarding_complete: bool`
- **Supprimer** toute référence aux 3 anciens champs (`nominal_specs`,
  `common_failure_modes`, `maintenance_recommendations`) dans `schemas.py`,
  `repository.py`, `router.py`. Pas de retro-compat (cf. M1.1, on drop la DB).

✅ **DÉCIDÉ — pas de retro-compat.** Suppression complète des 3 anciens champs
dans le code. Une seule source : `structured_data`.

**Acceptance.**
- [ ] `PUT /api/v1/kb/equipment` avec body contenant `structured_data` persiste correctement
- [ ] `GET /api/v1/kb/equipment/2` retourne le `structured_data` parsé
- [ ] Test : roundtrip Pydantic → JSON → DB → JSON → Pydantic identique

---

## Issue M1.6 — Mettre à jour `WorkOrderCreate` / `WorkOrderUpdate` Pydantic

**Scope.** Ajouter dans `backend/modules/work_order/schemas.py` les nouveaux champs
de l'issue M1.2 :
- `rca_summary: str | None`
- `recommended_actions: Any | None` (JSONB)
- `generated_by_agent: bool = False`
- `trigger_anomaly_time: datetime | None`

Étendre `JSON_FIELDS` du `WorkOrderRepository` pour inclure `recommended_actions`.

**Acceptance.**
- [ ] Création d'un work_order avec tous les nouveaux champs via API → 201
- [ ] Lecture renvoie les champs correctement décodés

---

## Bloque

- M2 (les tools `get_equipment_kb` et `update_equipment_kb` ont besoin du schema)
- M3 (KB Builder produit du `structured_data`)
- M4 (Sentinel lit `thresholds` depuis `structured_data`, Investigator écrit
  `rca_summary` + `failure_history.signal_patterns`)
