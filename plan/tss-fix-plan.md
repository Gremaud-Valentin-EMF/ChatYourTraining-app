# Plan de Correction des Calculs TSS - Alignement TrainingPeaks

## Diagnostic : Sources de Decalage Identifiees

Apres analyse approfondie du code (`training-load.ts`, `strava.ts`, `sync/strava/route.ts`, `sync/whoop/route.ts`) et comparaison avec les formules officielles TrainingPeaks (Coggan, Banister, McGregor), voici les problemes identifies :

---

## Probleme 1 (CRITIQUE) : Pas de seuils par defaut pour rTSS et TSS cycling

**Impact : Running et Cycling tombent en hrTSS au lieu de rTSS/TSS**

### Constat
L'orchestrateur (`calculateActivityTSS` dans `training-load.ts`) exige que `thresholdPacePerKm > 0` pour calculer rTSS, et `ftp > 0` pour TSS cycling. Si l'utilisateur n'a PAS renseigne ces valeurs dans son profil :
- **Running** : saute rTSS -> tombe en hrTSS (Priority 4)
- **Cycling** : saute TSS power -> tombe en hrTSS (Priority 4)

TrainingPeaks utilise TOUJOURS rTSS pour la course si la pace est disponible, et TSS pour le velo si la puissance est disponible, meme avec des valeurs par defaut.

### Exemple concret
- Course 1h, 12km, FC moy 155 bpm
- Sans threshold pace : hrTSS ~65 (via TRIMP)
- Avec threshold pace 5:30/km : rTSS ~85
- **Ecart : ~30%** entre les deux methodes

### Correction
Dans `convertStravaActivity()` (strava.ts), ajouter des valeurs par defaut raisonnables quand l'utilisateur n'a pas de seuils configures :
- **Running** : threshold pace par defaut de 330 s/km (5:30/km) - coureur moyen recreatif
- **Cycling** : FTP par defaut de 200W (cycliste recreatif)
- Mieux : estimer a partir des donnees recentes (pace moyenne des courses recentes x 1.05 comme proxy)

---

## Probleme 2 (CRITIQUE) : Coefficient TRIMP feminin incorrect

**Impact : hrTSS sous-estime de ~25-35% pour les femmes**

### Constat
La formule Banister TRIMP utilise des coefficients differents par sexe :
- **Homme** : `TRIMP = dt x HRR x 0.64 x e^(1.92 x HRR)`
- **Femme** : `TRIMP = dt x HRR x 0.86 x e^(1.67 x HRR)`

Le code utilise `TRIMP_BASE_COEFFICIENT = 0.64` pour les DEUX sexes (ligne 66 de `training-load.ts`). Le coefficient exponentiel `k` est bien differencie (1.92/1.67), mais le coefficient de base est fixe a 0.64 au lieu de 0.86 pour les femmes.

### Impact chiffre
Pour une femme a HRR = 0.7 (effort modere) :
- Avec 0.64 : y = 0.64 x e^(1.67 x 0.7) = 0.64 x 3.22 = 2.06
- Avec 0.86 : y = 0.86 x e^(1.67 x 0.7) = 0.86 x 3.22 = 2.77
- **Sous-estimation de 34%** sur chaque point de donnee

### Correction
```
// Ligne 66 : supprimer la constante unique
// Remplacer par des constantes par genre :
const TRIMP_COEFFICIENTS = {
  male:   { base: 0.64, k: 1.92 },
  female: { base: 0.86, k: 1.67 },
};
```
Modifier `calculateHrTSS` pour utiliser le bon coefficient de base selon le genre.

---

## Probleme 3 (MAJEUR) : Fenetre glissante centree au lieu de trailing dans calculateNormalizedValue

**Impact : Calcul NP/NGP fausse quand speedStream est utilise directement**

### Constat
`calculateNormalizedValue()` dans `training-load.ts` (lignes 76-102) utilise une fenetre **centree** :
```javascript
const start = Math.max(0, i - Math.floor(windowSize / 2));
const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
```

