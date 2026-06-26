# Création d'une activité manuelle — données à saisir

Ce document définit les données saisies lors de la **création manuelle d'une activité**
(séance réalisée sans import Strava/Whoop). La logique est identique à celle de l'onboarding :
on part d'un **tronc commun minimal**, puis **les champs s'adaptent au sport** choisi.

**Principe directeur :** ne demander que ce qui est utile au calcul du TSS et au contexte du coach IA.
Les **seuils** (FTP, VMA/allure seuil, LTHR/FC max) ne sont **jamais ressaisis ici** — ils viennent
du profil (onboarding). La création d'activité ne fournit que les **valeurs mesurées de la séance**.

> Voir aussi : `documentation/onboarding/etapes_onboarding.md` (seuils par sport),
> `documentation/sports/sports_MVP.md` (liste des sports), et le moteur de calcul
> `src/lib/calculations/training-load.ts` (US-14).

---

## Étape 0 — Choix du sport

Premier champ, **obligatoire**. Sélection parmi les **9 sports MVP** (alignés sur l'onboarding
et la table `sports`) :

| Sport (FR)    | Slug (`sports.name`)   |
| ------------- | ---------------------- |
| Course à pied | `running`              |
| Vélo          | `cycling`              |
| VTT           | `mountain-biking`      |
| Marche        | `walking`              |
| Randonnée     | `hiking`               |
| Ski alpin     | `alpine-skiing`        |
| Ski de fond   | `cross-country-skiing` |
| Musculation   | `strength`             |
| Autre         | `other`                |

> `swimming` et `triathlon` existent en base mais sont **hors MVP** — ne pas les proposer.

Le sport choisi détermine **quels champs adaptatifs** s'affichent (Étape 2) et **quelle méthode
de TSS** sera appliquée.

---

## Étape 1 — Tronc commun (tous les sports)

Champs affichés quel que soit le sport.

| Donnée            | Type                  | Obligatoire | Colonne DB        | Utilité                                                          |
| ----------------- | --------------------- | ----------- | ----------------- | --------------------------------------------------------------- |
| Date planifiée    | Date                  | Au moins l'une des deux | `scheduled_date` | Date à laquelle la séance était prévue                          |
| Date réalisée     | Date                  | Au moins l'une des deux | `completed_date` | Date à laquelle la séance a été faite                           |
| Titre             | Texte (défaut : « Sport — 26 juin ») | Non | `title`     | Lisibilité dans le calendrier et le détail                       |
| **Durée**         | hh:mm                 | **Oui si réalisée** | `actual_duration_minutes` ou `planned_duration_minutes` | **Pivot de tous les calculs de TSS** (`TSS = heures × IF² × K`) |
| RPE (ressenti 1–10) | Slider              | Non (recommandé, si réalisée) | `rpe`   | Calcul TSS via table de Friel si pas de puissance/allure/FC      |
| Notes             | Texte libre           | Non         | `description`     | Contexte séance pour le coach IA                                 |

> **Pas de champ « intensité » ni de toggle « réalisée »** dans la création manuelle : le statut
> est **déduit de la combinaison des deux dates** (voir ci-dessous).

### Statut de la séance — déduit des deux dates

L'utilisateur saisit **deux dates optionnelles** (planifiée et réalisée). Leur combinaison fixe le
statut, sans jamais le choisir « en dur ». `scheduled_date` (NOT NULL en base) prend la **date
planifiée** si fournie, sinon la **date réalisée** ; `completed_date` prend la date réalisée.

| Date planifiée | Date réalisée | `status`    | Signification                                  | TSS                |
| -------------- | ------------- | ----------- | ---------------------------------------------- | ------------------ |
| —              | renseignée    | `completed` | Faite (non formellement planifiée)             | **Calculé**        |
| renseignée     | renseignée    | `completed` | Planifiée **puis** faite (dates ≠ possibles)   | **Calculé**        |
| future / aujourd'hui | —       | `planned`   | À venir                                        | Non calculé        |
| passée         | —             | `skipped`   | Planifiée mais non réalisée → **manquée**      | Non calculé        |

