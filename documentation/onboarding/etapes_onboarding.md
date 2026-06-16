# Étapes d'onboarding — MVP

Sports couverts : Course à pied, Vélo, Marche, Randonnée, Ski alpin, Ski de fond, Musculation, Autre

---

## Étape 1 — Profil de base

Données identitaires minimales nécessaires pour personnaliser l'expérience et les calculs.

| Donnée            | Type                        | Obligatoire | Utilité                                                 |
| ----------------- | --------------------------- | ----------- | ------------------------------------------------------- |
| Sexe              | Homme / Femme / Non précisé | Oui         | Pondération TRIMP dans hrTSS (calcul de charge)         |
| Date de naissance | Date                        | Oui         | Calcul de l'âge — contexte coach IA et personnalisation |
| Poids (kg)        | Nombre                      | Oui         | W/kg pour vélo, contexte coach IA                       |
| Taille (cm)       | Nombre                      | Non         | Contexte coach IA                                       |

---

## Étape 2 — Données cardiaques

Utiles pour tous les sports sans capteur de puissance (marche, rando, ski, musculation). Aucune valeur n'est obligatoire car beaucoup d'utilisateurs ne connaissent pas ces données.

| Donnée       | Type   | Obligatoire | Utilité                                                                                            |
| ------------ | ------ | ----------- | -------------------------------------------------------------------------------------------------- |
| FC max (bpm) | Nombre | Non         | Utilisée uniquement comme fallback si la LTHR est absente (LTHR estimée à 85 % FC max).            |
| LTHR (bpm)   | Nombre | Non         | Valeur clé du calcul hrTSS — si absente, estimée via FC max. Si les deux sont absentes, hrTSS = 0. |

**Ordre de priorité pour le calcul hrTSS :**

1. LTHR connue → calcul précis
2. FC max connue, LTHR absente → LTHR estimée à 85 % FC max → calcul approximatif + pastille imprécision
3. Ni LTHR ni FC max → hrTSS impossible, TSS = -- + avertissement dans le profil et sur les entraînements

> **Pas d'estimation par l'âge (formule 220 − âge)** — trop imprécise, peut induire en erreur.

> **Message affiché à l'utilisateur :**
> "Vous ne connaissez pas votre FC max ou votre LTHR ? Pas de problème — vous pourrez demander à votre coach IA de vous proposer un test adapté à votre sport pour les déterminer."

---

## Étape 3 — Sports pratiqués

Sélection parmi les 8 sports MVP + niveau autodéclaré.

| Donnée              | Type                                                   | Obligatoire | Utilité                                             |
| ------------------- | ------------------------------------------------------ | ----------- | --------------------------------------------------- |
| Sports sélectionnés | Multi-choix (8 sports)                                 | Oui (≥ 1)   | Détermine les étapes suivantes et le contexte coach |
| Niveau par sport    | Découverte / Débutant / Intermédiaire / Avancé / Élite | Oui         | Personnalisation des conseils et valeurs par défaut |

**Sports MVP à proposer :**

- Course à pied
- Vélo
- Marche
- Randonnée
- Ski alpin
- Ski de fond
- Musculation
- Autre

### Définition des niveaux par sport

Les descriptions sont rédigées en "Je..." pour que l'utilisateur se reconnaisse. Elles servent aussi de contenu pour les tooltips/infobulles dans l'interface. Le langage est volontairement simple et sans références techniques.

> **Note affichée à l'utilisateur (sous le sélecteur de niveau) :**
> "Ces descriptions sont indicatives — choisissez le niveau qui vous ressemble le plus, même si vous ne correspondez pas exactement à chaque point."

---

#### Course à pied

| Niveau        | Description                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Découverte    | Je n'ai jamais vraiment couru ou je reprends après une longue pause. La course à pied est nouvelle pour moi.                       |
| Débutant      | Je cours depuis peu. Je m'arrête parfois pendant mes sorties et je n'ai pas encore participé à une course.                         |
| Intermédiaire | Je cours régulièrement et j'ai déjà participé à une course. Je m'entraîne plusieurs fois par semaine.                              |
| Avancé        | Je cours depuis plusieurs années avec un programme structuré. Je participe régulièrement à des courses et je cherche à progresser. |
| Élite         | Je m'entraîne quotidiennement et je participe à des compétitions de haut niveau.                                                   |

