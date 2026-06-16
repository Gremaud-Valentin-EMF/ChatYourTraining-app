# Protocole de test — Analyse des objectifs (onboarding)

Ce document liste **tous les cas de test** à dérouler pour valider l'analyse des
objectifs déclarée en fin d'onboarding (étape « Terminer »).

---

## 1. Architecture testée

L'analyse combine **deux moteurs** dont il faut vérifier les comportements
séparément :

| Moteur | Règles | Où | Fiabilité |
|--------|--------|-----|-----------|
| **Déterministe** (TypeScript) | RÈGLE 0, RÈGLE 1 — délais de récupération entre épreuves datées | `src/app/api/objectives/analyze/route.ts` → `detectRecoveryConflicts` | 100% reproductible |
| **LLM** (OpenAI / Gemini) | RÈGLES 2 à 6 — surcharge, incompatibilité physiologique, objectif non daté, volume, hors-périmètre | même fichier → `buildAnalysisPrompt` | Probabiliste — tolérer des variations |

Les alertes des deux moteurs sont fusionnées et **triées** : `critical` →
`warning` → `info`. Un échec du LLM **ne doit jamais** masquer les alertes
déterministes.

---

## 2. Prérequis & exécution

### Option A — via l'interface (test end-to-end)
1. `npm run dev` puis ouvrir `http://localhost:3000/onboarding`.
2. Renseigner les étapes 1 à 5 (profil, cardio, sports, niveaux, disponibilités).
   - À l'étape 3, sélectionner les sports concernés par le cas de test.
   - À l'étape disponibilités, fixer le volume cible (`target_hours`) selon le cas.
3. À l'étape objectifs, ajouter les objectifs du cas via la modale.
4. Cliquer sur **« Terminer »** → l'analyse se lance.
5. Observer : écran d'alertes (rouge/ambre/bleu) **ou** écran de succès vert.

### Option B — via l'API directe (test rapide du moteur déterministe)
```bash
curl -s http://localhost:3000/api/objectives/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "objectives": [
      { "tempId": "1", "family": "competition", "name": "Marathon", "priority": "A", "event_date": "2026-08-30", "description": "" },
      { "tempId": "2", "family": "competition", "name": "Cyclosportive", "priority": "A", "event_date": "2026-09-03", "description": "" }
    ],
    "target_hours": 8,
    "sports": ["running", "cycling"]
  }' | jq
```
> Champs utilisés par le moteur déterministe : `family`, `name`, `event_date`,
> `target_distance_km`, `event_name`. Les autres champs alimentent le prompt LLM.

---

## 3. Référentiel des délais minimaux de récupération

Valeurs renvoyées par `classifyRecovery` (minimum **même sport**) :

| Épreuve | Catégorie sport | minDays |
|---------|-----------------|---------|
| 5 km, 10 km | running | 7 |
| Semi-marathon | running | 14 |
| Marathon | running | 28 |
| Ultra-trail / Trail | running | 42 |
| Cyclosportive / Gran Fondo — **< 150 km** | cycling | 10 |
| Cyclosportive / Gran Fondo — **≥ 150 km ou distance absente** | cycling | 14 |
| Gravel event | cycling | 10 |
| Course sur route | cycling | 7 |
| Enduro, Marathon VTT | mtb | 10 |
| XCO | mtb | 7 |
| Descente VTT | mtb | 5 |
| Marche nordique compétition, Marche athlétique | walking | 7 |
| Randonnée sportive chronométrée, Raid, Trek multi-jours, Haute randonnée | hiking | 14 |
| Skyrace / Ultra-trail rando | hiking | 21 |
| Descente chronométrée, Compétition de ski alpin | alpine-skiing | 5 |
| Skiathlon, Marathon nordique, Course de ski de fond | xc-skiing | 10 |
| Powerlifting, Haltérophilie, Force athlétique | strength | 14 |
| Épreuve « Autre » / nom non reconnu | other | 14 (conservatif) |

### Coefficient cross-sport
- **Même catégorie sport** → `required = max(minDays_A, minDays_B)`
- **Catégories différentes** → `required = ceil(max(minDays_A, minDays_B) × 0,75)`