> Règle équivalente : **`completed_date` présente → `completed`** (les colonnes `actual_*` et le TSS
> sont remplis) ; **absente → `planned`** (colonnes `planned_*`), qui devient **`skipped`** si la
> date planifiée est déjà passée. Cohérent avec l'appariement import↔planifié, qui pose
> `completed_date` au moment du « prévu → réalisé » — voir **Cycle de vie d'une séance planifiée**.

**Valeurs imposées par le système (non saisies) :**

- `source = 'manual'` — distingue des imports `strava` / `whoop`.
- `tss` / `tss_type` — **calculés automatiquement** à l'enregistrement **uniquement si réalisée**
  (voir Étape 3). Une séance planifiée n'a pas de TSS tant qu'elle n'est pas réalisée.

> **Pour une séance réalisée, la durée est le seul champ numérique strictement obligatoire** :
> sans elle, aucun TSS (même de repli) ne peut être calculé. Pour une séance planifiée, la durée
> prévue reste fortement recommandée (elle sert au coach et à l'appariement futur).

### Cycle de vie d'une séance planifiée — passage en `skipped`

Une séance `planned` dont la date est passée **sans avoir été réalisée** (aucun import apparié,
aucune saisie « réalisée ») doit apparaître comme **manquée → `skipped`**. Deux garde-fous évitent
les faux positifs et les doublons :

1. **Délai de grâce** — ne pas basculer à 00:00 le lendemain. Attendre la fenêtre de
   synchronisation (p. ex. la fin du jour J+1, ou le prochain sync réussi). Une séance pas encore
   importée n'est pas « manquée », juste « pas encore synchronisée ».
2. **`skipped` reste appariable** — un import tardif qui correspond à une séance `skipped` doit
   pouvoir la **réintégrer en `completed`** (« prévu → réalisé » différé). En pratique : ajouter
   `'skipped'` à la liste des statuts candidats de `matchPlannedWorkout` (`sync-helpers.ts`, le
   filtre `.in("status", [...])`), aujourd'hui limité à `['planned', 'in_progress']`.

> ⚠️ **Sans le garde-fou n°2**, une séance passée en `skipped` ne serait plus jamais appariée :
> l'activité Strava synchronisée le lendemain créerait un **doublon `completed`** au lieu de
> compléter la séance planifiée.

**Transitions de statut :**

| De            | Vers        | Déclencheur                                                        |
| ------------- | ----------- | ------------------------------------------------------------------ |
| `planned`     | `completed` | Import apparié, ou édition manuelle « réalisée » (pose `completed_date`) |
| `planned`     | `skipped`   | Date passée + délai de grâce écoulé, sans réalisation              |
| `skipped`     | `completed` | Import tardif apparié (réintégration — nécessite le garde-fou n°2) |

> **Implémentation :** ce passage automatique en `skipped` **n'est pas** une action de la création
> manuelle. C'est un **balayage côté serveur** (job planifié / cron) ou un calcul dérivé à
> l'affichage — distinct du formulaire décrit ici.

---

## Étape 2 — Champs adaptatifs selon le sport

Les sports sont regroupés par **profil de données** (mêmes champs, même logique de TSS).

> **Séance planifiée :** les champs capteurs (allure, puissance, FC) n'ont pas de sens avant la
> réalisation et sont masqués — seule la **distance prévue** peut être saisie (→ `planned_distance_km`).
> Les colonnes `actual_*` ci-dessous ne concernent donc que les séances **réalisées**.

### Groupe A — Course à pied (`running`)

| Donnée              | Type           | Obligatoire | Colonne DB         | Utilité                                  |
| ------------------- | -------------- | ----------- | ------------------ | ---------------------------------------- |
| Distance (km)       | Nombre décimal | Non         | `actual_distance_km` | rTSS, allure moyenne, contexte coach     |
| Dénivelé D+ (m)     | Nombre entier  | Non         | `elevation_gain_m` | Ajuste l'allure (NGP), contexte trail    |
| Allure moyenne (min/km) | Durée      | Non         | `avg_pace_per_km`  | Entrée principale du rTSS (vs allure seuil du profil) |
| FC moyenne (bpm)    | Nombre entier  | Non         | `avg_hr`           | Repli hrTSS si pas d'allure              |
| FC max séance (bpm) | Nombre entier  | Non         | `max_hr`           | Contexte intensité                       |

### Groupe B — Vélo (`cycling`) & VTT (`mountain-biking`)

| Donnée               | Type          | Obligatoire | Colonne DB         | Utilité                              |
| -------------------- | ------------- | ----------- | ------------------ | ------------------------------------ |
| Distance (km)        | Nombre décimal | Non        | `actual_distance_km` | Contexte coach                      |
| Dénivelé D+ (m)      | Nombre entier | Non         | `elevation_gain_m` | Contexte effort/parcours             |
| Puissance normalisée (NP, W) | Nombre entier | Non | `raw_data._calculated.normalized_power` | **Entrée prioritaire du TSS puissance** (IF = NP / FTP) — valeur lue sur le compteur |
| Puissance moyenne (W)| Nombre entier | Non         | `avg_power_watts`  | Repli si NP non fournie ; sert aussi de contexte |
| FC moyenne (bpm)     | Nombre entier | Non         | `avg_hr`           | Repli hrTSS si pas de puissance      |
| FC max séance (bpm)  | Nombre entier | Non         | `max_hr`           | Contexte intensité                   |

> VTT : la puissance n'est utile qu'avec un capteur. Sans capteur → hrTSS via FC.

### Groupe C — Marche (`walking`), Randonnée (`hiking`), Ski de fond (`cross-country-skiing`), Ski alpin (`alpine-skiing`)

| Donnée              | Type          | Obligatoire | Colonne DB           | Utilité                          |
| ------------------- | ------------- | ----------- | -------------------- | -------------------------------- |
| Distance (km)       | Nombre décimal | Non        | `actual_distance_km` | Contexte (peu pertinent en ski alpin) |
| Dénivelé D+ (m)     | Nombre entier | Non         | `elevation_gain_m`   | Contexte effort (rando, ski)     |
| FC moyenne (bpm)    | Nombre entier | Non         | `avg_hr`             | Entrée principale du hrTSS       |
| FC max séance (bpm) | Nombre entier | Non         | `max_hr`             | Contexte intensité               |

> Pas de capteur de puissance ni d'allure seuil standard pour ces sports → **hrTSS** est la
> méthode de référence. Sans FC, on bascule sur le RPE.

### Groupe D — Musculation (`strength`)

| Donnée              | Type          | Obligatoire | Colonne DB | Utilité                                            |
| ------------------- | ------------- | ----------- | ---------- | -------------------------------------------------- |
| FC moyenne (bpm)    | Nombre entier | Non         | `avg_hr`   | Repli hrTSS (peu fiable en muscu — FC intermittente) |
| FC max séance (bpm) | Nombre entier | Non         | `max_hr`   | Contexte                                           |

> En musculation, **le RPE (Étape 1) est la méthode de référence** : la FC monte peu et de façon
> intermittente (repos entre séries), donc le hrTSS sous-estime la charge. Pas de distance/allure.

### Groupe E — Autre (`other`)

| Donnée              | Type          | Obligatoire | Colonne DB           | Utilité            |
| ------------------- | ------------- | ----------- | -------------------- | ------------------ |
| Distance (km)       | Nombre décimal | Non        | `actual_distance_km` | Contexte (optionnel) |
| FC moyenne (bpm)    | Nombre entier | Non         | `avg_hr`             | Repli hrTSS        |
| FC max séance (bpm) | Nombre entier | Non         | `max_hr`             | Contexte           |

> Sport générique : seuls durée + RPE (et FC si dispo) sont exploités pour le TSS.

---

## Étape 3 — Calcul automatique du TSS (US-14)

À l'enregistrement, le moteur (`calculateActivityTSS`) choisit **la meilleure méthode disponible**
selon les données saisies et les seuils du profil. L'utilisateur ne choisit pas la méthode.

| Priorité | Méthode (`tss_type`) | Conditions requises                                   | Sports concernés        |
| -------- | -------------------- | ----------------------------------------------------- | ----------------------- |
| 1        | `tss` (puissance)    | Puissance normalisée (NP) saisie — à défaut, puissance moyenne — **+** FTP au profil | Vélo, VTT |
| 2        | `rtss` (allure)      | Allure moyenne saisie **+** VMA/allure seuil au profil | Course à pied           |
| 3        | `hrtss` (FC)         | FC moyenne saisie **+** LTHR (ou FC max) au profil    | Tous sauf si #1/#2 dispo |
| 4        | `rpe` (Friel)        | RPE saisi (1–10) **+** durée                          | Tous (référence en muscu) |
| 5        | `estimated`          | Aucune donnée exploitable → **TSS = 0** + avertissement | Repli ultime          |

**Conséquences pour le formulaire :**

- Pour un TSS **précis**, encourager la saisie de l'entrée principale du sport (puissance / allure / FC).
- À défaut, **le RPE suffit** pour obtenir un TSS crédible (table de Friel) — d'où sa recommandation
  dans le tronc commun.
- Si ni donnée capteur, ni FC, ni RPE → `tss = 0`, `tss_type = 'estimated'`, et une **pastille
  d'avertissement jaune** s'affiche dans le détail de l'activité (« TSS estimé — aucune donnée de
  puissance, allure ou FC disponible »).

