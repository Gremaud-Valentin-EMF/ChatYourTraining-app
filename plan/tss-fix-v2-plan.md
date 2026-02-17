# Plan de correction TSS v2 — Alignement TrainingPeaks

## Contexte

Après les corrections v1 (TRIMP gender-specific, fenêtre trailing NP, Minetti gradient clamp, elapsed_time guard), les TSS diffèrent toujours de TrainingPeaks. Cette v2 corrige les problèmes restants identifiés.

---

## Problème 1 : TRIMP `dt` ne respecte pas le timeStream (IMPACT FORT)

### Situation actuelle
```js
// training-load.ts:187
const dtMinutes = (durationSeconds / hrStream.length) / 60;
```
- Distribue uniformément la durée totale sur les points
- `durationSeconds` peut être `elapsedTimeSeconds` (pauses incluses) mais le HR stream ne couvre que le temps enregistré
- Strava streams ne sont PAS uniformément espacés (1.85s/pt en moyenne, mais varie)

### Fix
Dans `calculateHrTSS` (training-load.ts) :
- Ajouter un paramètre optionnel `timeStream?: number[]`
- Si `timeStream` est disponible et de même longueur que `hrStream` :
  ```js
  for (let i = 1; i < hrStream.length; i++) {
    const dtMinutes = (timeStream[i] - timeStream[i - 1]) / 60;
    const hrr = clamp((hr[i] - hrRest) / (hrMax - hrRest), 0, 1);
    trimp += dtMinutes * hrr * b * exp(k * hrr);
  }
  ```
- Si pas de timeStream, garder le fallback actuel mais utiliser la durée du stream (`timeStream[last] - timeStream[0]`) plutôt que `durationSeconds`

### Fichiers impactés
- `src/lib/calculations/training-load.ts` — `calculateHrTSS()` : ajouter param `timeStream`, changer la boucle TRIMP
- `src/lib/calculations/training-load.ts` — `calculateActivityTSS()` : passer le `timeStream` à `calculateHrTSS`
- `src/lib/integrations/strava.ts` — `convertStravaActivity()` : passer `timeStream` dans les params de l'orchestrateur
- `scripts/recalculate-tss.js` — `calculateHrTSS()` : même fix, passer timeStream

---

## Problème 2 : NP pré-calculé (time-based) ignoré par le sync route (IMPACT MOYEN)

### Situation actuelle
1. Le sync route calcule NP via `calculateNormalizedPower()` (strava.ts) avec fenêtres temporelles → `options.normalizedPower`
2. `convertStravaActivity()` passe le `powerStream` brut à l'orchestrateur
3. L'orchestrateur recalcule NP via `calculateNormalizedValue()` (training-load.ts) en point-based (30 points, pas 30 secondes)
4. Le NP time-based est jeté (seulement stocké dans `_calculated.normalized_power`)

### Fix
Dans `convertStravaActivity()` (strava.ts), passer le NP pré-calculé à l'orchestrateur au lieu du powerStream :
- Si `options.normalizedPower` existe, l'utiliser comme `avgPowerWatts` dans les params de l'orchestrateur et ne PAS passer `powerStream`
- Idem pour `normalizedPaceSeconds` : déjà géré via `effectivePacePerKm`, c'est OK

Alternativement (plus propre) : ajouter un champ `normalizedPower` à l'interface de `calculateActivityTSS` dans training-load.ts, et l'utiliser en priorité avant de recalculer depuis `powerStream`.

### Fichiers impactés
- `src/lib/calculations/training-load.ts` — `calculateCyclingTSS()` : ajouter param `normalizedPower` optionnel, l'utiliser en priorité
- `src/lib/integrations/strava.ts` — `convertStravaActivity()` : passer `normalizedPower` au lieu de `powerStream` quand disponible

---

## Problème 3 : Classification sport incomplète dans `convertStravaActivity` (IMPACT MOYEN)

### Situation actuelle
```js
// strava.ts:559-567
if (sportType === "Run" || sportType === "Trail Run") sport = "running";
else if (sportType === "Ride" || sportType === "VirtualRide") sport = "cycling";
else if (sportType === "Swim") sport = "swimming";
```
Manquent : `GravelRide`, `MountainBikeRide`, `EMountainBikeRide`, `VirtualRun`, `EBikeRide`, `Handcycle`, `Velomobile`.

### Fix
Utiliser un mapping complet qui réutilise la logique de `mapStravaSportType()` :
```js
const mappedSport = mapStravaSportType(sportType);
if (mappedSport === "running" || mappedSport === "trail_running") sport = "running";
else if (mappedSport === "cycling" || mappedSport === "spin") sport = "cycling";
else if (mappedSport === "swimming") sport = "swimming";
```
Ou plus simplement, dupliquer les types dans le mapping inline :
```js
const runTypes = ["Run", "Trail Run", "VirtualRun"];
const cycleTypes = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EMountainBikeRide", "EBikeRide", "Handcycle", "Velomobile"];
const swimTypes = ["Swim"];
```

