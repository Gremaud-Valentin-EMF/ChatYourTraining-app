# Plan - Alignement des calculs TSS sur le modèle TrainingPeaks

## Contexte

ChatYourTraining utilise actuellement des formules TSS simplifiées ou incorrectes. L'objectif est d'aligner **tous les calculs de TSS** sur les formules officielles de TrainingPeaks pour les 5 types de TSS.

---

## Audit du code actuel vs TrainingPeaks

### 1. `calculateCyclingTSS` (TSS Power) - ✅ CORRECT
**Actuel** : `(duration_s × NP × IF) / (FTP × 3600) × 100`
**TrainingPeaks** : Identique.
**Verdict** : Aucune modification nécessaire sur la formule. Seul le fallback `durationMinutes × 0.9` doit être remplacé par un fallback hrTSS.

### 2. `calculateHrTSS` - ❌ TROP SIMPLIFIÉ
**Actuel** : `duration_hours × (avgHR / LTHR)² × 100`
**TrainingPeaks** : Utilise le modèle TRIMP (Training Impulse) avec :
- Heart Rate Reserve (HRR) au lieu du ratio brut HR/LTHR
- Pondération exponentielle genrée (`0.64 × e^(k × HRR)`)
- Accumulation seconde par seconde quand les streams sont disponibles
- Normalisation par le TRIMP d'une heure à LTHR

**Problèmes** :
- Pas de normalisation par la réserve cardiaque (HR_rest ignorée)
- Pas de pondération exponentielle (sous-estime les efforts intenses)
- Pas de constante genrée (k=1.92 homme, k=1.67 femme)
- N'utilise pas les streams HR seconde par seconde

### 3. `calculateRunningTSS` - ❌ INCORRECT
**Actuel** : Utilise la **fréquence cardiaque** (`HRR^1.92 × 100 × duration`)
**TrainingPeaks** : Le rTSS est basé sur l'**allure** (Normalized Graded Pace), PAS sur la HR.
**Problème** : C'est un hrTSS déguisé, pas un vrai rTSS. La formule correcte utilise NGP et le seuil d'allure (FTPace).

### 4. `calculateSwimmingTSS` - ⚠️ PARTIELLEMENT CORRECT
**Actuel** : `IF³ × durationMinutes`, cap à `2 × durationMinutes`
**TrainingPeaks** : `IF³ × duration_hours × 100`
**Problèmes** :
- Scaling incorrect : utilise minutes au lieu de heures × 100
- Exemple : 30 min à IF=0.9 → Actuel: `0.729 × 30 = 21.87` vs Correct: `0.729 × 0.5 × 100 = 36.45`
- Le cap à `2 × duration` est arbitraire et non standard

### 5. `estimateTSSFromRPE` - ⚠️ TABLE INEXACTE
**Actuel** : RPE 5 → intensity 0.6 → 36 TSS/h
**TrainingPeaks (Joe Friel)** : RPE 5 → 50 TSS/h
**Problème** : Table de conversion non alignée sur Friel.

---

## Les 5 types de TSS TrainingPeaks - Formules exactes

### Type 1 : TSS (Power-Based - Vélo)

**Quand l'utiliser** : Activité vélo avec données de puissance.

**Normalized Power (NP)** - Calcul en 4 étapes :
1. Calculer la moyenne glissante 30 secondes des données de puissance
2. Élever chaque valeur à la puissance 4
3. Calculer la moyenne arithmétique des valeurs élevées
4. Prendre la racine 4ème

```
NP = ( (1/N) × Σ P_i^4 )^0.25
```

**Intensity Factor** :
```
IF = NP / FTP
```

**TSS** :
```
TSS = duration_hours × IF² × 100
```

Équivalent à : `(duration_s × NP × IF) / (FTP × 3600) × 100`

**Benchmark** : 1h à FTP = 100 TSS exactement.

**Données nécessaires** :
| Variable | Source | Fallback |
|----------|--------|----------|
| Power stream (seconde/seconde) | `activity_streams` (type=power) | `avg_power_watts` ou Strava `weighted_average_watts` |
| FTP | `user_sports.ftp_watts` (sport=cycling) | 250W par défaut |
| Durée | `actual_duration_minutes` | `moving_time` Strava |