> Modifier le RPE *a posteriori* dans le détail d'activité recalcule le TSS **uniquement** si aucune
> méthode supérieure (puissance/allure/FC) n'était disponible (`tss_type` `null` ou `estimated`).
>
> **Puissance normalisée (NP) en saisie manuelle :** lors d'un import Strava/Whoop, la NP est
> recalculée à partir du flux de puissance (algorithme de Coggan, fenêtre glissante 30 s). En saisie
> manuelle il n'y a pas de flux : on prend la NP affichée par le compteur si l'utilisateur la fournit,
> sinon la puissance moyenne tient lieu de NP (IF légèrement sous-estimé sur les séances à intensité
> variable). La NP saisie est stockée dans `raw_data._calculated.normalized_power`.

---

## Résumé — champs par sport

| Sport         | Tronc commun | Distance | D+  | Allure | Puissance (NP / moy) | FC moy/max | TSS prioritaire |
| ------------- | :----------: | :------: | :-: | :----: | :------------------: | :--------: | --------------- |
| Course à pied | ✓            | ✓        | ✓   | ✓      | —                    | ✓          | rTSS            |
| Vélo          | ✓            | ✓        | ✓   | —      | ✓                    | ✓          | TSS puissance   |
| VTT           | ✓            | ✓        | ✓   | —      | ✓                    | ✓          | TSS puissance / hrTSS |
| Marche        | ✓            | ✓        | ✓   | —      | —         | ✓          | hrTSS           |
| Randonnée     | ✓            | ✓        | ✓   | —      | —         | ✓          | hrTSS           |
| Ski de fond   | ✓            | ✓        | ✓   | —      | —         | ✓          | hrTSS           |
| Ski alpin     | ✓            | ✓        | ✓   | —      | —         | ✓          | hrTSS           |
| Musculation   | ✓            | —        | —   | —      | —         | ✓          | RPE             |
| Autre         | ✓            | ✓        | —   | —      | —         | ✓          | hrTSS / RPE     |

> Tronc commun = Date, Titre, **Durée (obligatoire)**, RPE (recommandé), Notes.
> Tous les champs adaptatifs sont **facultatifs** — leur saisie améliore la précision du TSS.
