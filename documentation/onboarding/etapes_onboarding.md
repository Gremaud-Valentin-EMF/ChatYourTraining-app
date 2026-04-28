# Étapes d'onboarding — MVP

Sports couverts : Course à pied, Vélo, Marche, Randonnée, Ski alpin, Ski de fond, Musculation, Autre

---

## Étape 1 — Profil de base

Données identitaires minimales nécessaires pour personnaliser l'expérience et les calculs.

| Donnée            | Type                        | Obligatoire | Utilité                                         |
| ----------------- | --------------------------- | ----------- | ----------------------------------------------- |
| Sexe              | Homme / Femme / Non précisé | Oui         | Pondération TRIMP dans hrTSS (calcul de charge) |
| Date de naissance | Date                        | Oui         | Calcul de l'âge → estimation FC max (220 − âge) |
| Poids (kg)        | Nombre                      | Oui         | W/kg pour vélo, contexte coach IA               |
| Taille (cm)       | Nombre                      | Non         | Contexte coach IA                               |

---

## Étape 2 — Données cardiaques

Indispensables pour tous les sports sans capteur de puissance (marche, rando, ski, musculation).

| Donnée         | Type   | Obligatoire | Utilité                                                                    |
| -------------- | ------ | ----------- | -------------------------------------------------------------------------- |
| FC max (bpm)   | Nombre | Oui         | Base de toutes les zones cardio. Si non renseignée : estimée via 220 − âge |
| FC repos (bpm) | Nombre | Non         | Améliore la précision du hrTSS (TRIMP de Banister)                         |
| LTHR (bpm)     | Nombre | Non         | Seuil lactate cardiaque — affiné si disponible, sinon 85 % FC max          |

> La FC max peut être pré-remplie automatiquement depuis la date de naissance avec un avertissement "valeur estimée".

---

## Étape 3 — Sports pratiqués

Sélection parmi les 8 sports MVP + niveau autodéclaré.

| Donnée              | Type                                      | Obligatoire | Utilité                                             |
| ------------------- | ----------------------------------------- | ----------- | --------------------------------------------------- |
| Sports sélectionnés | Multi-choix (8 sports)                    | Oui (≥ 1)   | Détermine les étapes suivantes et le contexte coach |
| Niveau par sport    | Débutant / Intermédiaire / Avancé / Élite | Oui         | Personnalisation des conseils et valeurs par défaut |

**Sports MVP à proposer :**

- Course à pied
- Vélo
- Marche
- Randonnée
- Ski alpin
- Ski de fond
- Musculation
- Autre

---

## Étape 4 — Seuils de performance (conditionnel)

Affiché uniquement si l'athlète a sélectionné Course à pied, Vélo ou Ski de fond.
Les autres sports (marche, rando, ski alpin, musculation) utilisent hrTSS ou RPE — pas de seuil de performance à renseigner.

### Si Course à pied sélectionnée

| Donnée                | Type           | Obligatoire | Utilité                                     |
| --------------------- | -------------- | ----------- | ------------------------------------------- |
| VMA (km/h)            | Nombre décimal | Non         | Calcul rTSS (Normalized Graded Pace / vVMA) |
| Allure seuil (min/km) | Durée          | Non         | Alternative à la VMA si non testée          |

> Si ni VMA ni allure seuil : rTSS calculé via hrTSS par défaut.

### Si Vélo sélectionné

| Donnée                    | Type          | Obligatoire | Utilité                                        |
| ------------------------- | ------------- | ----------- | ---------------------------------------------- |
| FTP (watts)               | Nombre entier | Non         | Calcul TSS puissance (NP / FTP)                |
| FTP estimé (W/kg × poids) | Calculé       | —           | Affiché à titre indicatif si FTP non renseigné |

> Si FTP absent : TSS calculé via hrTSS par défaut.

### Si Ski de fond sélectionné

Pas de seuil spécifique à saisir — hrTSS utilisé automatiquement via FC.

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