---

### Type 2 : rTSS (Running TSS - Course à pied)

**Quand l'utiliser** : Activité course avec données GPS de pace.

**Normalized Graded Pace (NGP)** - Calcul :
1. Pour chaque point GPS, calculer la vitesse ajustée au dénivelé :
   - Calculer le gradient (pente) entre chaque point
   - Appliquer le facteur de coût énergétique de Minetti :
     ```
     C(i) = 155.4×i⁵ - 30.4×i⁴ - 43.3×i³ + 46.3×i² + 19.5×i + 3.6
     facteur = C(i) / C(0)   où C(0) = 3.6 J/kg/m
     ```
   - Vitesse ajustée = vitesse réelle × facteur
2. Appliquer la normalisation NP sur les vitesses ajustées :
   - Moyenne glissante 30s → puissance 4 → moyenne → racine 4ème
3. Convertir en allure (min/km)

**Functional Threshold Pace (FTPace)** :
- L'allure maximale tenable sur ~1h (ou ~45-60 min selon les sources)
- Peut être dérivée de la VMA : `FTPace ≈ vitesse à 85-88% VMA`

**Intensity Factor** :
```
IF = NGP_speed / FTPace_speed
```
(Utiliser les vitesses, pas les allures - plus rapide = IF plus élevé)

**rTSS** :
```
rTSS = duration_hours × IF² × 100
```

**Benchmark** : 1h à FTPace = ~100 rTSS.

**Données nécessaires** :
| Variable | Source | Fallback |
|----------|--------|----------|
| Speed stream | `activity_streams` (type=speed) | Calcul depuis distance/time streams |
| Distance stream | `activity_streams` (type=distance) | `actual_distance_km` |
| Altitude stream | `activity_streams` (type=altitude) | Pas de NGP, utiliser pace brute |
| FTPace | `user_sports.threshold_pace_per_km` (NOUVEAU) | Dérivé de VMA : `60 / (vma × 0.85)` min/km |
| Durée | `actual_duration_minutes` | - |

**Si pas de streams** : Utiliser `avg_pace_per_km` sans normalisation NGP.
**Si pas de pace du tout** : Fallback vers hrTSS.

---

### Type 3 : sTSS (Swimming TSS - Natation)

**Quand l'utiliser** : Activité natation avec distance et temps.

**Différence clé** : La résistance de l'eau augmente au cube avec la vitesse. L'IF est donc élevé au **cube** (pas au carré).

**Normalized Swim Speed (NSS)** :
```
NSS = distance_totale / temps_actif   (en m/min)
```

**Critical Swim Speed (CSS)** :
- Vitesse maximale tenable sur ~30 min
- Stockée en secondes/100m dans `user_sports.css_per_100m`
- Conversion : `CSS_speed = 100 / css_per_100m × 60` (m/min)

**Intensity Factor** :
```
IF = NSS / CSS_speed
```

**sTSS** :
```
sTSS = IF³ × duration_hours × 100
```

**Benchmark** : 1h à CSS = 100 sTSS exactement.

**Données nécessaires** :
| Variable | Source | Fallback |
|----------|--------|----------|
| Distance | `actual_distance_km` | Strava `distance` |
| Temps actif | `actual_duration_minutes` | Strava `moving_time` |
| CSS | `user_sports.css_per_100m` | 105 s/100m par défaut |

---

### Type 4 : hrTSS (Heart Rate TSS)

**Quand l'utiliser** : Toute activité avec HR, quand aucune donnée de puissance/pace n'est disponible. Fallback universel.

**Formule complète (TRIMP modifié de Banister)** :

Pour chaque intervalle de temps `dt` (en minutes) :
```
TRIMP = Σ ( dt × HRR × 0.64 × e^(k × HRR) )
```

Où :
- `HRR = (HR - HR_rest) / (HR_max - HR_rest)` (Heart Rate Reserve)
- `k = 1.92` (homme) ou `k = 1.67` (femme)
- `e` = nombre d'Euler (2.71828...)

