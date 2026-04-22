# M3 — KB Builder Agent

> Objectif : un PDF uploadé génère une `EquipmentKB` valide en base, et un dialogue
> d'onboarding 4 questions enrichit cette KB avec les valeurs calibrées par l'opérateur.
> Bloquant pour la scène 1 de la démo.

---

## Issue M3.1 — Anthropic client wrapper

**Scope.** `backend/agents/anthropic_client.py` :
- Singleton `anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)`
- Helper `model_for(use_case: Literal["dev", "vision", "agent"]) -> str` qui retourne
  `claude-sonnet-4-5` ou `claude-opus-4-7` selon `ARIA_MODEL` env var (cf.
  `technical.md` §2.4b)

**Config.**
- Ajouter `ANTHROPIC_API_KEY` dans `core/config.py`
- Ajouter `ARIA_MODEL` (défaut Sonnet)

> ✅ **DÉCIDÉ — model slug à vérifier J6 matin.** Pendant le dev (J3→J5),
> `ARIA_MODEL=sonnet` (`claude-sonnet-4-5`). À J6 8h, faire un appel test avec
> `claude-opus-4-7` ; si le slug est différent dans la doc Anthropic
> ([docs.anthropic.com/en/docs/about-claude/models](https://docs.anthropic.com/en/docs/about-claude/models)),
> patcher la constante. Risque très faible — 5 minutes max si à corriger.

**Acceptance.**
- [ ] `await anthropic.messages.create(model=model_for("dev"), ...)` répond

---

## Issue M3.2 — Endpoint upload PDF + extraction Opus vision

**Scope.** Ajouter dans `backend/modules/kb/router.py` :
- `POST /api/v1/kb/equipment/{cell_id}/upload` (multipart, field `file`)
- Body : PDF bytes
- Lit le fichier en async (`aiofiles`)
- Appelle `kb_builder.extract_from_pdf(pdf_bytes, cell_id)` → `EquipmentKB`
- Upsert dans `equipment_kb.structured_data` + `raw_markdown`
- Retourne `EquipmentKbOut`

**Implémentation `kb_builder.extract_from_pdf()`.**
- Construit le content block `{"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64(pdf_bytes)}}`
- System prompt : "Tu reçois un manuel constructeur. Extrais les infos selon le schema
  JSON ci-dessous. Laisse `null` pour les champs absents, ne devine jamais. Cite
  `source_page` pour chaque seuil."
- User content : `[document_block, {"type": "text", "text": "Schema attendu : <EquipmentKB.model_json_schema()>"}]`
- Appel `anthropic.messages.create(model=model_for("vision"), max_tokens=8192, ...)`
- Parse JSON de la réponse → `EquipmentKB.model_validate()`
- Calcule `confidence_score` via `EquipmentKB.compute_completeness()`

> ✅ **DÉCIDÉ — limite UI 50 pages (Option A).** Validation côté endpoint :
> `if pdf.page_count > 50: raise HTTPException(413, "PDF trop volumineux, limitez à 50 pages")`.
> Pour la démo, pré-couper le manuel Grundfos CR aux sections pertinentes
> (specs + maintenance + troubleshooting), typiquement 20–30 pages. Tester avec
> le vrai manuel démo avant J6 midi.

> ✅ **DÉCIDÉ — prose + few-shot, pas le JSON schema brut.** Le system prompt
> décrit le format attendu en prose (~200 lignes max) avec un exemple complet d'une
> KB pompe centrifuge minimale. Claude renvoie du JSON, on le valide côté Python
> via `EquipmentKB.model_validate_json()`. Si parsing fail → 1 retry avec le
> message d'erreur Pydantic en input — c'est plus robuste que le schema brut.

**Acceptance.**
- [ ] `curl -F file=@grundfos_cr32.pdf POST /api/v1/kb/equipment/2/upload` →
  `EquipmentKB` valide en base avec ≥ 3 thresholds + ≥ 1 procedure

---

## Issue M3.3 — Onboarding session (multi-turn)

**Scope.** Créer 2 endpoints :
- `POST /api/v1/kb/equipment/{cell_id}/onboarding/start` → crée session, retourne
  `{session_id, question_index: 0, question: "..."}`
- `POST /api/v1/kb/equipment/{cell_id}/onboarding/message` body
  `{session_id, answer: str}` → retourne soit `{question_index: N, question: "..."}`
  soit `{complete: true, kb: EquipmentKbOut}`

**Stockage session.**

> ✅ **DÉCIDÉ — dict en mémoire (Option A).** `_sessions: dict[str, list[Message]] = {}`
> module-level dans `backend/agents/kb_builder.py`. Une session = 4 questions = ~2
> minutes. Pas de persistance nécessaire. Si serveur restart pendant onboarding,
> l'opérateur recommence — acceptable. Cleanup : TTL 30 min via une simple
> vérification du timestamp à chaque message (évite la fuite mémoire en démo).

**Les 4 questions (peut tomber à 3 en fallback).**
1. Seuil vibration nominal observé en régime normal
2. Date / heures depuis dernier remplacement roulement
3. Pannes récurrentes connues sur cet équipement
4. Conditions particulières d'installation (température ambiante, humidité, etc.)

**Pour chaque réponse.**
- Appel Anthropic (Sonnet en dev) avec system prompt : "Tu reçois une réponse libre
  d'opérateur. Extrais les valeurs structurées correspondant à ce patch JSON :
  `{thresholds.vibration_mm_s: {alert, source, confidence}, ...}`. Si tu n'arrives pas
  à extraire, mets `null` et explique."
- Appel `update_equipment_kb` (via `MCPClient`) avec le patch + `source="operator_calibrated"`,
  `confidence: 0.92`
- Append entry à `calibration_log`
- Charge la prochaine question

**Fin.** À la 4e question répondue : recalculer `confidence_score`, set
`onboarding_complete=true`.

**Acceptance.**
- [ ] Flow complet en 4 messages → KB enrichie avec ≥ 1 threshold marqué
  `operator_calibrated`
- [ ] `calibration_log` contient les 4 entrées

---

## Issue M3.4 — Logique `confidence_score` (rappel M1.4)

Cf. issue M1.4 — implémenter `EquipmentKB.compute_completeness()`. Réutilisé ici à
chaque upsert pour rafraîchir le score.

---

## Issue M3.5 🔴 — KB Builder en mode "agent appelé" (`ask_kb_builder` handler)

**Scope.** Le KB Builder n'est pas seulement orchestré par les endpoints d'onboarding
(M3.2/M3.3) — il est aussi **appelable comme tool** par l'Investigator via
`ask_kb_builder` (cf. M4.6). Cette issue implémente le handler partagé.

**Fichier.** `backend/agents/kb_builder.py` :
```python
async def answer_kb_question(cell_id: int, question: str) -> dict:
    """Mini-session Messages API pour répondre factuellement à un agent collègue."""
    kb = await mcp_client.call_tool("get_equipment_kb", {"cell_id": cell_id})
    system = (
        "Tu réponds factuellement à un agent collègue qui investigue une panne. "
        "Utilise la KB ci-dessous. Si l'info manque, dis 'inconnu' — ne devine pas. "
        "Réponse concise, JSON: {answer, source, confidence}."
    )
    user = f"KB équipement: {kb}\n\nQuestion: {question}"
    response = await anthropic.messages.create(
        model=model_for("agent"),
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return parse_json_response(response)
```

**Appelé depuis.** Le handler `ask_kb_builder` dans `backend/agents/investigator.py`
(cf. M4.6). Différent du flow onboarding (M3.2/M3.3) : pas de session multi-turn,
pas d'écriture KB, juste lecture + réponse.

**Acceptance.**
- [ ] `await answer_kb_question(2, "Quel torque max boulons turbine ?")` retourne
  `{answer, source, confidence}`
- [ ] Latence < 5s (Sonnet en dev)
- [ ] Si info absente → `answer="inconnu"`, pas d'hallucination

**Bloque.** M4.6 (handoff dynamique Investigator → KB Builder).

---

## Issue M3.6 🟡 — UI tools pour KB Builder onboarding

**Scope.** Pendant l'onboarding (M3.3), le KB Builder émet des `ui_render` events
pour rendre le flow visuel côté frontend.

**Tools utilisés** (déclarés dans `UI_TOOLS` cf. M2.9) :
- `render_kb_progress(steps[{label, status}])` — émit à chaque étape de
  l'onboarding ("Lecture du manuel...", "Extraction des seuils...", "Question 1/4...")
- `render_equipment_kb_card(cell_id, highlight_fields)` — émit à la fin pour
  afficher la KB complète avec les champs nouvellement remplis surlignés

**Pattern d'émission (sans agent loop).** Pour les 2 tools ci-dessus, le KB Builder
n'a pas besoin de raisonner — c'est l'orchestrateur d'onboarding qui broadcast
directement :
```python
await ws_manager.broadcast("ui_render", {
    "agent": "kb_builder",
    "component": "render_kb_progress",
    "props": {"steps": [...]},
    "turn_id": current_turn_id,
})
```

**Acceptance.**
- [ ] PDF upload → 5 events `ui_render` `render_kb_progress` (1 par phase)
- [ ] Fin onboarding → 1 event `ui_render` `render_equipment_kb_card`
- [ ] Frontend M8.6 (Onboarding wizard) consomme correctement

**Bloque.** Frontend M8.6 onboarding wizard.

---

## Bloque

- Scène 1 de la démo (Onboarding)
- Frontend page Onboarding (M8.6)
- M4.6 (handoff Investigator → KB Builder — via M3.5)

## Bloqué par

- M1 (kb_schema, migration 007)
- M2.5 (tool `update_equipment_kb`) et M2.7 (`MCPClient`)
- M2.9 (UI_TOOLS déclarés — pour M3.6)