### Seuils d'alerte (sur l'écart `gap` en jours)
| Condition | Niveau | Règle |
|-----------|--------|-------|
| `gap < 7` | **critical** | RÈGLE 0 (absolu, prioritaire) |
| `7 ≤ gap < required` | **critical** | RÈGLE 1 |
| `required ≤ gap < required × 1,5` | **warning** | RÈGLE 1 |
| `gap ≥ required × 1,5` | _(aucune alerte)_ | — |

---

## 4. Cas de test — Moteur déterministe (RÈGLE 0 & 1)

> Toutes les dates sont en 2026. Vérifier la **valeur exacte** du `gap` affichée
> et la cohérence des chiffres « il manque X jours ».

### Groupe A — RÈGLE 0 (écart absolu < 7 jours)

| ID | Objectifs (dates) | Écart | Résultat attendu |
|----|-------------------|-------|------------------|
| A1 | Marathon 30/08 + Cyclosportive 03/09 | 4 j | **critical** RÈGLE_0 · « manque 3 jours » pour atteindre 7 · délai recommandé 21 j mentionné |
| A2 | 10 km 01/06 + 5 km 02/06 | 1 j | **critical** RÈGLE_0 · « manque 6 jours » (singulier « jour » pour 1) |
| A3 | Deux Marathons même date 30/08 | 0 j | **critical** RÈGLE_0 · « séparés de seulement 0 jour » · manque 7 |
| A4 | Marathon 30/08 + Powerlifting 04/09 | 5 j | **critical** RÈGLE_0 (vérifier aussi RÈGLE 3 LLM en bonus) |
| A5 | Cyclosportive 01/06 + Course sur route 06/06 | 5 j | **critical** RÈGLE_0 (même catégorie cycling) |

### Groupe B — RÈGLE 1 même sport (pas de coefficient)

**Deux marathons** → `required = 28`, bande warning 28–41, libre ≥ 42.

| ID | Dates | Écart | Résultat attendu |
|----|-------|-------|------------------|
| B1 | 30/08 + 25/09 | 26 j | **critical** RÈGLE_1 · minimum 28 · manque 2 |
| B2 | 30/08 + 26/09 | 27 j | **critical** RÈGLE_1 · manque 1 (singulier) |
| B3 | 30/08 + 27/09 | 28 j | **warning** RÈGLE_1 · = minimum · manque 0 |
| B4 | 30/08 + 10/10 | 41 j | **warning** RÈGLE_1 |
| B5 | 30/08 + 11/10 | 42 j | **aucune alerte** (≥ 28×1,5) |

**Deux 10 km** → `required = 7`, warning 7–10, libre ≥ 11.

| ID | Dates | Écart | Résultat attendu |
|----|-------|-------|------------------|
| B6 | 01/06 + 07/06 | 6 j | **critical** RÈGLE_0 (< 7 prioritaire) |
| B7 | 01/06 + 08/06 | 7 j | **warning** RÈGLE_1 (7 = required) |
| B8 | 01/06 + 11/06 | 10 j | **warning** RÈGLE_1 |
| B9 | 01/06 + 12/06 | 11 j | **aucune alerte** |

### Groupe C — RÈGLE 1 cross-sport (coefficient ×0,75)

**Marathon (28) + Cyclosportive sans distance (14)** → `raw=28`, `required=ceil(28×0,75)=21`, warning 21–31, libre ≥ 32.

| ID | Dates | Écart | Résultat attendu |
|----|-------|-------|------------------|
| C1 | 30/08 + 14/09 | 15 j | **critical** RÈGLE_1 · note « 28 × 0,75 = 21 jours » · manque 6 |
| C2 | 30/08 + 19/09 | 20 j | **critical** RÈGLE_1 · manque 1 |
| C3 | 30/08 + 20/09 | 21 j | **warning** RÈGLE_1 · note « réduit à 75% » |
| C4 | 30/08 + 30/09 | 31 j | **warning** RÈGLE_1 |
| C5 | 30/08 + 01/10 | 32 j | **aucune alerte** |

**Ultra-trail (42) + Gravel (10)** → `raw=42`, `required=ceil(42×0,75)=32`.

| ID | Dates | Écart | Résultat attendu |
|----|-------|-------|------------------|
| C6 | 01/05 + 01/06 | 31 j | **critical** RÈGLE_1 · minimum 32 · manque 1 |
| C7 | 01/05 + 02/06 | 32 j | **warning** RÈGLE_1 |

