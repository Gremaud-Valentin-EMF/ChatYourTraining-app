# Plan de correction TSS v3 — Analyse complète et alignement TrainingPeaks

## Pourquoi il y a un décalage avec TrainingPeaks

Après l'implémentation des correctifs v2 (TRIMP time-based, NP pré-calculé, classification sport étendue), des écarts persistent. Voici les **causes racines identifiées**, de la plus impactante à la moins impactante :

### Cause 1 : La normalisation NGP utilise une fenêtre de 30 POINTS au lieu de 30 SECONDES (IMPACT FORT — ~10% d'erreur sur rTSS)

C'est le problème le plus significatif. La fonction `calculateNormalizedGradedPace()` dans `strava.ts` (ligne 414-421) et `computeNGP()` dans `recalculate-tss.js` (ligne 164-171) utilisent une fenêtre glissante de **30 points** :

```js
// Code actuel (INCORRECT pour données non-1Hz)
for (let i = 29; i < gapSpeeds.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) {
        sum += gapSpeeds[j];
    }
    rollingAverages.push(sum / 30);
}
```

**Le problème** : L'algorithme de Coggan assume des données à 1Hz (1 point = 1 seconde), donc 30 points = 30 secondes. Mais les streams Strava sont échantillonnés à ~1.85s/point en moyenne. Donc **30 points Strava ≈ 55 secondes**, pas 30.

**Conséquence** : Une fenêtre trop large lisse davantage les variations d'effort. La variabilité est sous-estimée, ce qui donne un NGP plus proche de la moyenne → un **IF plus bas** → un **rTSS plus bas** (puisque rTSS = durée × IF² × 100, l'erreur sur IF est amplifiée au carré).

**Estimation de l'impact** : Si NGP est sous-estimé de ~5% à cause du sur-lissage, IF est 5% trop bas, et IF² est ~10% trop bas → **rTSS sous-estimé de ~10%**.

TrainingPeaks reçoit les fichiers .FIT depuis l'appareil avec des données parfaitement 1Hz, donc leur fenêtre de 30 points = exactement 30 secondes.

### Cause 2 : Résolution des données Strava API vs fichier .FIT (IMPACT MOYEN — 2-5%)

L'API Strava renvoie des streams **downsamplés** et non-uniformes :
- Un entraînement de 3182 secondes peut n'avoir que 1718 points HR (~1.85s/pt au lieu de 1s/pt)
- Les pics d'effort courts (sprints, côtes) sont atténués par le downsampling
- TrainingPeaks reçoit le fichier .FIT original du capteur avec toutes les données 1Hz

**C'est une limitation structurelle** : sans accès direct au fichier device, on ne peut pas reproduire exactement les calculs TrainingPeaks. Cependant, corriger la fenêtre de normalisation (Cause 1) atténue significativement cet écart.

### Cause 3 : Seuils utilisateur potentiellement désalignés (IMPACT VARIABLE — 0% à 50%+)

Les calculs TSS sont **directement proportionnels** aux seuils configurés. Un mauvais seuil donne un TSS systématiquement faux :

| Paramètre | Impact sur | Formule | Erreur si +5% |
|---|---|---|---|
| **FTP** (vélo) | TSS cycling | IF = NP/FTP, TSS ∝ IF² | TSS -9.3% |
| **Threshold Pace** (course) | rTSS | IF = NGP/FTPace, rTSS ∝ IF² | rTSS -9.3% |
| **LTHR** | hrTSS | Normalise le TRIMP | Variable (non-linéaire) |
| **HRmax** | hrTSS | Affecte HRR = (HR-rest)/(max-rest) | Variable |
| **HRrest** | hrTSS | Affecte HRR | Variable |

**Les valeurs par défaut** utilisées quand l'utilisateur n'a rien configuré sont souvent loin de la réalité :
- FTP par défaut : 200W (un cycliste entraîné peut être à 280-320W)
- Threshold pace par défaut : 330 s/km soit 5:30/km (un coureur entraîné peut être à 4:00-4:30/km)

### Cause 4 : Incohérence `calculateNormalizedValue` dans training-load.ts (IMPACT FAIBLE)

La fonction `calculateNormalizedValue()` dans `training-load.ts` (ligne 79-111) est **toujours point-based** (30 points), contrairement aux versions dans `strava.ts` qui utilisent des fenêtres temporelles. Cette fonction est utilisée comme fallback quand le NP n'est pas pré-calculé (ex: si les streams n'ont pas été récupérés). L'impact est faible car le NP pré-calculé (time-based) est utilisé en priorité pour le cycling.

### Comment on corrige

En résumé : **corriger la fenêtre de normalisation pour utiliser 30 secondes réelles** au lieu de 30 points, et s'assurer que les seuils utilisateur correspondent à TrainingPeaks.

---

## Corrections à implémenter

### Fix 1 : NGP time-based normalization (PRIORITÉ HAUTE)

**Problème** : `calculateNormalizedGradedPace()` dans `strava.ts` utilise 30 points au lieu de 30 secondes pour le rolling average.

**Fichiers impactés** :
- `src/lib/integrations/strava.ts` — `calculateNormalizedGradedPace()` (ligne 379-430)
- `scripts/recalculate-tss.js` — `computeNGP()` (ligne 133-179)

**Solution** : Modifier les deux fonctions pour utiliser une fenêtre temporelle de 30 secondes basée sur le `timeStream` :