### Fichiers impactés
- `src/lib/integrations/strava.ts` — `convertStravaActivity()` : étendre le mapping sport
- `scripts/recalculate-tss.js` — la classification par nom de sport DB semble OK (cycling, running, swimming) mais vérifier que les noms DB correspondent

---

## Problème 4 : Utiliser `weighted_average_watts` de Strava comme fallback NP (IMPACT FAIBLE)

### Situation actuelle
Quand il n'y a pas de power stream (stream non récupéré ou indisponible), on tombe sur `avgPowerWatts` qui est `weighted_average_watts || average_watts`. Le `weighted_average_watts` de Strava EST leur Normalized Power (calculé côté Strava en 1Hz depuis le fichier device).

### Fix
C'est déjà partiellement fait : `avgPowerWatts` prend `weighted_average_watts` en priorité. Mais dans l'orchestrateur, quand on a un `powerStream`, on recalcule NP au lieu d'utiliser la valeur Strava.

Le fix du problème 2 (utiliser le NP pré-calculé) résout aussi celui-ci. Comme sécurité supplémentaire, si aucun NP n'est calculé par nous mais que `weighted_average_watts` existe, l'utiliser comme NP (pas juste comme avgPower).

### Fichiers impactés
- Résolu par le fix du problème 2

---

## Problème 5 : Source de données (limitation Strava API) (PAS DE FIX CODE)

### Situation
- TrainingPeaks reçoit le fichier .FIT device avec données 1Hz parfaitement régulières
- Nous utilisons l'API Strava qui renvoie des streams potentiellement downsamplés et non-uniformes
- Exemple : 3182s d'activité → 1718 points HR (≈1.85s/pt au lieu de 1s/pt)

### Impact
- Le NP/NGP calculé sur données downsamplées sera légèrement différent de celui calculé sur 1Hz
- Le fix du timeStream (problème 1) atténue ce problème pour TRIMP
- C'est une limitation structurelle : sans accès direct au device, on ne peut pas reproduire exactement TP

### Pas de fix code — à documenter comme limitation connue

---

## Problème 6 : Données utilisateur à valider (ACTION UTILISATEUR REQUISE)

### Données actuelles en DB (user c37c7234)

| Paramètre | Valeur DB | Utilisé pour | Correspondance TrainingPeaks ? |
|---|---|---|---|
| HRmax | 195 | TRIMP, hrTSS normalisation | **A VALIDER** |
| HRrest | 60 | TRIMP (HRR = (HR-rest)/(max-rest)) | **A VALIDER** |
| LTHR | 170 | TRIMP threshold (1h à LTHR = TSS 100) | **A VALIDER** |
| FTP | 280 W (cycling) | Cycling TSS (IF = NP/FTP) | **A VALIDER** |
| VMA | 16.5 km/h (sport "other") | Dérivation threshold pace → 257 s/km | **A VALIDER** |
| Threshold pace | 373 s/km (sport "other") | rTSS (IF = NGP/FTPace) | **INCOHÉRENT avec VMA** |
| Gender | male | TRIMP coefficients (b=0.64, k=1.92) | OK |

### Incohérence détectée : threshold_pace vs VMA
- VMA 16.5 → seuil dérivé = 3600/(16.5×0.85) = **257 s/km** (4:17/km)
- Threshold pace stocké = **373 s/km** (6:13/km)
- Écart de 45% ! Le code peut utiliser l'un ou l'autre selon l'ordre de lookup

### Action requise
L'utilisateur doit vérifier dans TrainingPeaks :
1. **Quel FTPace est configuré ?** (Settings → Zones → Run → Threshold Pace)
2. **Quel LTHR est configuré ?** (Settings → Zones → Heart Rate → Lactate Threshold)
3. **Quel FTP vélo est configuré ?** (Settings → Zones → Bike → FTP)
4. Fixer l'incohérence threshold_pace / VMA dans la DB

---

## Ordre d'implémentation

1. **Problème 1** (TRIMP timeStream) — Fix le plus impactant, affecte TOUTES les activités hrTSS
2. **Problème 3** (classification sport) — Simple et rapide
3. **Problème 2** (NP pré-calculé) — Affecte le vélo uniquement
4. **Problème 6** (validation données) — Pas de code, action utilisateur
5. **Problème 5** (documentation) — Pas de code

## Post-implémentation

1. Lancer `npm run recalculate-tss` pour recalculer tous les TSS
2. Comparer 5-10 activités running manuellement avec les valeurs TrainingPeaks
3. Si les écarts persistent (>5%), investiguer activité par activité avec un script de debug détaillé