### Groupe D — Cyclosportive selon la distance

| ID | Objectifs | Attendu |
|----|-----------|---------|
| D1 | Cyclosportive **100 km** + Cyclosportive **100 km**, écart 9 j | **critical** (required=10, même sport) · manque 1 |
| D2 | Cyclosportive **100 km** + Cyclosportive **100 km**, écart 10 j | **warning** (=10) |
| D3 | Cyclosportive **180 km** + Cyclosportive **180 km**, écart 13 j | **critical** (required=14) · manque 1 |
| D4 | Cyclosportive **sans distance** + même, écart 13 j | **critical** (required=14 conservatif) |
| D5 | Vérifier que renseigner 149 km vs 150 km bascule bien 10↔14 j | Comportement conforme au seuil |

### Groupe E — Couverture par catégorie de sport

Tester au moins une paire **même sport** par catégorie pour valider le mapping :

| ID | Catégorie | Paire suggérée (écart court) | Attendu |
|----|-----------|------------------------------|---------|
| E1 | mtb | Marathon VTT + Enduro, écart 8 j | **critical** (required=10) |
| E2 | mtb | Descente VTT + Descente VTT, écart 4 j | **critical** RÈGLE_0 |
| E3 | walking | Marche athlétique + Marche nordique, écart 6 j | **critical** RÈGLE_0 |
| E4 | hiking | Trek multi-jours + Raid, écart 12 j | **critical** (required=14) |
| E5 | hiking | Skyrace + Skyrace, écart 20 j | **critical** (required=21) |
| E6 | alpine-skiing | Compétition ski alpin + Descente chronométrée, écart 4 j | **critical** RÈGLE_0 |
| E7 | xc-skiing | Skiathlon + Course de ski de fond, écart 9 j | **critical** (required=10) |
| E8 | strength | Powerlifting + Haltérophilie, écart 13 j | **critical** (required=14, même sport, **pas** de coefficient) |

### Groupe F — Combinaisons multiples (toutes les paires)

| ID | Objectifs | Attendu |
|----|-----------|---------|
| F1 | Marathon 30/08 (A) + Cyclosportive 03/09 (A) + 10 km 05/09 (B) | **3 alertes** (chaque paire évaluée), triées critical d'abord |
| F2 | 3 épreuves espacées de > seuils (ex : 01/03, 01/06, 01/10) | **aucune alerte** de récupération |

---

## 5. Cas de test — Objectifs exclus du calcul déterministe

| ID | Objectif(s) | Attendu |
|----|-------------|---------|
| G1 | 2 objectifs **performance** datés rapprochés (`target_date`) | **aucune** alerte RÈGLE 0/1 (seules les `competition` datées comptent) |
| G2 | 2 objectifs **wellness** | aucune alerte déterministe |
| G3 | 1 competition datée + 1 performance datée 2 j après | aucune alerte de récupération entre elles |

---

## 6. Cas de test — Moteur LLM (RÈGLES 2 à 6)

> Résultats **probabilistes** : valider que l'alerte attendue est **généralement**
> présente. Re-tester 2-3 fois en cas de doute. Le niveau peut varier d'un cran.

| ID | Règle | Scénario | Attendu (tendance) |
|----|-------|----------|--------------------|
| H1 | RÈGLE 2 | 3 objectifs priorité **A** dans une fenêtre de 8 semaines | **warning** surcharge |
| H2 | RÈGLE 3 | Marathon + Compétition powerlifting à < 6 semaines | **critical** incompatibilité |
| H3 | RÈGLE 3 | Marathon + objectif muscu membres inférieurs intensifs | **warning** |
| H4 | RÈGLE 4 | Compétition datée < 8 sem + objectif priorité A **non daté** d'un autre sport | **info** : inviter à dater/déprioriser |
| H5 | RÈGLE 5 | Marathon avec `target_hours = 2` (2 h/sem) | **warning/critical** volume insuffisant |
| H6 | RÈGLE 5 | Ultra-trail avec `target_hours = 4` | **warning/critical** |
| H7 | RÈGLE 6 | Description libre médicale : « perdre 10 kg », « gérer mon anxiété » | **warning** hors-périmètre |
| H8 | — | Le LLM **ne doit pas** produire d'alerte de récupération entre dates (déléguée au déterministe) | Pas de doublon RÈGLE 0/1 venant du LLM |