L'algorithme Coggan/TrainingPeaks utilise une fenetre **trailing** (retrospective) :
```
rolling_avg[i] = mean(values[i-29], ..., values[i])   pour i >= 29
```

La fenetre centree "voit le futur" et lisse differemment, ce qui change la valeur normalisee.

### Impact actuel
Cette fonction n'est PAS utilisee pour Strava (les fonctions correctes dans `strava.ts` - `calculateNormalizedPower`, `calculateNormalizedHeartRate`, `calculateNormalizedGradedPace` - utilisent bien des fenetres trailing). Mais elle EST utilisee par `calculateRTSS` et `calculateCyclingTSS` dans l'orchestrateur quand des streams bruts sont passes directement. Risque de bug si d'autres sources de donnees l'utilisent.

### Correction
Remplacer par une fenetre trailing standard :
```javascript
for (let i = 29; i < values.length; i++) {
  let sum = 0;
  for (let j = i - 29; j <= i; j++) {
    sum += values[j];
  }
  rollingAverages.push(sum / 30);
}
```

---

## Probleme 4 (MAJEUR) : Deux systemes de calcul TSS en parallele (code mort confusant)

**Impact : Maintenance difficile, risque de regression**

### Constat
Deux fonctions `calculateActivityTSS` coexistent :
1. **`training-load.ts:384`** - L'orchestrateur (utilise par `convertStravaActivity` et le sync Whoop)
2. **`strava.ts:508`** - L'ancienne version (exportee mais **jamais importee** nulle part)