---

#### Vélo

| Niveau        | Description                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| Découverte    | Je ne fais pas de vélo sportif ou je reprends après une longue période sans pratiquer.                          |
| Débutant      | Je roule occasionnellement pour le plaisir ou les déplacements, sans objectif sportif particulier.              |
| Intermédiaire | Je roule régulièrement et j'ai déjà participé à un événement cycliste. Je suis à l'aise sur de longues sorties. |
| Avancé        | Je m'entraîne de façon structurée et je participe régulièrement à des événements cyclistes exigeants.           |
| Élite         | Je m'entraîne quotidiennement et je participe à des compétitions de haut niveau.                                |

---

#### Marche

| Niveau        | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Découverte    | Je marche peu ou je souhaite commencer à pratiquer la marche de façon plus régulière.           |
| Débutant      | Je marche pour me déplacer ou me promener, sans objectif sportif particulier.                   |
| Intermédiaire | Je marche régulièrement sur de bonnes distances avec un objectif de forme ou de santé.          |
| Avancé        | Je marche vite et sur de longues distances, je participe parfois à des événements organisés.    |
| Élite         | Je pratique la marche à haut niveau, en compétition ou sur des épreuves d'endurance exigeantes. |

---

#### Randonnée

| Niveau        | Description                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Découverte    | Je n'ai jamais vraiment randonnée ou je fais seulement de courtes balades de temps en temps.          |
| Débutant      | Je fais des balades sur terrain facile et bien balisé, sans trop de dénivelé.                         |
| Intermédiaire | Je randonnes régulièrement sur des terrains variés avec du dénivelé, parfois sur une journée entière. |
| Avancé        | Je fais de longues randonnées techniques, parfois sur plusieurs jours, avec un équipement autonome.   |
| Élite         | Je pratique l'alpinisme ou les courses de montagne de manière régulière et compétitive.               |

---

#### Ski alpin

| Niveau        | Description                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| Découverte    | Je n'ai jamais skié ou j'en suis à mes premières descentes avec un moniteur. |
| Débutant      | Je skie depuis peu et je suis à l'aise sur les pistes faciles.               |
| Intermédiaire | Je skie confortablement sur la plupart des pistes, avec une bonne technique. |
| Avancé        | Je maîtrise toutes les pistes et je skie parfois hors-piste.                 |
| Élite         | Je m'entraîne en club ou je participe à des compétitions.                    |

---

#### Ski de fond

| Niveau        | Description                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Découverte    | Je n'ai jamais fait de ski de fond ou j'essaie pour la première fois.                             |
| Débutant      | Je découvre le ski de fond et je maîtrise les bases sur des parcours faciles.                     |
| Intermédiaire | Je pratique régulièrement et je suis à l'aise sur des sorties d'une à deux heures.                |
| Avancé        | Je maîtrise bien la technique, je fais de longues sorties et je participe parfois à des épreuves. |
| Élite         | Je m'entraîne avec un programme structuré et je participe à des courses.                          |

---

#### Musculation

| Niveau        | Description                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| Découverte    | Je n'ai jamais pratiqué la musculation ou je commence tout juste à m'y intéresser.         |
| Débutant      | Je débute et j'apprends encore les mouvements de base.                                     |
| Intermédiaire | Je m'entraîne régulièrement avec un programme, je maîtrise les exercices essentiels.       |
| Avancé        | Je m'entraîne depuis plusieurs années avec une vraie programmation et des charges élevées. |
| Élite         | Je compétitionne ou j'accompagne d'autres athlètes en tant que préparateur physique.       |

---

#### Autre

Pas de choix de niveau — "Autre" regroupe des activités trop diverses pour définir un niveau pertinent. Ce sport est simplement enregistré sans niveau associé.

---

## Étape 4 — Seuils de performance (conditionnel)

Affiché uniquement si l'athlète a sélectionné Course à pied ou Vélo.

**Comportement TSS pour les autres sports — confirmé dans le code :**

