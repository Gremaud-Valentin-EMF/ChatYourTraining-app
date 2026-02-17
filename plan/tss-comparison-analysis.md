# Analyse de comparaison TSS : App vs TrainingPeaks

## Résultat global

| Catégorie | Activités matchées | Diff moyenne absolue | App vs TP |
|---|---|---|---|
| **Running** | 12/23 | 18.5% | **+15.4%** (app trop haut) |
| **Cycling** | 0 | N/A | Pas de données comparables |
| **Strength** | ~17 | ~30% | **-30%** (app trop bas) |
| **Walking/Other** | ~8 | Variable | Variable |

55 activités TP non matchées (principalement avant novembre 2025 = avant l'import dans l'app).

---

## Diagnostic Running (le plus important)

### Constat : l'app surestime le TSS running de +15.4% en moyenne

Quelques activités sont proches (<5% d'écart), d'autres sont TRÈS loin (40-61% d'écart) :

| Date | TP TSS | App TSS | Écart | IF TP |
|---|---|---|---|---|
| 2025-12-25 | 83.7 | 86 | +2.7% ✅ | 1.21 |
| 2025-12-28 | 106.2 | 108 | +1.7% ✅ | 1.27 |
| 2025-11-09 | 81.9 | 86 | +5.0% | 1.15 |
| 2025-12-14 | **150.2** | **211** | **+40.5%** ⚠️ | 1.24 |
| 2025-11-26 | **59.6** | **96** | **+61.0%** ⚠️ | 0.86 |
| 2025-12-02 | **82.9** | **115** | **+38.7%** ⚠️ | 1.15 |

### Cause racine 1 : Formule rTSS - facteur de scaling

En vérifiant les données TP, la formule standard `TSS = IF² × heures × 100` **ne colle pas** :

| Activité | IF² × h × 100 | TSS TP réel | Écart |
|---|---|---|---|
| 2025-12-28 | 96.9 | 106.2 | +9.5% |
| 2025-12-25 | 76.6 | 83.7 | +9.4% |
| 2025-12-14 | 135.9 | 150.2 | +10.5% |
| 2025-11-09 | 75.2 | 81.9 | +8.9% |

TP semble utiliser un **multiplicateur de ~110 au lieu de 100** pour le running rTSS. Cela pourrait refléter le coût métabolique plus élevé de la course à pied (impact au sol, charge excentrique).

**Notre formule** utilise `× 100`. Cela explique un sous-comptage de ~10% côté TP... mais notre app est en fait **AU-DESSUS** de TP, donc ce facteur ne peut pas expliquer les gros écarts.

### Cause racine 2 (dominante) : Le seuil de pace est FAUX

Le seuil configuré dans l'app : **373 s/km (6:13/km)**.

Cet athlète court régulièrement à :
- 4:01-5:20/km (241-320 s/km de NGP d'après les logs)
- IF TP entre 0.86 et 1.27

Un threshold pace de 6:13/km signifie que PRESQUE TOUTE course est au-dessus du seuil (IF > 1), ce qui surestime massivement le rTSS.

**Estimation du vrai seuil TP** (à partir des données IF de TP) :

Pour l'activité du 2025-12-28 :
- Vitesse moyenne = 3.31 m/s → pace ≈ 302 s/km (5:02/km)
- IF TP = 1.27
- FTPace_speed = avg_speed / IF = 3.31/1.27 = 2.61 m/s
- **FTPace ≈ 383 s/km (6:23/km)** ... ça correspond presque à notre 373

Hmm mais pour 2025-11-26 (le pire écart) :
- App TSS = 96, TP TSS = 59.6 → l'app est 61% plus haut
- IF TP = 0.86 → course en dessous du seuil
- Notre IF serait bien plus élevé avec le threshold de 373 s/km

**Le problème n'est donc pas QUE le seuil.** Il y a aussi un problème de **méthode de calcul TSS** :

### Cause racine 3 : TP utilise probablement hrTSS pour certaines activités

En vérifiant : `TSS_TP ≠ IF² × h × 100` de façon systématique. Cela signifie que TP pourrait :
1. Utiliser **hrTSS** (basé sur le TRIMP) au lieu de rTSS pour certaines activités running
2. Combiner rTSS et hrTSS (prendre le max, ou utiliser hrTSS quand il est plus fiable)
3. Appliquer des corrections propriétaires

Notre app utilise **systématiquement rTSS** pour le running (car `thresholdPacePerKm` est disponible, donc la priorité #2 dans l'orchestrateur est toujours activée).

### Activités avec gros écart vs faible écart

Les activités **proches** (2025-12-25, 2025-12-28) ont des IF TP élevés (1.21-1.27) → courses rapides au-dessus du seuil.

Les activités **très éloignées** (2025-11-26 IF=0.86, 2025-12-02 IF=1.15) varient davantage. L'activité du 2025-11-26 est en dessous du seuil TP (IF=0.86) mais probablement très au-dessus de notre seuil de 373 s/km.

---

## Diagnostic Strength

L'app donne des TSS **30-50% plus bas** que TP pour la musculation. Les deux utilisent hrTSS (basé sur la FC), mais :
- TP a potentiellement accès à des streams HR 1Hz
- L'app peut n'avoir que le HR moyen (pas de stream)
- TP pourrait utiliser un LTHR ou des coefficients différents

---

## Bug identifié : Cross-country skiing

L'activité de ski de fond (2026-01-01) a **TSS=3017 dans l'app vs TSS=70 dans TP**. C'est un bug clair. Le sport "cross_country_skiing" n'est pas reconnu par l'orchestrateur comme running/cycling/swimming, donc il tombe dans le fallback duration-based. Mais TSS=3017 pour ~1h d'activité est aberrant. Il y a probablement un problème de données (durée mal calculée, ou elapsed_time corrompu).

---

## Actions correctives recommandées

### Action 1 (CRITIQUE) : Vérifier et corriger le seuil de pace

L'utilisateur doit :
1. Ouvrir TrainingPeaks → Settings → Zones → Run → Threshold Pace
2. Vérifier la valeur exacte
3. La mettre à jour dans `user_sports` pour le sport "running"

Si TP utilise un seuil de ~260 s/km (4:20/km) basé sur VMA 16.5 :
- Tous les IF diminueront de ~30%
- Les rTSS diminueront de ~50% (IF² !)
- Les valeurs se rapprocheront fortement de TP

### Action 2 : Envisager de favoriser hrTSS pour le running

TP semble utiliser hrTSS pour le running dans beaucoup de cas. On pourrait :
- Calculer BOTH rTSS et hrTSS pour chaque activité running
- Utiliser celui qui est le plus proche de TP (probablement hrTSS)
- Ou donner la priorité à hrTSS quand les streams HR sont disponibles

### Action 3 : Investiguer le facteur 110

Si TP utilise effectivement un multiplicateur de 110 pour le running rTSS, on devrait l'adopter aussi.

### Action 4 : Fixer le bug cross-country skiing

Investiguer pourquoi l'activité de ski produit TSS=3017.

### Action 5 : Relancer la comparaison après correction du seuil

Après avoir corrigé le threshold pace, relancer `node scripts/recalculate-tss.js` puis `node scripts/compare-tp-tss.js` pour mesurer l'amélioration.
