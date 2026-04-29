# Étapes d'onboarding — MVP

Sports couverts : Course à pied, Vélo, Marche, Randonnée, Ski alpin, Ski de fond, Musculation, Autre

---

## Étape 1 — Profil de base

Données identitaires minimales nécessaires pour personnaliser l'expérience et les calculs.

| Donnée            | Type                        | Obligatoire | Utilité                                         |
| ----------------- | --------------------------- | ----------- | ----------------------------------------------- |
| Sexe              | Homme / Femme / Non précisé | Oui         | Pondération TRIMP dans hrTSS (calcul de charge) |
| Date de naissance | Date                        | Oui         | Calcul de l'âge — contexte coach IA et personnalisation |
| Poids (kg)        | Nombre                      | Oui         | W/kg pour vélo, contexte coach IA               |
| Taille (cm)       | Nombre                      | Non         | Contexte coach IA                               |

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

| Sport       | Méthode prioritaire                                | Fallback 1 | Fallback 2 (durée fixe) |
| ----------- | -------------------------------------------------- | ---------- | ----------------------- |
| Marche      | hrTSS (FC)                                         | RPE        | 30 TSS/h                |
| Randonnée   | hrTSS (FC)                                         | RPE        | 40 TSS/h                |
| Ski alpin   | hrTSS (FC)                                         | RPE        | 45 TSS/h                |
| Ski de fond | hrTSS (FC)                                         | RPE        | 70 TSS/h                |
| Musculation | hrTSS (FC) puis RPE — FC peu représentative en muscu, RPE souvent plus fiable | fallback durée | 50 TSS/h |

> Le RPE est saisi par l'utilisateur à la fin de chaque séance, pas dans le profil. Si aucun RPE ni FC disponible, le fallback durée fixe s'applique automatiquement — pastille imprécision affichée.

> Pour la **musculation**, le hrTSS est peu fiable (la FC monte peu et de façon intermittente). Le RPE est la méthode de référence pour ce sport.

> **Règle générale — avertissement TSS imprécis :**
> La pastille imprécision s'affiche uniquement quand le TSS est calculé via le **fallback durée fixe** (aucune FC disponible ET aucun RPE saisi). Un hrTSS calculé avec une LTHR connue est un calcul valide — pas de pastille dans ce cas.
>
> Déclenchement de la pastille :
> - Pas de données FC (ni hrStream ni avgHr) **ET** pas de RPE saisi → fallback durée fixe → pastille + avertissement
>
> Où l'avertissement est affiché :
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

| Donnée                          | Type                         | Obligatoire | Utilité                                             |
| ------------------------------- | ---------------------------- | ----------- | --------------------------------------------------- |
| Heures d'entraînement / semaine | Slider 1–20h                 | Oui         | Calibrage de la charge cible (CTL) et planification |
| Jours disponibles               | Multi-choix (lun–dim)        | Non         | Génération de plans d'entraînement                  |
| Objectif global                 | Performance / Santé / Loisir | Oui         | Tonalité et priorités des conseils du coach IA      |

---

## Étape 6 — Objectif principal (optionnel)

Peut être passée et renseignée plus tard dans la section Objectifs.

| Donnée              | Type  | Obligatoire | Utilité                                                         |
| ------------------- | ----- | ----------- | --------------------------------------------------------------- |
| Nom de l'événement  | Texte | Non         | Affiché dans le dashboard et contexte coach                     |
| Date de l'événement | Date  | Non         | Calcul du temps restant, périodisation                          |
| Type d'épreuve      | Liste | Non         | Adapter les conseils (ex : marathon, cyclosportive, raid rando) |
| Temps objectif      | Texte | Non         | Personnalisation des allures cibles                             |

**Types d'épreuves à proposer (filtrés selon sports choisis) :**

- Course à pied : 5 km, 10 km, Semi, Marathon, Ultra/Trail
- Vélo : Cyclosportive, Gran Fondo, Course sur route
- Rando / Marche : Raid, Trek multi-jours
- Ski de fond : Skiathlon, Marathon nordique (ex : Vasaloppet)
- Autre : Événement personnalisé

---

## Résumé des étapes

| #   | Étape                  | Obligatoire  | Conditionnel                    |
| --- | ---------------------- | ------------ | ------------------------------- |
| 1   | Profil de base         | Oui          | Non                             |
| 2   | Données cardiaques     | Oui (FC max) | Non                             |
| 3   | Sports pratiqués       | Oui          | Non                             |
| 4   | Seuils de performance  | Non          | Oui (course, vélo, ski de fond) |
| 5   | Disponibilité & volume | Oui          | Non                             |
| 6   | Objectif principal     | Non          | Non                             |

---

## Ce qui n'est PAS dans l'onboarding MVP

- Natation (natation retirée des sports MVP)
- CSS (Critical Swim Speed) — inutile sans natation
- Triathlon — retiré des sports MVP
- Intégrations Strava / Whoop — proposées après onboarding dans la page Intégrations