**Normalisation** (TRIMP d'une heure à LTHR) :
```
LTHRR = (LTHR - HR_rest) / (HR_max - HR_rest)
TRIMP_threshold = 60 × LTHRR × 0.64 × e^(k × LTHRR)
```

**hrTSS** :
```
hrTSS = (TRIMP_activity / TRIMP_threshold) × 100
```

**Formule simplifiée** (quand seule la HR moyenne est disponible) :
```
TRIMP_simple = duration_min × HRR_avg × 0.64 × e^(k × HRR_avg)
hrTSS = (TRIMP_simple / TRIMP_threshold) × 100
```

**Benchmark** : 1h à LTHR = 100 hrTSS exactement.

**Données nécessaires** :
| Variable | Source | Fallback |
|----------|--------|----------|
| HR stream (seconde/seconde) | `activity_streams` (type=heartrate) | `avg_hr` de l'activité |
| HR_rest | `physiological_data.hr_rest` | 60 bpm par défaut |
| HR_max | `physiological_data.hr_max` | 220 - âge |
| LTHR | `physiological_data.lthr` | 70% de HR_max |
| Genre | `users.gender` (NOUVEAU si absent) | Homme par défaut (k=1.92) |

---

### Type 5 : TSS par RPE (Perception de l'effort)

**Quand l'utiliser** : Aucune donnée objective disponible (pas de HR, pas de puissance, pas de pace). Musculation, yoga, sports collectifs, etc.

**Table de Joe Friel (TrainingPeaks)** :

| RPE (1-10) | Zone HR approx. | TSS/heure | Description |
|------------|-----------------|-----------|-------------|
| 1 | Z1 basse | 10 | Récupération très facile |
| 2 | Z1 | 20 | Facile |
| 3 | Z1 haute | 30 | Aérobie léger |
| 4 | Z2 basse | 40 | Aérobie modéré |
| 5 | Z2 haute | 50 | Modéré |
| 6 | Z3 | 60 | Modéré-dur |
| 7 | Z4-5a | 70 | Dur (tempo/seuil) |
| 8 | Z5b basse | 80 | Très dur |
| 9 | Z5b haute | 90 | Quasi max soutenu |
| 10 | Z5c | 100 | Maximum (seuil ou +) |

**Formule** :
```
TSS_RPE = TSS_par_heure[RPE] × duration_hours
```

---

## Hiérarchie de priorité TrainingPeaks

L'ordre de sélection du type de TSS quand plusieurs données sont disponibles :

```
1. TSS (puissance)     → Vélo avec power meter
2. rTSS (allure)       → Course avec GPS
3. sTSS (allure nage)  → Natation avec distance/temps
4. hrTSS (FC)          → Tout sport avec cardio
5. TSS RPE (manuel)    → Dernier recours
```

**Règle** : On utilise le type le plus précis disponible. Si l'activité est du vélo avec puissance ET HR, on utilise TSS (puissance), pas hrTSS.

---

## Modifications à effectuer

### Phase 1 : Base de données

#### 1.1 Ajouter `threshold_pace_per_km` à `user_sports`

Le rTSS nécessite un seuil d'allure (FTPace) qui n'existe pas actuellement.

```sql
ALTER TABLE user_sports
  ADD COLUMN threshold_pace_per_km double precision DEFAULT NULL;
-- Stocké en secondes/km (ex: 300 = 5:00/km)
```

#### 1.2 Ajouter `gender` à `users` (si absent)

La formule hrTSS utilise une constante genrée (k=1.92 homme, k=1.67 femme).

**Vérifier** si `users.gender` existe déjà. Si non :
```sql
ALTER TABLE users
  ADD COLUMN gender text DEFAULT NULL CHECK (gender IN ('male', 'female'));
```

#### 1.3 Mettre à jour les types TypeScript

Dans `src/types/database.ts` :
- Ajouter `threshold_pace_per_km` aux types Row/Insert/Update de `user_sports`
- Ajouter `gender` aux types de `users` (si ajouté)

---

### Phase 2 : Réécriture des formules TSS

#### Fichier : `src/lib/calculations/training-load.ts`

##### 2.1 Réécrire `calculateHrTSS`

**Signature actuelle** :
```typescript
calculateHrTSS(movingTimeSeconds, avgHr, lthr)
```

**Nouvelle signature** :
```typescript
calculateHrTSS(params: {
  hrStream?: number[];          // Données seconde/seconde (prioritaire)
  avgHr?: number;               // Fallback si pas de stream
  hrRest: number;               // FC repos
  hrMax: number;                // FC max
  lthr: number;                 // Seuil lactique cardiaque
  durationSeconds: number;      // Durée totale
  gender?: 'male' | 'female';  // Pour constante k (défaut: male)
}): number
```

**Implémentation** :
1. Calculer `LTHRR = (LTHR - HR_rest) / (HR_max - HR_rest)`
2. Calculer `TRIMP_threshold = 60 × LTHRR × 0.64 × e^(k × LTHRR)`
3. **Si hrStream disponible** :
   - Pour chaque seconde : `HRR_i = (HR_i - HR_rest) / (HR_max - HR_rest)`, clampé entre 0 et 1
   - `TRIMP = Σ ( (1/60) × HRR_i × 0.64 × e^(k × HRR_i) )` (dt=1/60 min car données en secondes)
4. **Si seulement avgHr** :
   - `HRR_avg = (avgHr - HR_rest) / (HR_max - HR_rest)`, clampé entre 0 et 1
   - `TRIMP = (duration_min) × HRR_avg × 0.64 × e^(k × HRR_avg)`
5. `hrTSS = (TRIMP / TRIMP_threshold) × 100`
6. Arrondir et retourner

##### 2.2 Réécrire `calculateRunningTSS` → `calculateRTSS`

**Renommer** la fonction pour clarifier qu'elle utilise l'allure, pas la HR.

**Nouvelle signature** :
```typescript
calculateRTSS(params: {
  speedStream?: number[];       // Vitesse m/s seconde/seconde
  distanceStream?: number[];    // Distance cumulative en mètres
  altitudeStream?: number[];    // Altitude en mètres (pour NGP)
  avgPacePerKm?: number;        // Allure moyenne en s/km (fallback)
  distanceKm?: number;          // Distance totale (fallback)
  durationSeconds: number;      // Durée totale
  thresholdPacePerKm: number;   // Seuil d'allure en s/km (FTPace)
}): number
```

**Implémentation** :
1. **Si streams speed + altitude disponibles** → Calculer NGP :
   a. Pour chaque point, calculer le gradient
   b. Appliquer le coût Minetti pour obtenir la vitesse ajustée
   c. Normaliser avec l'algorithme NP (rolling 30s → ^4 → mean → ^0.25)
   d. `NGP_speed` = résultat en m/s
2. **Si seulement stream speed** → Normaliser sans ajustement gradient
3. **Si seulement avgPacePerKm** → `avg_speed = 1000 / avgPacePerKm` (m/s)
4. Calculer `FTPace_speed = 1000 / thresholdPacePerKm` (m/s)
5. `IF = NGP_speed / FTPace_speed`
6. `rTSS = duration_hours × IF² × 100`

##### 2.3 Corriger `calculateSwimmingTSS` → `calculateSTSS`

**Nouvelle signature** :
```typescript
calculateSTSS(params: {
  distanceMeters: number;       // Distance nagée en mètres
  durationSeconds: number;      // Temps actif (hors repos)
  cssPer100m: number;           // CSS en secondes/100m
}): number
```

**Implémentation** :
1. `NSS = (distanceMeters / 100) / (durationSeconds / 60)` → vitesse en 100m/min... Non.
   Plus simple : `swim_speed = distanceMeters / durationSeconds` (m/s)
   `css_speed = 100 / cssPer100m` (m/s)
2. `IF = swim_speed / css_speed`
3. `sTSS = IF³ × duration_hours × 100`
4. **Pas de cap artificiel**. Un IF > 1 est possible en compétition.

##### 2.4 Corriger `estimateTSSFromRPE`

Aligner la table sur celle de Joe Friel :

```typescript
const FRIEL_TSS_PER_HOUR: Record<number, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 60,
  7: 70,
  8: 80,
  9: 90,
  10: 100,
};
```

**Formule** : `TSS = FRIEL_TSS_PER_HOUR[rpe] × duration_hours`

##### 2.5 Conserver `calculateCyclingTSS` tel quel

La formule est correcte. Modifier uniquement :
- Supprimer le fallback `durationMinutes × 0.9`
- Retourner `0` si données insuffisantes (le caller gèrera le fallback)

##### 2.6 Ajouter une fonction orchestratrice `calculateActivityTSS`

Nouvelle fonction qui applique la **hiérarchie de priorité** TrainingPeaks :

```typescript
calculateActivityTSS(params: {
  sport: string;                    // 'cycling' | 'running' | 'swimming' | 'other'
  durationSeconds: number;
  // Power data
  powerStream?: number[];
  avgPowerWatts?: number;
  ftp?: number;
  // Pace data (running)
  speedStream?: number[];
  distanceStream?: number[];
  altitudeStream?: number[];
  avgPacePerKm?: number;
  distanceKm?: number;
  thresholdPacePerKm?: number;
  // Swim data
  distanceMeters?: number;
  cssPer100m?: number;
  // HR data
  hrStream?: number[];
  avgHr?: number;
  hrRest?: number;
  hrMax?: number;
  lthr?: number;
  gender?: 'male' | 'female';
  // RPE
  rpe?: number;
}): { tss: number; type: 'tss' | 'rtss' | 'stss' | 'hrtss' | 'rpe' | 'estimated' }
```

**Logique** :

```
1. Si sport=cycling ET (powerStream OU avgPowerWatts) ET ftp
   → Retourner { tss: calculateCyclingTSS(...), type: 'tss' }

2. Si sport=running ET (speedStream OU avgPacePerKm) ET thresholdPacePerKm
   → Retourner { tss: calculateRTSS(...), type: 'rtss' }

3. Si sport=swimming ET distanceMeters ET cssPer100m
   → Retourner { tss: calculateSTSS(...), type: 'stss' }

4. Si (hrStream OU avgHr) ET hrRest ET hrMax ET lthr
   → Retourner { tss: calculateHrTSS(...), type: 'hrtss' }

5. Si rpe
   → Retourner { tss: estimateTSSFromRPE(...), type: 'rpe' }

6. Sinon (aucune donnée)
   → Estimation basique par durée et sport
   → Retourner { tss: estimated, type: 'estimated' }
```

---

### Phase 3 : Utilitaires de normalisation

#### Fichier : `src/lib/calculations/training-load.ts` (ou nouveau fichier `src/lib/calculations/normalization.ts`)

##### 3.1 `calculateNormalizedPower(powerStream: number[]): number`

Déjà implémenté quelque part dans le codebase (vérifier). Si non :
1. Rolling average 30s
2. Élever à la puissance 4
3. Moyenne
4. Racine 4ème

##### 3.2 `calculateNormalizedGradedPace(speedStream, distanceStream, altitudeStream): number`

Déjà implémenté quelque part dans le codebase (vérifier). Si non :
1. Pour chaque point : calculer le gradient `(alt[i+1] - alt[i]) / (dist[i+1] - dist[i])`
2. Calculer le coût Minetti : `C(i) = 155.4×i⁵ - 30.4×i⁴ - 43.3×i³ + 46.3×i² + 19.5×i + 3.6`
3. Facteur = `C(gradient) / 3.6`
4. Vitesse ajustée = `speed[i] × facteur`
5. Appliquer la normalisation NP sur les vitesses ajustées
6. Retourner la vitesse normalisée en m/s

##### 3.3 `calculateNormalizedHeartRate(hrStream: number[]): number`

Déjà implémenté quelque part dans le codebase (vérifier). Même algorithme que NP mais avec les données HR.

---

### Phase 4 : Mise à jour du sync Strava

#### Fichier : `src/app/api/sync/strava/route.ts`

##### 4.1 Remplacer les calculs actuels

Actuellement, le sync Strava a sa propre logique de calcul TSS inline. Remplacer par un appel à `calculateActivityTSS()` avec toutes les données disponibles.

**Avant** (logique dupliquée inline) :
```typescript
// Plein de if/else avec des formules manuelles
```

**Après** :
```typescript
const { tss, type } = calculateActivityTSS({
  sport: mappedSportName,
  durationSeconds: stravaActivity.moving_time,
  powerStream: streams?.watts,
  avgPowerWatts: stravaActivity.average_watts || stravaActivity.weighted_average_watts,
  ftp: userSport?.ftp_watts,
  speedStream: streams?.speed,
  distanceStream: streams?.distance,
  altitudeStream: streams?.altitude,
  avgPacePerKm: calculatedAvgPace,
  distanceKm: stravaActivity.distance / 1000,
  thresholdPacePerKm: userSport?.threshold_pace_per_km,
  hrStream: streams?.heartrate,
  avgHr: stravaActivity.average_heartrate,
  hrRest: physioData?.hr_rest,
  hrMax: physioData?.hr_max,
  lthr: physioData?.lthr,
  gender: user?.gender,
  rpe: null,
});
```

##### 4.2 Stocker le type de TSS utilisé

Ajouter un champ `tss_type` à la table `activities` pour tracer quel type de TSS a été calculé :

```sql
ALTER TABLE activities
  ADD COLUMN tss_type text DEFAULT NULL
  CHECK (tss_type IN ('tss', 'rtss', 'stss', 'hrtss', 'rpe', 'estimated'));
```

Cela permettra à l'utilisateur de savoir la fiabilité du TSS affiché.

---

### Phase 5 : Mise à jour du sync Whoop

#### Fichier : `src/app/api/sync/whoop/route.ts`

##### 5.1 Utiliser hrTSS au lieu de la conversion strain

Actuellement : `TSS = (strain/21)² × 200` (mapping arbitraire).

**Nouveau** : Utiliser les données HR du workout Whoop :
1. Si `average_heart_rate` disponible → `calculateHrTSS()` avec les seuils utilisateur
2. Sinon → garder l'estimation par strain comme fallback

---

### Phase 6 : Mise à jour de l'UI

#### 6.1 Afficher le type de TSS

Dans les vues d'activité (`workouts/[id]/page.tsx`), afficher un badge indiquant le type de TSS :

| Type | Badge | Couleur |
|------|-------|---------|
| TSS (puissance) | `TSS` | Bleu (haute fiabilité) |
| rTSS (allure) | `rTSS` | Vert |
| sTSS (natation) | `sTSS` | Cyan |
| hrTSS (FC) | `hrTSS` | Orange (fiabilité moyenne) |
| RPE | `RPE` | Gris (estimation) |
| Estimé | `~TSS` | Gris clair (basse fiabilité) |

#### 6.2 Ajouter le seuil d'allure au profil

Dans la page profil ou onboarding, permettre à l'utilisateur de renseigner :
- **Seuil d'allure course** (`threshold_pace_per_km`) - en min:sec/km
- **Genre** (pour hrTSS) - si pas déjà collecté

---

### Phase 7 : Script de backfill

#### Fichier : `scripts/backfill-tss.ts`

Recalculer le TSS de toutes les activités existantes avec les nouvelles formules :

1. Charger toutes les activités avec leurs streams
2. Charger les données physiologiques et seuils de chaque utilisateur
3. Pour chaque activité : appeler `calculateActivityTSS()` avec toutes les données disponibles
4. Mettre à jour `activities.tss` et `activities.tss_type`
5. Recalculer CTL/ATL/TSB pour chaque utilisateur

---

## Fichiers à modifier

### Fichiers modifiés

| Fichier | Modifications |
|---------|--------------|
| `src/lib/calculations/training-load.ts` | Réécriture hrTSS, rTSS, sTSS, RPE + ajout orchestrateur `calculateActivityTSS` |
| `src/app/api/sync/strava/route.ts` | Remplacer calculs inline par appel à `calculateActivityTSS()` |
| `src/app/api/sync/whoop/route.ts` | Utiliser hrTSS au lieu de conversion strain |
| `src/types/database.ts` | Ajouter `threshold_pace_per_km`, `tss_type`, `gender` |
| `src/app/(dashboard)/workouts/[id]/page.tsx` | Afficher badge type TSS |

### Fichiers potentiellement créés

| Fichier | Description |
|---------|-------------|
| `src/lib/calculations/normalization.ts` | Fonctions NP, NGP, NHR (si pas déjà existantes) |
| `scripts/backfill-tss.ts` | Script de recalcul massif |

### Migration SQL

```sql
-- 1. Seuil d'allure pour rTSS
ALTER TABLE user_sports
  ADD COLUMN threshold_pace_per_km double precision DEFAULT NULL;

-- 2. Type de TSS calculé
ALTER TABLE activities
  ADD COLUMN tss_type text DEFAULT NULL
  CHECK (tss_type IN ('tss', 'rtss', 'stss', 'hrtss', 'rpe', 'estimated'));

-- 3. Genre (si absent)
ALTER TABLE users
  ADD COLUMN gender text DEFAULT NULL
  CHECK (gender IN ('male', 'female'));
```

---

## Ordre d'implémentation recommandé

```
Phase 1 : Migration DB + types TypeScript
    ↓
Phase 2 : Réécriture formules TSS (training-load.ts)
    ↓
Phase 3 : Utilitaires de normalisation (si manquants)
    ↓
Phase 4 : Mise à jour sync Strava
    ↓
Phase 5 : Mise à jour sync Whoop
    ↓
Phase 6 : UI (badge type TSS + seuil allure profil)
    ↓
Phase 7 : Backfill des activités existantes
```

---

## Vérification

### Tests unitaires des formules

| Test | Entrée | Résultat attendu |
|------|--------|-----------------|
| TSS vélo 1h à FTP | NP=250, FTP=250, dur=3600s | **100 TSS** |
| TSS vélo 30min à 80% FTP | NP=200, FTP=250, dur=1800s | **32 TSS** |
| rTSS 1h à FTPace | pace=FTPace, dur=3600s | **~100 rTSS** |
| sTSS 1h à CSS | IF=1.0, dur=3600s | **100 sTSS** |
| hrTSS 1h à LTHR | HR=LTHR constant, dur=3600s | **100 hrTSS** |
| RPE 5, 1h | RPE=5, dur=60min | **50 TSS** |
| RPE 7, 1.5h | RPE=7, dur=90min | **105 TSS** |

### Tests d'intégration

1. Sync Strava d'une activité vélo avec puissance → vérifier TSS power calculé + `tss_type = 'tss'`
2. Sync Strava d'une course avec GPS → vérifier rTSS calculé + `tss_type = 'rtss'`
3. Sync Strava d'une nage avec distance → vérifier sTSS calculé + `tss_type = 'stss'`
4. Sync Strava d'une activité avec uniquement HR → vérifier hrTSS calculé + `tss_type = 'hrtss'`
5. Activité manuelle avec RPE → vérifier TSS RPE + `tss_type = 'rpe'`
6. Vérifier que CTL/ATL/TSB sont recalculés correctement avec les nouveaux TSS

### Comparaison avec TrainingPeaks

Si tu as un compte TrainingPeaks :
- Comparer le TSS de 5-10 activités entre ChatYourTraining et TrainingPeaks
- Les valeurs devraient être à ±5% pour TSS power et rTSS
- hrTSS peut varier davantage (±15%) selon les implémentations

---

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Seuils utilisateur non renseignés (FTP, LTHR, FTPace) | Fallback vers des valeurs par défaut raisonnables + message incitant à renseigner les seuils |
| Streams non disponibles pour certaines activités | Cascade automatique vers la formule simplifiée (avg au lieu de stream) |
| Recalcul massif lourd (backfill) | Script batch avec traitement par lots de 100 activités |
| Formule NGP propriétaire TrainingPeaks | Utiliser l'approximation Minetti (standard scientifique publié) |
| Genre non renseigné | Défaut à `male` (k=1.92), la différence est mineure (~12% sur hrTSS) |
| Changement de TSS après backfill modifie CTL/ATL/TSB | Prévenir l'utilisateur que les métriques de charge seront recalculées |