---

## 7. Cas de test — Robustesse & découplage

| ID | Manipulation | Attendu |
|----|--------------|---------|
| R1 | **Désactiver la clé IA** (vider `OPENAI_API_KEY` / `GOOGLE_GEMINI_API_KEY`) puis rejouer A1 | L'alerte **critical** de dates s'affiche **quand même** (preuve du découplage) |
| R2 | Provider injoignable / quota dépassé | Alertes déterministes conservées, pas de crash, log serveur `Objectives AI analysis failed` |
| R3 | Tri des alertes : un cas mêlant critical + warning + info | Ordre d'affichage : critical → warning → info |
| R4 | **Fuseau horaire** : rejouer A1 avec `TZ=America/New_York npm run dev` et `TZ=Asia/Tokyo` | `gap` = **4 jours** dans les deux cas (calcul UTC, aucun décalage) |
| R5 | Réponse LLM non-JSON / tronquée | Ignorée proprement, alertes déterministes seules retournées |

---

## 8. Cas de test — Comportement frontend (`handleTerminate`)

| ID | Action | Attendu |
|----|--------|---------|
| UI1 | Cliquer « Terminer » avec **0 objectif** | Message « Ajoutez au moins un objectif pour continuer » · pas d'appel API |
| UI2 | Analyse renvoyant des alertes | Écran d'alertes affiché · couleurs : critical=rouge, warning=ambre, info=bleu |
| UI3 | Analyse renvoyant `{ alerts: [] }` | Écran de **succès vert** « Objectifs validés » |
| UI4 | API en erreur (404/500) ou réseau coupé | **Message d'erreur** « L'analyse de vos objectifs a échoué… » · **PAS** d'écran de succès · reste sur la page |
| UI5 | Bouton « Modifier mes objectifs » depuis l'écran d'alertes | Retour à la liste des objectifs (`showAlerts = false`) |
| UI6 | Pendant l'analyse | Indicateur de chargement (`isAnalyzing`) actif, bouton désactivé |
| UI7 | Après succès → « Continuer » → `handleComplete` | Objectifs enregistrés avec `metadata` · `onboarding_completed = true` · redirection dashboard |

---

## 9. Limitations connues (à documenter, pas des bugs)

- **Deux épreuves « Autre »** sont toutes deux classées catégorie `other` →
  traitées comme **même sport** (pas de coefficient ×0,75) avec `required = 14`.
- Le coefficient cross-sport est **forfaitaire (0,75)** : il ne distingue pas
  les paires de sports proches (course/trail) des paires éloignées (course/natation).
- Le moteur déterministe ne traite **que** les `competition` **datées**. Les
  objectifs performance/wellness datés ne déclenchent pas de contrôle de récupération.
- La détection RÈGLE 6 (hors-périmètre) dépend du LLM : un contenu médical
  formulé de façon détournée peut passer.

---

## 10. Fiche de suivi (à cocher)

```
Déterministe
[ ] A1  [ ] A2  [ ] A3  [ ] A4  [ ] A5
[ ] B1  [ ] B2  [ ] B3  [ ] B4  [ ] B5  [ ] B6  [ ] B7  [ ] B8  [ ] B9
[ ] C1  [ ] C2  [ ] C3  [ ] C4  [ ] C5  [ ] C6  [ ] C7
[ ] D1  [ ] D2  [ ] D3  [ ] D4  [ ] D5
[ ] E1  [ ] E2  [ ] E3  [ ] E4  [ ] E5  [ ] E6  [ ] E7  [ ] E8
[ ] F1  [ ] F2
[ ] G1  [ ] G2  [ ] G3

LLM
[ ] H1  [ ] H2  [ ] H3  [ ] H4  [ ] H5  [ ] H6  [ ] H7  [ ] H8

Robustesse
[ ] R1  [ ] R2  [ ] R3  [ ] R4  [ ] R5

Frontend
[ ] UI1 [ ] UI2 [ ] UI3 [ ] UI4 [ ] UI5 [ ] UI6 [ ] UI7
```