L'ancienne version dans `strava.ts` contient des logiques differentes :
- FTP par defaut de 250W (vs aucun defaut dans l'orchestrateur)
- Threshold pace par defaut de 5.5 min/km (vs aucun defaut)
- LTHR par defaut 90% HRmax (vs 85% ailleurs)
- Swimming utilise IF^2 (vs IF^3 correct dans l'orchestrateur)

### Correction
Supprimer l'ancienne `calculateActivityTSS` de `strava.ts` et la fonction `resolveLthr` associee. Ne garder que l'orchestrateur dans `training-load.ts`.

---

## Probleme 5 (MODERE) : LTHR par defaut a 85% de HRmax - trop conservateur

**Impact : hrTSS systematiquement biaise**

### Constat
Quand LTHR n'est pas renseigne, le code utilise `HRmax x 0.85` comme estimation. Cependant :
- TrainingPeaks recommande ~88-92% de HRmax pour les athletes entraines
- 85% est une estimation basse qui **surestime le hrTSS** (le TRIMP threshold est trop bas, donc le ratio TRIMP/threshold est trop eleve)

Exemple avec HRmax = 190 :
- LTHR a 85% = 162 -> hrTSS pour 1h a 155bpm = ~78
- LTHR a 89% = 169 -> hrTSS pour 1h a 155bpm = ~62
- **Ecart : ~26%**

### Correction
- Utiliser un defaut plus proche de 88-89% de HRmax pour les athletes (alignement TP)
- Mieux : inciter l'utilisateur a renseigner son LTHR via un test (Conconi, seuil lactique 30min)
- Ajouter un warning dans les logs quand LTHR est estime et non mesure

---

## Probleme 6 (MODERE) : VMA -> Threshold Pace a 85% - approximation variable

**Impact : rTSS decale pour les coureurs utilisant VMA**

### Constat
Le code derive le threshold pace depuis la VMA : `FTPace = VMA x 0.85`

Ce facteur de 85% est une approximation acceptable mais variable selon l'athlete :
- Debutants : ~78-82% de VMA
- Intermediaires : ~83-86% de VMA
- Elites endurance : ~87-90% de VMA

Un coureur elite avec VMA de 20 km/h :
- A 85% : seuil = 17.0 km/h -> pace = 212 s/km (3:32/km)
- A 88% : seuil = 17.6 km/h -> pace = 205 s/km (3:25/km)
- **Ecart de IF : ~3.5% -> ecart de rTSS : ~7%**

### Correction
- Ajuster le facteur selon le niveau estime de l'athlete (si disponible)
- OU garder 85% mais documenter clairement que c'est une approximation et encourager la saisie directe du threshold pace
- Meilleur : utiliser les donnees recentes pour calibrer (pace moyenne des courses de 45-60min)

---

## Probleme 7 (MINEUR) : Streams non-1Hz - calcul NGP dans strava.ts

**Impact : NGP potentiellement imprecis avec echantillonnage irregulier**

### Constat
`calculateNormalizedGradedPace` dans `strava.ts` utilise une fenetre de 30 POINTS (pas 30 secondes) pour le rolling average. Si les streams Strava ne sont pas a 1Hz (ce qui arrive regulierement - Strava peut compresser les donnees), 30 points peuvent couvrir plus ou moins de 30 secondes.

Exemple : 1134 points pour 3182s = ~2.8s par point. 30 points = 84 secondes au lieu de 30.

### Correction
Utiliser le `timeStream` pour calculer une fenetre temporelle de 30 secondes reelles :
```javascript
// Au lieu de i-29 a i, trouver les indices correspondant a [t-30s, t]
for (let i = 0; i < gapSpeeds.length; i++) {
  const targetStart = timeStream[i] - 30;
  let startIdx = i;
  while (startIdx > 0 && timeStream[startIdx] > targetStart) startIdx--;
  // Moyenne des points dans la fenetre temporelle
}
```

Meme correction necessaire pour `calculateNormalizedHeartRate` et `calculateNormalizedPower` dans `strava.ts`.

---

## Probleme 8 (MINEUR) : Clamping du gradient manquant dans training-load.ts

**Impact : Valeurs aberrantes possibles avec pentes extremes**

### Constat
`calculateMinettiCost` dans `training-load.ts` ne clamp PAS le gradient, alors que `calculateEnergyCost` dans `strava.ts` le clamp a [-0.3, 0.3]. Le polynome de Minetti diverge fortement au-dela de +/-30%, donnant des couts aberrants.

### Correction
Ajouter le clamping : `const gradient = Math.max(-0.3, Math.min(0.3, rawGradient));`

---

## Ordre de Priorite des Corrections

| Prio | Probleme | Impact estime | Effort |
|------|----------|---------------|--------|
| 1 | Seuils par defaut manquants (rTSS/TSS) | 20-40% d'ecart | Faible |
| 2 | Coefficient TRIMP feminin | 25-35% pour femmes | Faible |
| 3 | Fenetre NP centree -> trailing | Variable | Faible |
| 4 | Code mort a supprimer | Maintenance | Faible |
| 5 | LTHR defaut 85% -> 88% | ~15-25% | Faible |
| 6 | VMA -> Threshold calibration | ~5-10% | Moyen |
| 7 | Fenetre 30 points -> 30 secondes | ~5-15% variable | Moyen |
| 8 | Clamping gradient | Edge cases | Faible |

---

## Fichiers a Modifier

| Fichier | Modifications |
|---------|-------------|
| `src/lib/calculations/training-load.ts` | Fix TRIMP female coeff, fix fenetre NP, fix gradient clamping, ajuster LTHR defaut |
| `src/lib/integrations/strava.ts` | Supprimer ancien `calculateActivityTSS` + `resolveLthr`, ajouter seuils par defaut dans `convertStravaActivity`, fix fenetre 30s temporelle pour NHR/NP/NGP |
| `src/app/api/sync/strava/route.ts` | Aucun changement structural (les corrections sont dans les libs) |
| `src/app/api/sync/whoop/route.ts` | Aucun changement structural |

---

## Tests de Validation

Apres corrections, valider avec des cas concrets :

1. **Course facile 1h, 10km, FC 140** : rTSS attendu ~55-65 (TP donne generalement ~60)
2. **Course tempo 45min, 8km, FC 165** : rTSS attendu ~70-80
3. **Sortie velo 2h, NP 180W, FTP 250W** : TSS attendu ~104
4. **Natation 1500m en 25min, CSS 1:40/100m** : sTSS attendu ~45-55
5. **Musculation 1h, FC 120** : hrTSS attendu ~25-35

Comparer chaque valeur avec le TSS affiche dans TrainingPeaks pour les memes activites.