```js
// Au lieu de 30 points fixes :
// for (let i = 29; i < gapSpeeds.length; i++) { ... sum/30 }

// Utiliser une fenêtre temporelle de 30s :
for (let i = 0; i < gapSpeeds.length; i++) {
    const targetStart = effectiveTimeStream[i] - 30; // 30 secondes en arrière
    let startIdx = i;
    while (startIdx > 0 && effectiveTimeStream[startIdx - 1] >= targetStart) {
        startIdx--;
    }
    let sum = 0;
    let count = 0;
    for (let j = startIdx; j <= i; j++) {
        sum += gapSpeeds[j];
        count++;
    }
    if (count > 0) rollingAverages.push(sum / count);
}
```

**Note** : Le `timeStream` est déjà disponible comme paramètre de la fonction. Il faut aussi construire un `effectiveTimeStream` aligné sur les points `gapSpeeds` (en excluant les points où dt=0 ou dd=0).

### Fix 2 : `calculateNormalizedValue` dans training-load.ts — ajouter support time-based (PRIORITÉ MOYENNE)

**Problème** : La fonction dans `training-load.ts` est toujours point-based, ce qui est incorrect pour des données non-1Hz.

**Fichier impacté** :
- `src/lib/calculations/training-load.ts` — `calculateNormalizedValue()` (ligne 79-111)

**Solution** : Ajouter un paramètre optionnel `timeStream` et utiliser des fenêtres temporelles quand il est disponible. Même logique que le Fix 1. Le fallback point-based reste pour la rétrocompatibilité.

Mettre aussi à jour `calculateRTSS()` (ligne 246-316) pour passer le `timeStream` à la normalisation quand des speedStreams sont utilisés (même si ce chemin n'est pas actuellement emprunté).

### Fix 3 : Récupérer le stream `velocity_smooth` de Strava (PRIORITÉ BASSE)

**Problème** : Le sync route (`route.ts` ligne 386) ne demande pas le stream de vitesse. La vitesse est dérivée des différences de distance, ce qui peut être bruité.

**Fichier impacté** :
- `src/app/api/sync/strava/route.ts` — `streamKeys` (ligne 386)

**Solution** : Ajouter `"velocity_smooth"` aux clés demandées et le passer comme `speedStream` à `convertStravaActivity`. Strava fournit un stream lissé (`velocity_smooth`) qui est plus précis que les dérivées de distance.

**Note** : Ceci est de priorité basse car le NGP est déjà calculé à partir de distance+time+altitude. Le gain serait marginal.

### Fix 4 : Validation/alignement des seuils utilisateur (ACTION UTILISATEUR)

**Pas de code** — L'utilisateur doit vérifier que ses seuils dans l'app correspondent exactement à ses zones TrainingPeaks :

1. **TrainingPeaks** → Settings → Zones :
   - **Run → Threshold Pace** : Quel FTPace ? (ex: 4:17/km = 257 s/km)
   - **Heart Rate → Lactate Threshold** : Quel LTHR ? (ex: 170 bpm)
   - **Bike → FTP** : Quel FTP ? (ex: 280W)

2. **ChatYourTraining** → Vérifier que les valeurs en DB (`user_sports`, `physiological_data`) correspondent

3. **Incohérence connue** (du plan v2) : VMA 16.5 km/h → seuil dérivé = 257 s/km, mais threshold_pace_per_km stocké = 373 s/km (6:13/km). Écart de 45%.

### Fix 5 : Mettre à jour le script de recalcul (PRIORITÉ HAUTE — accompagne Fix 1)

**Fichier impacté** :
- `scripts/recalculate-tss.js` — `computeNGP()` (ligne 133-179)

Le script doit appliquer exactement les mêmes corrections que le Fix 1 pour que le recalcul batch produise les mêmes résultats que le sync temps réel.

---

## Ordre d'implémentation

1. **Fix 1** — NGP time-based normalization dans `strava.ts` (plus gros impact)
2. **Fix 5** — Même correction dans `recalculate-tss.js` (cohérence)
3. **Fix 2** — `calculateNormalizedValue` time-based dans `training-load.ts` (cohérence)
4. **Fix 4** — Validation seuils utilisateur (action manuelle)
5. **Fix 3** — Stream velocity_smooth (optionnel, gain marginal)

## Post-implémentation

1. Lancer `node scripts/recalculate-tss.js` pour recalculer tous les TSS
2. Comparer 5-10 activités running avec TrainingPeaks :
   - Si écart < 5% → OK, le reste est dû à la résolution des données Strava
   - Si écart > 5% → Vérifier les seuils utilisateur (Fix 4)
3. Comparer 3-5 activités cycling avec TrainingPeaks
4. Vérifier que les CTL/ATL/TSB convergent vers les valeurs TrainingPeaks sur 2-3 semaines

## Limitations structurelles (pas de fix possible)

- **Résolution Strava API** : ~1.85s/pt vs 1Hz. Même avec fenêtres temporelles, moins de points = moins de variabilité capturée
- **Downsampling des pics** : Les efforts courts (sprints <10s) sont atténués dans les streams Strava
- **Algorithme propriétaire TP** : TrainingPeaks peut avoir des ajustements non documentés dans leur calcul
- **Données initiales CTL** : Le CTL nécessite ~42 jours d'historique pour converger. Les premiers jours après l'import initial auront des valeurs CTL imprécises

## Résumé de l'écart attendu après corrections

| Source | Avant corrections | Après corrections |
|---|---|---|
| Fenêtre NGP 30pt vs 30s | ~10% erreur rTSS | Corrigé |
| Résolution données | 2-5% | 2-5% (limitation) |
| Seuils utilisateur | 0-50%+ | 0% (si alignés) |
| Downsampling pics | 1-3% | 1-3% (limitation) |
| **Total estimé** | **5-50%+** | **3-8% max** |