| Sport       | Méthode prioritaire                                                           | Fallback 1     | Fallback 2 (durée fixe) |
| ----------- | ----------------------------------------------------------------------------- | -------------- | ----------------------- |
| Marche      | hrTSS (FC)                                                                    | RPE            | 30 TSS/h                |
| Randonnée   | hrTSS (FC)                                                                    | RPE            | 40 TSS/h                |
| Ski alpin   | hrTSS (FC)                                                                    | RPE            | 45 TSS/h                |
| Ski de fond | hrTSS (FC)                                                                    | RPE            | 70 TSS/h                |
| Musculation | hrTSS (FC) puis RPE — FC peu représentative en muscu, RPE souvent plus fiable | fallback durée | 50 TSS/h                |

> Le RPE est saisi par l'utilisateur à la fin de chaque séance, pas dans le profil. Si aucun RPE ni FC disponible, le fallback durée fixe s'applique automatiquement — pastille imprécision affichée.

> Pour la **musculation**, le hrTSS est peu fiable (la FC monte peu et de façon intermittente). Le RPE est la méthode de référence pour ce sport.

> **Règle générale — avertissement TSS imprécis :**
> La pastille imprécision s'affiche uniquement quand le TSS est calculé via le **fallback durée fixe** (aucune FC disponible ET aucun RPE saisi). Un hrTSS calculé avec une LTHR connue est un calcul valide — pas de pastille dans ce cas.
>
> Déclenchement de la pastille :
>
> - Pas de données FC (ni hrStream ni avgHr) **ET** pas de RPE saisi → fallback durée fixe → pastille + avertissement
>
> Où l'avertissement est affiché :
>
> 1. **Dans le profil**, sous la section seuils de performance : message invitant à renseigner les données ou à demander un test au coach IA.
> 2. **Sur les entraînements concernés**, une petite pastille indique que le TSS est une estimation grossière.

---

### Si Course à pied sélectionnée

| Donnée                | Type           | Obligatoire | Utilité                                     |
| --------------------- | -------------- | ----------- | ------------------------------------------- |
| VMA (km/h)            | Nombre décimal | Non         | Calcul rTSS (Normalized Graded Pace / vVMA) |
| Allure seuil (min/km) | Durée          | Non         | Alternative à la VMA si non testée          |

> Si ni VMA ni allure seuil renseignés : pas de rTSS, calcul via hrTSS + avertissement imprécision affiché.

> **Message affiché à l'utilisateur :**
> "Vous ne connaissez pas votre VMA ou votre allure seuil ? Vous pourrez les renseigner plus tard ou demander à votre coach IA de vous proposer un test."

---

### Si Vélo sélectionné

| Donnée      | Type          | Obligatoire | Utilité                                       |
| ----------- | ------------- | ----------- | --------------------------------------------- |
| FTP (watts) | Nombre entier | Non         | Calcul TSS puissance (Normalized Power / FTP) |

> Si FTP absent : pas de TSS puissance, calcul via hrTSS + avertissement imprécision affiché.

> **Message affiché à l'utilisateur :**
> "Vous ne connaissez pas votre FTP ? Vous pourrez le renseigner plus tard ou demander à votre coach IA de vous proposer un test."

---

### Ski de fond — pourquoi pas de seuil spécifique ?

Il n'existe pas de métrique de performance standard et accessible pour le ski de fond au niveau amateur :

- Pas de capteur de puissance répandu (contrairement au vélo)
- L'allure varie trop selon le terrain, la neige et la technique (classique vs skating)
- Le hrTSS via FC est l'approche la plus fiable et pratique pour notre cible

→ hrTSS utilisé automatiquement, avec avertissement imprécision si FC max non renseignée.

---

## Étape 5 — Disponibilité & volume

### Volume hebdomadaire cible

| Donnée                          | Type                         | Obligatoire | Utilité                                             |
| ------------------------------- | ---------------------------- | ----------- | --------------------------------------------------- |
| Heures d'entraînement / semaine | Slider 1–25h                 | Oui         | Calibrage de la charge cible (CTL) et planification |
| Objectif global                 | Performance / Santé / Loisir | Oui         | Tonalité et priorités des conseils du coach IA      |

Le slider est la valeur de référence : il définit **combien** l'utilisateur veut s'entraîner, indépendamment des créneaux.

---

### Disponibilités par jour

| Donnée          | Type                                         | Obligatoire | Utilité                                                        |
| --------------- | -------------------------------------------- | ----------- | -------------------------------------------------------------- |
| Jours activés   | Toggle par jour (lun–dim)                    | Non         | Filtrer les jours où le coach peut planifier des entraînements |
| Créneaux / jour | Liste de plages horaires (heure début → fin) | Non         | Préciser _quand_ l'utilisateur est libre chaque jour           |

**Règle de saisie des créneaux :**

- Chaque jour activé peut avoir **un ou plusieurs créneaux horaires** (ex : 06:00 → 07:30 + 12:00 → 13:15).
- Format : heure de début + heure de fin (sélecteurs en quarts d'heure).
- Bouton **"+ Ajouter un créneau"** pour en ajouter un second sur le même jour.
- Bouton **"×"** pour supprimer un créneau.
- Un jour non activé n'a pas de créneaux.

**Relation slider / créneaux :**

Le slider fixe le volume cible. Les créneaux informent le coach sur _quand_ le placer. Si les créneaux saisis dépassent le volume du slider, c'est normal — l'utilisateur a plus de disponibilités que nécessaire. Si les créneaux sont insuffisants pour atteindre le volume cible, le coach peut le signaler.

**Exemple de données sauvegardées :**

```json
{
  "monday": {
    "enabled": true,
    "slots": [{ "start": "06:00", "end": "07:30" }]
  },
  "tuesday": { "enabled": false, "slots": [] },
  "wednesday": {
    "enabled": true,
    "slots": [
      { "start": "06:00", "end": "07:30" },
      { "start": "12:00", "end": "13:00" }
    ]
  },
  "thursday": { "enabled": false, "slots": [] },
  "friday": {
    "enabled": true,
    "slots": [{ "start": "06:00", "end": "07:30" }]
  },
  "saturday": {
    "enabled": true,
    "slots": [{ "start": "09:00", "end": "11:00" }]
  },
  "sunday": { "enabled": true, "slots": [{ "start": "09:00", "end": "12:00" }] }
}
```

> Les créneaux sont optionnels. Si l'utilisateur n'en renseigne aucun, le coach travaille uniquement avec le volume hebdomadaire cible.

> **Message affiché à l'utilisateur :**
> "Indiquez les jours et créneaux où vous êtes généralement libre pour vous entraîner. Votre coach IA s'en servira pour proposer des séances adaptées à votre agenda."

---

## Étape 6 — Objectif(s)

Au moins un objectif est obligatoire. Il est le point de départ du coach IA pour personnaliser les conseils et la planification. L'utilisateur choisit d'abord une famille, puis un objectif dans la liste — ou saisit le sien via "Autre".

Plusieurs objectifs peuvent être renseignés (ex : une compétition ET un objectif de santé), mais **un seul est marqué comme objectif principal**.

---

### Famille 1 — Compétition / Événement

L'utilisateur vise une épreuve datée. Le coach peut périodiser (build → peak → taper) et cibler des allures / puissances.

**Champs communs à tous les événements :**

| Donnée              | Type  | Obligatoire | Utilité                                          |
| ------------------- | ----- | ----------- | ------------------------------------------------ |
| Nom de l'événement  | Texte | Non         | Affiché dans le dashboard et contexte coach      |
| Date de l'événement | Date  | Oui         | Calcul du temps restant, périodisation           |
| Temps objectif      | Texte | Non         | Personnalisation des allures / puissances cibles |

**Liste des épreuves proposées (filtrées selon les sports choisis à l'étape 3) :**

| Sport         | Épreuves disponibles                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| Course à pied | 5 km, 10 km, Semi-marathon, Marathon, Ultra-trail / Trail                       |
| Vélo          | Cyclosportive, Gran Fondo, Gravel event, Course sur route                       |
| Marche        | Marche nordique compétition, Marche athlétique, Randonnée sportive chronométrée |
| Randonnée     | Raid, Trek multi-jours, Haute randonnée, Skyrace / Ultra-trail rando            |
| Ski alpin     | Descente chronométrée, Compétition de ski alpin                                 |
| Ski de fond   | Skiathlon, Marathon nordique (ex : Vasaloppet), Course de ski de fond           |
| Musculation   | Compétition de powerlifting, Haltérophilie, Compétition de force athlétique     |
| Autre         | → champ libre "Décrivez votre événement"                                        |

---

### Famille 2 — Performance personnelle

L'utilisateur vise un cap personnel mesurable, sans compétition. Le coach structure les entraînements pour atteindre cet objectif progressivement.

**Champs :**

| Donnée          | Type  | Obligatoire | Utilité                                                |
| --------------- | ----- | ----------- | ------------------------------------------------------ |
| Objectif choisi | Liste | Oui         | Contexte coach, choix des séances adaptées             |
| Précision       | Texte | Non         | Détail libre (ex : "courir 5 km sous 30 min")          |
| Date cible      | Date  | Non         | "Avant le…" — échéance souhaitée sans épreuve formelle |

**Liste des objectifs proposés (filtrés selon les sports choisis à l'étape 3) :**

| Sport         | Objectifs disponibles                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Course à pied | Courir X km sans m'arrêter, Terminer mon premier 5 / 10 km, Améliorer mon allure sur X km, Courir régulièrement X fois/semaine   |
| Vélo          | Faire X km d'une traite, Gravir un col / dénivelé cible, Améliorer mon FTP, Rouler en extérieur pour la 1ère fois                |
| Marche        | Marcher X km d'une traite, Marcher X fois par semaine, Améliorer mon endurance à la marche                                       |
| Randonnée     | Réaliser une randonnée de X km / X m de D+, Porter un sac autonome sur plusieurs jours, Faire ma première haute randonnée        |
| Ski alpin     | Passer sur des pistes noires, Skier hors-piste pour la 1ère fois, Améliorer ma technique de virage                               |
| Ski de fond   | Faire une sortie de X km, Maîtriser la technique skating, Maîtriser la technique classique                                       |
| Musculation   | Faire X pompes / tractions d'affilée, Soulever X kg au développé couché / squat / soulevé de terre, Tenir une planche X secondes |
| Autre         | → champ libre "Décrivez votre objectif"                                                                                          |

---

### Famille 3 — Forme & Bien-être sportif

L'utilisateur cherche un bénéfice de forme physique ou de qualité de vie par le sport, sans objectif de performance précis. Le coach privilégie la régularité, la progressivité et l'équilibre.

> Les objectifs relevant du domaine médical, diététique ou psychologique (perte de poids, gestion du stress, rééducation, suivi post-grossesse) ne sont pas proposés — ils nécessitent un accompagnement spécialisé hors périmètre du coaching sportif.

**Champs :**

| Donnée          | Type  | Obligatoire | Utilité                                        |
| --------------- | ----- | ----------- | ---------------------------------------------- |
| Objectif choisi | Liste | Oui         | Tonalité et priorités des conseils du coach IA |
| Précision       | Texte | Non         | Contexte supplémentaire libre                  |

**Liste des objectifs proposés :**

| Thème                 | Objectifs disponibles                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Activité & énergie    | Être plus actif au quotidien, Améliorer mon endurance générale, Réduire la sédentarité |
| Force & composition   | Prendre de la masse musculaire, Améliorer mon ratio force/poids                        |
| Mobilité & prévention | Améliorer ma souplesse et mobilité, Prévenir les blessures par le renforcement         |
| Reprise d'activité    | Reprendre le sport après une longue pause                                              |
| Autre                 | → champ libre "Décrivez votre objectif"                                                |

---

### Priorité des objectifs

Chaque objectif reçoit un niveau de priorité parmi 3 :

| Niveau      | Signification pour le coach                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------- |
| **Haute**   | Priorité maximale dans la planification — le coach structure les semaines autour de cet objectif  |
| **Moyenne** | Intégré régulièrement mais cède la place à un objectif haute priorité en cas de conflit de charge |
| **Basse**   | Traité en fond, dans les créneaux restants — ne génère pas de séances dédiées systématiques       |

Plusieurs objectifs peuvent coexister avec des priorités différentes. Le coach séquence les objectifs datés selon leur date d'échéance, et intègre les objectifs non datés (Santé & Bien-être) en continu.

---

### États d'un objectif

| État        | Déclencheur                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `actif`     | Créé et en cours                                                                                   |
| `complété`  | Marqué manuellement par l'utilisateur, ou date d'épreuve passée depuis plus de 7 jours sans action |
| `abandonné` | L'utilisateur annule l'objectif (blessure, changement de plan)                                     |

Les objectifs complétés et abandonnés sont conservés en historique — ils ne sont jamais supprimés. Le coach les utilise pour contextualiser la progression ("vous avez déjà terminé un marathon en 2025").

---

### Analyse IA des objectifs — flux de validation

Quand l'utilisateur clique "Terminer l'onboarding" à la fin de l'étape 6, une analyse est déclenchée automatiquement avant la redirection vers le dashboard.

**Flux :**

```
1. Chargement — "Votre coach analyse vos objectifs..." (appel API, 2–3 sec)

2a. Aucun problème détecté → redirection dashboard

2b. Alertes détectées → écran intermédiaire :

    🔴 CRITIQUE  — situations qui rendent la planification très difficile
    🟠 ATTENTION — situations à risque, mais gérables avec des ajustements
    🔵 INFO      — observations utiles sans impact bloquant

    Exemple planification :
    🔴 "Votre marathon (12 avril) et votre cyclosportive (3 mai) sont séparés
        de 3 semaines. La récupération post-marathon dure généralement 3–4
        semaines — vous serez en phase de récupération pendant toute la
        préparation vélo."

    Exemple hors périmètre :
    🟠 "Votre objectif 'Perdre 10 kg' dépasse le périmètre du coaching
        sportif. Je ne suis pas en mesure de vous accompagner sur cet
        objectif — un diététicien ou médecin est le bon interlocuteur.
        Je peux en revanche adapter votre entraînement pour améliorer
        votre condition physique générale."

    [ ← Modifier mes objectifs ]     [ Continuer quand même → ]
```

**Cas particulier — objectifs "Autre" à contenu hors périmètre :**

Les champs libres "Autre" de chaque famille peuvent recevoir n'importe quel texte. L'analyse IA doit détecter si le contenu relève d'un domaine médical, psychologique ou nutritionnel, et le signaler avec une alerte `warning`.

Domaines à détecter dans le texte libre :

- Perte ou prise de poids, régime, alimentation
- Stress, anxiété, dépression, émotions, burn-out
- Sommeil, insomnies
- Rééducation, douleurs chroniques, blessures en cours
- Pathologies (diabète, hypertension, etc.)
- Grossesse, post-partum
- Compléments alimentaires, supplémentation

Si détecté → alerte `warning` + message de redirection vers le professionnel compétent. L'objectif est conservé tel quel dans la base (l'utilisateur garde la main), mais le coach ne le traitera pas dans ses réponses (voir `documentation/coach/prompt_system.md` — section 2).

L'utilisateur n'est jamais bloqué — il peut ignorer les alertes et continuer. Le coach adaptera la planification au mieux avec les contraintes données.

---

### Règles d'affichage et de validation

- Au moins **un objectif** est obligatoire pour terminer l'onboarding (toutes familles confondues).
- Pas de maximum imposé sur le nombre d'objectifs — l'analyse IA signale si c'est trop ambitieux.
- Cette étape n'est pas passable sans objectif renseigné.
- Les objectifs peuvent être modifiés, ajoutés ou archivés dans la section **Objectifs** du dashboard.

---

## Résumé des étapes

| #   | Étape                  | Obligatoire        | Conditionnel                    |
| --- | ---------------------- | ------------------ | ------------------------------- |
| 1   | Profil de base         | Oui                | Non                             |
| 2   | Données cardiaques     | Oui (FC max)       | Non                             |
| 3   | Sports pratiqués       | Oui                | Non                             |
| 4   | Seuils de performance  | Non                | Oui (course, vélo, ski de fond) |
| 5   | Disponibilité & volume | Oui                | Non                             |
| 6   | Objectif(s)            | Oui (≥ 1 objectif) | Non                             |

---

## Ce qui n'est PAS dans l'onboarding MVP

- Natation (natation retirée des sports MVP)
- CSS (Critical Swim Speed) — inutile sans natation
- Triathlon — retiré des sports MVP
- Intégrations Strava / Whoop — proposées après onboarding dans la page Intégrations
