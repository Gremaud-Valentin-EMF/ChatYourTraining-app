# User stories — ChatYourTraining

> 6 EPICs · 34 User Stories

---

## EPIC-01 — Gestion du profil et du compte athlète

---

### US-01 : Inscription par e-mail

_En tant qu'_ **Athlète**,
_je veux_ créer un compte avec mon adresse e-mail et un mot de passe,
_afin de_ accéder à l'application et commencer à configurer mon profil sportif.

**Critères d'acceptation :**

- Étant donné que je suis sur la page `/register` et que je saisis un e-mail valide non utilisé et un mot de passe d'au moins 12 caractères avec une majuscule, un chiffre et un caractère spécial
  quand je soumets le formulaire,
  alors un e-mail de confirmation est envoyé sous 60 secondes et je suis redirigé vers une page me demandant de vérifier ma boîte mail.

- Étant donné que je clique sur le lien de confirmation reçu par e-mail,
  quand le lien est valide et non expiré,
  alors mon compte est activé, une session est créée et je suis redirigé vers l'onboarding `/onboarding`.

- Étant donné que je tente de m'inscrire avec un e-mail déjà associé à un compte existant,
  quand je soumets le formulaire,
  alors un message d'erreur s'affiche : _"Cette adresse e-mail est déjà utilisée"_ avec un lien vers `/login`.

- Étant donné que je saisis un mot de passe ne respectant pas les critères de complexité,
  quand je quitte le champ mot de passe,
  alors les critères manquants sont affichés et le bouton de soumission reste désactivé.

---

### US-02 : Connexion et persistance de session

_En tant qu'_ **Athlète**,
_je veux_ me connecter avec mon e-mail et mon mot de passe et rester connecté entre les sessions,
_afin de_ accéder rapidement à mon espace sans me réauthentifier à chaque visite.

**Critères d'acceptation :**

- Étant donné que je suis sur `/login` avec un compte confirmé,
  quand je saisis mes identifiants corrects et clique sur "Se connecter",
  alors une session est créée, un cookie sécurisé (`httpOnly`, `sameSite: strict`) est positionné et je suis redirigé vers `/dashboard`.

- Étant donné que je suis connecté et que je ferme l'onglet,
  quand je rouvre l'application dans les 7 jours suivants,
  alors ma session est automatiquement restaurée sans nouvelle saisie d'identifiants.

- Étant donné que je saisis un e-mail ou un mot de passe incorrect,
  quand je soumets le formulaire,
  alors le message générique _"E-mail ou mot de passe incorrect"_ s'affiche sans préciser lequel est faux.

- Étant donné que je saisis un mot de passe incorrect 5 fois de suite,
  quand je tente une 6ème connexion,
  alors le compte est temporairement bloqué 15 minutes et un message indique le délai restant.

---

### US-03 : Réinitialisation du mot de passe

_En tant que_ **Visiteur** ayant oublié son mot de passe,
_je veux_ recevoir un lien de réinitialisation sécurisé par e-mail,
_afin de_ retrouver l'accès à mon compte sans perdre mes données.

**Critères d'acceptation :**

- Étant donné que je clique sur "Mot de passe oublié" depuis `/login` et que je saisis mon e-mail,
  quand je soumets le formulaire,
  alors un e-mail contenant un lien valable 1 heure est envoyé sous 60 secondes, que le compte existe ou non (réponse identique pour éviter l'énumération d'e-mails).

- Étant donné que je clique sur un lien de réinitialisation valide,
  quand je saisis et confirme un nouveau mot de passe respectant les critères,
  alors mon mot de passe est mis à jour, toutes les sessions actives sont invalidées et je suis redirigé vers `/login`.

- Étant donné que je clique sur un lien de réinitialisation expiré ou déjà utilisé,
  quand la page se charge,
  alors un message d'erreur s'affiche : _"Ce lien est expiré ou invalide"_ avec un bouton pour faire une nouvelle demande.

---

### US-04 : Onboarding — Saisie du profil sportif initial

_En tant qu'_ **Athlète** ayant confirmé son compte,
_je veux_ renseigner mon sport principal, mon niveau et mes paramètres physiologiques clés lors d'un onboarding guidé,
_afin de_ permettre au Coach IA de personnaliser immédiatement ses analyses et conseils.

**Critères d'acceptation :**

- Étant donné que je suis à l'étape de sélection du sport,
  quand je sélectionne mes sports,
  alors les champs physiologiques s'adaptent dynamiquement. (Voir [Données phyisologique par sport](../sports/sports_physiological_data.md))

- Étant donné que j'ai complété toutes les étapes obligatoires (Voir [Données phyisologique par sport](../onboarding/etapes_onboarding.md)),
  quand je clique sur "Terminer",
  alors le flag `onboarding_completed = true` est mis à jour en base, je suis redirigé vers `/dashboard` et un message de bienvenue personnalisé du Coach IA s'affiche.

- Étant donné que je saisis une valeur physiologique hors limites (ex : FTP = 1500 watts),
  quand je quitte le champ,
  alors un avertissement s'affiche (_"Valeur inhabituelle, êtes-vous sûr ?"_) mais la saisie n'est pas bloquée.

---

### US-05 : Modification du profil sportif

_En tant qu'_ **Athlète**,
_je veux_ mettre à jour mes paramètres physiologiques disponibles (ex: FTP, VMA, poids, FC max) depuis la page profil,
_afin de_ maintenir la précision des calculs de charge après une progression.

**Critères d'acceptation :**

- Étant donné que je suis sur `/profile` et que je modifie mon FTP de 250 à 265 watts,
  quand je clique sur "Sauvegarder",
  alors la valeur est mise à jour en base, un toast de confirmation s'affiche et les futurs calculs de TSS utilisent la nouvelle valeur.

- Étant donné que je veux ajouter un sport secondaire,
  quand j'ajoute `Course à pied` avec une VMA de 16 km/h,
  alors une nouvelle entrée est créée dans `user_sports` et le Coach IA dispose des deux sports dans son contexte JSON.

- Étant donné que je clique sur "Sauvegarder" sans avoir modifié aucun champ,
  quand la requête est soumise,
  alors aucune écriture n'est effectuée en base et un message indique _"Aucune modification détectée"_.

---

---

## EPIC-02 — Gestion des objectifs sportifs

---

### US-06 : Création d'un objectif sportif

_En tant qu'_ **Athlète**,
_je veux_ créer un objectif sportif avec une date cible, un sport, un type d'événement, une description et une priorité,
_afin de_ permettre au Coach IA d'orienter mon entraînement vers un but concret et daté.

**Critères d'acceptation :**

- Étant donné que je suis sur `/objectives` et que je clique sur "Ajouter un objectif",
  quand je renseigne le nom, la date, le sport, le type d'événement (Ex: `race`, `granfondo`, `marathon`, etc.), la description et la priorité (`A`, `B`, `C`),
  alors l'objectif est créé en base et apparaît dans la liste de mes objectifs.

- Étant donné que j'essaie de créer un objectif avec une date passée,
  quand je soumets le formulaire,
  alors une erreur de validation s'affiche : _"La date de l'objectif doit être une date future"_.

- Étant donné que je crée un objectif de priorité `A`,
  quand l'objectif est sauvegardé,
  alors cet objectif devient l'objectif principal visible sur le dashboard et injecté en premier dans le contexte JSON du Coach IA.

- Étant donné que je crée un 3ème objectif de priorité `A`,
  quand je soumets le formulaire,
  alors j'ai un message d'erreur qui s'affiche en me disant _"Vous ne pouvez avoir que 2 objectifs en priorité A par année"_.

- Étant donné que je crée un objectif sans renseigner de priorité,
  quand je soumets le formulaire,
  alors la priorité `B` est attribuée par défaut.

---

### US-07 : Visualisation et suivi des objectifs

_En tant qu'_ **Athlète**,
_je veux_ consulter la liste de mes objectifs avec un compte à rebours et un indicateur de progression,
_afin de_ savoir en un coup d'œil combien de jours il me reste et si mon entraînement est en adéquation.

**Critères d'acceptation :**

- Étant donné que j'ai au moins un objectif futur,
  quand j'accède à `/objectives`,
  alors chaque objectif est affiché avec : nom, date, sport, type, description, priorité, et nombre de jours restants calculé dynamiquement.

- Étant donné que j'ai un objectif de priorité `A` à moins de 7 jours,
  quand j'ouvre le dashboard ou le chat,
  alors une alerte de compte à rebours s'affiche automatiquement : _"🎯 [Nom de l'objectif] : J-[X]"_.

- Étant donné qu'aucun objectif futur n'existe,
  quand j'accède à `/objectives`,
  alors un état vide s'affiche avec le message _"Aucun objectif défini"_ et un bouton CTA _"Créer mon premier objectif"_.

---

### US-08 : Modification et suppression d'un objectif

_En tant qu'_ **Athlète**,
_je veux_ modifier ou supprimer un objectif existant,
_afin de_ maintenir mon planning à jour en cas de changement.

**Critères d'acceptation :**

- Étant donné que je clique sur "Modifier" sur un objectif existant,
  quand je change la date et sauvegarde,
  alors l'objectif est mis à jour en base et le nombre de jours restants sur le dashboard est recalculé immédiatement.

- Étant donné que je clique sur "Supprimer" sur un objectif,
  quand je confirme dans la modale de confirmation,
  alors l'objectif est supprimé de la base et disparaît de la liste sans rechargement de la page.

- Étant donné que je tente de supprimer un objectif de priorité `A` sans en avoir un autre,
  quand je confirme la suppression,
  alors l'objectif est supprimé et le dashboard affiche l'état vide pour la section "Prochain objectif".

---

---

## EPIC-03 — Gestion des intégrations externes (Strava & Whoop)

---

### US-09 : Connexion au compte Strava via OAuth

_En tant qu'_ **Athlète**,
_je veux_ connecter mon compte Strava à ChatYourTraining via OAuth 2.0,
_afin de_ importer automatiquement mes activités sportives et alimenter le calcul de ma charge d'entraînement.

**Critères d'acceptation :**

- Étant donné que je clique sur "Connecter Strava" depuis `/integrations`,
  quand j'autorise l'accès sur la page Strava,
  alors je suis redirigé vers `/api/strava/callback`, les tokens sont stockés chiffrés en base et le statut passe à `connected` dans l'UI.

- Étant donné que la connexion OAuth est établie pour la première fois,
  quand le callback est traité,
  alors les activités des 90 derniers jours sont importées en arrière-plan et une notification confirme le nombre d'activités importées.

- Étant donné que je refuse l'autorisation sur la page Strava,
  quand je suis redirigé vers l'application,
  alors un message informatif s'affiche _"Connexion annulée"_ et le statut reste `disconnected`.

- Étant donné qu'un callback arrive sans paramètre `state` valide,
  quand la requête est reçue,
  alors elle est rejetée avec une erreur 403 et aucun token n'est stocké.

---

### US-10 : Connexion au compte Whoop via OAuth

_En tant qu'_ **Athlète** possédant un bracelet Whoop,
_je veux_ connecter mon compte Whoop via OAuth 2.0,
_afin de_ synchroniser mes données de récupération et permettre au Coach IA de croiser charge externe et charge interne.

**Critères d'acceptation :**

- Étant donné que je clique sur "Connecter Whoop" et que j'autorise l'accès,
  quand le callback est traité,
  alors les métriques des 30 derniers jours sont importées dans `daily_metrics`.

- Étant donné que la connexion vient d'être établie,
  quand je retourne sur le dashboard,
  alors la jauge de récupération affiche le score du jour et les données de sommeil de la nuit précédente sont visibles.

- Étant donné que l'API Whoop retourne une erreur 503 lors d'une sync,
  quand la requête est exécutée,
  alors les données existantes sont conservées et un message avertit _"Whoop indisponible, les données peuvent ne pas être à jour"_.

---

### US-11 : Synchronisation manuelle des données

_En tant qu'_ **Athlète**,
_je veux_ déclencher manuellement une synchronisation depuis la page intégrations,
_afin de_ forcer le rafraîchissement de mes données après une activité récente.

**Critères d'acceptation :**

- Étant donné que Strava ou Whoop est connecté,
  quand je clique sur "Synchroniser maintenant",
  alors une requête est envoyée à `/api/sync/strava` et/ou `/api/sync/whoop`, un spinner s'affiche et seules les données postérieures à la dernière sync sont importées.

- Étant donné que la synchronisation est terminée avec succès,
  quand la réponse API est reçue,
  alors un toast indique le nombre de nouvelles données importées et/ou une icône de validation est affiché avec la date de "Dernière synchronisation" est mise à jour.

- Étant donné que le token d'une intégration a expiré,
  quand la sync est déclenchée,
  alors un rafraîchissement automatique via `refresh_token` est tenté ; si celui-ci échoue, un bandeau invite l'athlète à reconnecter son compte.

- Étant donné que je déclenche une sync avec 30 nouvelles activités à importer,
  quand la sync est en cours,
  alors toutes les activités sont traitées et enregistrées en moins de 15 secondes.

---

### US-12 : Déconnexion d'une intégration

_En tant qu'_ **Athlète**,
_je veux_ déconnecter Strava ou Whoop de mon compte,
_afin de_ révoquer les accès accordés tout en conservant les données déjà importées.

**Critères d'acceptation :**

- Étant donné que je clique sur "Déconnecter" et que je confirme dans la modale,
  quand l'action est validée,
  alors les tokens sont supprimés de la base, le statut passe à `disconnected` et une requête de révocation est envoyée à l'API tierce.

- Étant donné que je déconnecte Strava ou Whoop,
  quand la déconnexion est confirmée,
  alors toutes les activités ou données précédemment importées sont conservées en base et restent visibles dans `/workouts` ou `/health`.

- Étant donné que la requête de révocation envoyée à l'API Strava échoue,
  quand l'erreur est reçue,
  alors aucun token n'est pas supprimé, le statut reste `connected`, et un message d'erreur
  s'affiche : "La déconnexion a échoué. Réessaie dans un instant.".

---

---

## EPIC-04 — Gestion de la charge d'entraînement et des statistiques

---

### US-13 : Calcul et affichage du CTL, ATL et TSB

_En tant qu'_ **Athlète**,
_je veux_ voir mes métriques de charge d'entraînement (CTL, ATL, TSB) sur le dashboard,
_afin de_ comprendre mon niveau de forme actuel et anticiper les risques de surmenage ou de sous-entraînement.

**Critères d'acceptation :**

- Étant donné que j'ai au moins 7 jours d'activités importées,
  quand j'accède au dashboard,
  alors les valeurs numériques de CTL (42j), ATL (7j) et TSB s'affichent avec leur statut
  textuel selon les seuils suivants :

  - TSB < -10 : `Fatigué` — récupération insuffisante, performance limitée
  - TSB entre -10 et -5 : `Légèrement fatigué` — entraînement productif possible
  - TSB entre -5 et +25 : `En forme` — zone optimale de performance et de compétition
  - TSB > +25 : `Sur-récupéré` — risque de perte de fitness, trop de repos

- Étant donné que j'ai plus de 14 jours d'activités,
  quand je consulte le graphique de charge,
  alors un graphique linéaire affiche l'évolution de CTL, ATL et TSB sur les 60 derniers jours.

- Étant donné que j'ai moins de 7 jours d'activités importées,
  quand j'accède au dashboard,
  alors les métriques s'affichent avec la mention _"Données insuffisantes — les calculs gagnent en précision après 14 jours d'entraînement"_.

- Étant donné que j'ai 90 jours d'activités en base,
  quand le dashboard se charge,
  alors les métriques sont affichées en moins de 2 secondes, les valeurs étant lues depuis `training_load` et non recalculées à la volée.

---

### US-14 : Calcul du TSS par activité

_En tant qu'_ **Athlète**,
_je veux_ que chaque activité importée ou saisie dispose d'un TSS calculé automatiquement selon la méthode adaptée à mes données,
_afin de_ disposer d'une mesure homogène de la charge de chaque séance quelle que soit la source de données.

**Critères d'acceptation :**

- Étant donné qu'une activité est importée avec des données,
  quand le TSS est calculé,
  alors il utilise la formule du TSS qui correspond le mieux au sport en question et sinon le hrTSS est utilisé en dernier choix.

- Étant donné qu'une activité est saisie manuellement ou qu'elle est importé sans données avec seulement un RPE (1–10),
  quand le TSS est calculé,
  alors il utilise la table de Friel (RPE-based TSS) et le type de calcul `rpe-based` est enregistré.

- Étant donné qu'une activité est importée sans aucune donnée de puissance, d'allure ni de FC,
  quand le calcul est tenté,
  alors le TSS est estimé à 0 et le type est marqué `estimated` avec un avertissement visible dans le détail de l'activité.

---

### US-15 : Visualisation de l'historique des activités

_En tant qu'_ **Athlète**,
_je veux_ consulter la liste de mes activités avec leurs métriques calculées,
_afin de_ vérifier que mes séances sont correctement enregistrées et que les valeurs de TSS sont cohérentes.

**Critères d'acceptation :**

- Étant donné que j'ai des activités importées depuis Strava,
  quand j'accède à `/workouts`,
  alors une liste paginée (20 par page) s'affiche, triée par date décroissante, avec titre, sport, date, durée et TSS calculé.

- Étant donné que je clique sur une activité,
  quand la page de détail se charge,
  alors je vois les métriques clés (distance, dénivelé, puissance moyenne, NP, IF, TSS) et le type de calcul TSS utilisé (`power-based`, `hr-based`, `rpe-based`, `estimated`).

- Étant donné qu'aucune activité n'est importée,
  quand j'accède à `/workouts`,
  alors un état vide s'affiche avec le message _"Aucune activité trouvée"_ et un CTA vers `/integrations`.

---

### US-16 : Alertes de surcharge ou de sous-entraînement

_En tant qu'_ **Athlète**,
_je veux_ être alerté visuellement sur le dashboard lorsque mes métriques de charge indiquent un risque,
_afin de_ prendre des décisions d'entraînement éclairées avant d'aggraver ma fatigue ou de stagner.

**Critères d'acceptation :**

- Étant donné que mon TSB est compris entre -30 et -10,
  quand j'ouvre le dashboard,
  alors un bandeau bleu informatif s'affiche : "💪 Zone de charge productive : ton TSB
  est à [valeur]. Tu progresses — surveille ta récupération."

- Étant donné que mon TSB est inférieur à -30,
  quand j'ouvre le dashboard,
  alors un bandeau rouge d'alerte s'affiche : "🚨 Risque de surentraînement : ton TSB
  est à [valeur]. Réduis ton TSS de 50% cette semaine." avec un lien vers le Coach IA.

- Étant donné que mon score de récupération est inférieur à 34% ET que ma séance du jour
  est de type `threshold`, `vo2max` ou `anaerobic`,
  quand j'ouvre le dashboard,
  alors un badge rouge s'affiche sur la séance indiquant que la récupération est
  insuffisante pour une séance de haute intensité, et un bouton "Demander une adaptation
  au Coach IA" est proposé.

- Étant donné que mon score de récupération est faible ET que ma séance du jour
  est de faible intensité (`recovery` ou `endurance`),
  quand j'ouvre le dashboard,
  alors aucune alerte n'est déclenchée, car la séance est compatible avec l'état
  de récupération de l'athlète.

---

### US-17 : Résumé hebdomadaire

_En tant qu'_ **Athlète**,
_je veux_ voir un résumé de ma semaine en cours sur le dashboard (heures, TSS total, séances réalisées),
_afin de_ évaluer si je suis dans les volumes prévus et adapter ma fin de semaine si nécessaire.

**Critères d'acceptation :**

- Étant donné que j'ai des activités cette semaine,
  quand j'ouvre le dashboard,
  alors le résumé affiche : heures totales effectuées vs heures cibles, TSS total vs TSS cible, séances réalisées vs planifiées.

- Étant donné que la semaine vient de commencer (lundi, aucune séance faite),
  quand j'ouvre le dashboard,
  alors le résumé affiche "0h / 0 TSS" avec les cibles de la semaine visibles.

- Étant donné que j'ai des séances planifiées et/ou complétées cette semaine,
  quand je consulte le widget semaine,
  alors un mini-calendrier (L à D) affiche une pastille par entrainement de la couleur défini pour le sport.

---

---

## EPIC-05 — Gestion des entraînements et du calendrier

---

### US-18 : Visualisation du calendrier d'entraînement

_En tant qu'_ **Athlète**,
_je veux_ consulter un calendrier mensuel ou hebdomadaire de mes séances planifiées et réalisées,
_afin de_ avoir une vue d'ensemble de mon planning et identifier les jours de charge ou de repos.

**Critères d'acceptation :**

- Étant donné que j'ai des séances planifiées et/ou complétées,
  quand j'accède à `/calendar`,
  alors chaque séance est affichée sur sa date avec : titre, sport (icône), durée et statut (planifiée, faite, manquée).

- Étant donné que je clique sur une journée dans le calendrier,
  quand le détail s'ouvre,
  alors je vois le détail complet de la journée, avec le ou les entrainement du jour, la météo, une fatigue du jour, des commmentaires.

- Étant donné que je clique sur une séance depuis le détail d'une journée,
  quand la séance s'ouvre,
  alors je vois la description complète
  avec les données et un bouton "Marquer comme faite" si la séance est passée ou d'aujourd'hui.

- Étant donné qu'aucune séance n'est planifiée pour une semaine donnée,
  quand j'affiche cette semaine dans le calendrier,
  alors les jours apparaissent vides avec un message _"Aucune séance planifiée — demande un plan au Coach IA"_.

---

### US-19 : Création manuelle d'une activité manuelle

_En tant qu'_ **Athlète**,
_je veux_ créer manuellement une séance dans mon calendrier avec ses caractéristiques,
_afin de_ planifier un entraînement ou ajouter une activité non généré par l'IA ou issu d'un plan externe.

**Critères d'acceptation :**

- Étant donné que je clique sur "Ajouter une activité" depuis le calendrier,
  quand je renseigne le sport, le statut (planned, completed), la date, la durée, l'intensité et une description optionnelle, puis je valide,
  alors la séance est créée avec le statut correcte et apparaît dans le calendrier à la bonne date.

- Étant donné que je sélectionne une date passée pour créer une activité planifiée,
  quand je soumets le formulaire,
  alors une erreur s'affiche : _"Une séance planifiée doit être à une date future. Utilisez le statut completed pour enregistrer une séance déjà effectuée."_

- Étant donné que je crée une séance avec une durée de 0 minutes,
  quand je soumets le formulaire,
  alors une erreur de validation s'affiche : _"La durée doit être supérieure à 0"_.

---

### US-20 : Saisie manuelle d'une activité réalisée

_En tant qu'_ **Athlète**,
_je veux_ enregistrer manuellement une activité que j'ai réalisée,
_afin de_ maintenir mon historique complet même sans intégration Strava active.

**Critères d'acceptation :**

- Étant donné que je renseigne le sport, la date passée, la durée et le RPE (1–10),
  quand je valide,
  alors l'activité est créée avec le statut `completed`, le TSS est calculé via la méthode RPE-based et l'activité est visible dans `/workouts`.

- Étant donné que je renseigne plusieurs indicateurs d'intensité pour une activité
  (ex : puissance + RPE, allure + RPE, FC + RPE),
  quand le TSS est calculé,
  alors la méthode la plus précise disponible est utilisée en priorité selon la
  hiérarchie suivante : `power-based` > `hr-based` > `pace-based` > `rpe-based`.

- Étant donné que je saisis une date dans le futur pour une activité avec le statut completed,
  quand je soumets le formulaire,
  alors une erreur s'affiche : _"Une activité réalisée ne peut pas être dans le futur. Utilisez le statut planned."_

---

### US-21 : Marquage d'une séance comme accomplie

_En tant qu'_ **Athlète**,
_je veux_ marquer une séance planifiée comme faite et saisir mon RPE réel,
_afin de_ mettre à jour ma charge d'entraînement avec les données réelles de l'effort fourni.

**Critères d'acceptation :**

- Étant donné que j'ai une séance planifiée pour aujourd'hui ou une date passée,
  quand je clique sur "Marquer comme faite" et que je saisis mon RPE (1–10),
  alors le statut passe à `completed`, le TSS réel est recalculé si le RPE diffère du RPE prévu, et la séance affiche le badge ✓.

- Étant donné que j'essaie de marquer comme faite une séance avec une date future,
  quand j'accède au bouton,
  alors le bouton "Marquer comme faite" est absent ou désactivé pour les séances futures.

- Étant donné que je marque une séance comme faite sans renseigner le RPE,
  quand je valide,
  alors le RPE prévu initial est conservé pour le calcul du TSS et un message indique _"RPE estimé utilisé"_.

---

### US-22 : Marquage d'une séance comme manquée

_En tant qu'_ **Athlète**,
_je veux_ voir qu'une séance n'a pas été réalisée,
_afin de_ tenir mon calendrier à jour et permettre au Coach IA de prendre en compte les séances sautées dans ses analyses.

**Critères d'acceptation :**

- Étant donné que j'ai une séance planifiée dont la date est passée et qui n'a pas été marquée comme faite,
  quand je consulte celle-ci,
  alors le statut passe à `skipped`, la séance apparaît en rouge dans le calendrier et le TSS de cette journée est comptabilisé à 0 mais je peux quand même toujours la marquer comme faite.

---

---

## EPIC-06 — Gestion du coaching IA (Le Cerveau)

---

### US-23 : Conversation contextuelle avec le Coach IA

_En tant qu'_ **Athlète**,
_je veux_ envoyer un message au Coach IA et recevoir une réponse adaptée au sport personnalisée basée sur mes données réelles,
_afin de_ obtenir des conseils d'entraînement précis et actionnables adaptés à mon état physiologique du moment.

**Critères d'acceptation :**

- Étant donné que je suis sportif dans un sport quelquonque avec des données liées à celui-ci, une valeur de TSB et une récupération Whoop
  quand j'envoie le message _"Est-ce que je peux faire ma séance d'ujourd'hui ?"_,
  alors la réponse mentionne explicitement mon TSB et mon score de récupération, et propose une adaptation si nécessaire avec justification physiologique.

- Étant donné que j'ai renseigné mon sport principal avec les données liées à celui-ci renseigné,
  quand je demande conseil sur l'intensité d'une séance,
  alors la réponse utilise le vocabulaire du sport en question.

- Étant donné que j'envoie un message,
  quand la requête est envoyée à l'API,
  alors les tokens de réponse s'affichent progressivement via SSE, avec un indicateur de frappe visible dès la première seconde.

- Étant donné que l'API LLM est indisponible ou retourne une erreur 500,
  quand j'envoie un message,
  alors le message _"Le Coach IA est momentanément indisponible. Réessaie dans un instant."_ s'affiche, mon message n'est pas perdu et un bouton "Réessayer" est visible.

**Exemple concret :**

> **Profil :** Cycliste, FTP 260 W, connecté Whoop.
> **Données du jour :** TSB = -25 (Fatigué), récupération Whoop = 28 % (rouge), séance planifiée = intervalles seuil 3×10 min.
>
> **Message envoyé :** _"Est-ce que je peux faire ma séance d'aujourd'hui ?"_
>
> **Réponse attendue du Coach :** > _"Ton TSB est à **-25** et ta récupération Whoop n'est qu'à **28 %** — ton organisme accuse une fatigue importante. Tes intervalles seuil (3×10 min à ~250 W) risquent de creuser encore la dette. Je te propose de remplacer par une sortie endurance de 1 h à 65 % FTP (~170 W) pour maintenir le volume sans aggraver la charge. On réévaluera demain avec tes nouvelles données de récupération."_

---

### US-24 : Adaptation du vocabulaire par sport

_En tant qu'_ **Athlète**,
_je veux_ que le Coach IA utilise le vocabulaire et les métriques spécifiques à mon sport,
_afin de_ recevoir des conseils immédiatement compréhensibles et directement applicables à ma discipline.

**Critères d'acceptation :**

- Étant donné que j'ai renseigné mon sport principal avec ses données physiologiques,
  quand je demande conseil sur l'intensité d'une séance,
  alors la réponse utilise les unités, les zones et le vocabulaire propres à ce sport.

- Étant donné que je pratique plusieurs sports,
  quand je demande un conseil global d'entraînement,
  alors la réponse intègre les disciplines concernées et utilise le vocabulaire propre à chacune selon le contexte de la question.

- Étant donné qu'aucun paramètre physiologique n'est renseigné pour mon sport,
  quand je reçois une réponse sur l'intensité,
  alors le Coach adapte son discours en termes d'effort perçu (RPE) plutôt qu'en données chiffrées, et invite à renseigner les paramètres manquants.

**Exemple concret :**

> **Profil :** Coureur à pied, VMA 16 km/h.
>
> **Message envoyé :** _"À quelle intensité faire ma séance de seuil demain ?"_
>
> **Réponse attendue du Coach :** > _"Pour ta séance de seuil, vise une allure de **4'45/km à 4'30/km** — soit environ **85-88 % de ta VMA**. Ça te place en zone seuil. Prévois 3×10 min avec 2 min de récupération en trottant à 6'00/km (endurance fondamentale)."_

---

### US-25 : Persistance et gestion des sessions de chat

_En tant qu'_ **Athlète**,
_je veux_ retrouver mes conversations passées et en créer de nouvelles,
_afin de_ suivre l'évolution de mes échanges dans le temps et contextualiser mes demandes futures.

**Critères d'acceptation :**

- Étant donné que j'envoie mon premier message sans session active,
  quand le message est envoyé,
  alors une nouvelle session est créée automatiquement dans `chat_sessions` avec le titre auto-généré sur les 50 premiers caractères du message.

- Étant donné que j'ai plusieurs sessions passées,
  quand j'ouvre `/chat`,
  alors les 20 dernières sessions sont listées dans un panneau latéral, triées par date de dernière activité.

- Étant donné qu'une session contient plus de 20 messages,
  quand j'envoie un nouveau message,
  alors seuls les 20 derniers messages sont envoyés au LLM comme historique, mais la totalité reste visible dans l'UI.

- Étant donné que je clique sur "Archiver" sur une session,
  quand l'action est confirmée,
  alors la session passe au statut `is_archived = true` et disparaît de la liste principale sans être supprimée.

---

### US-26 : Alertes proactives à l'ouverture du chat

_En tant qu'_ **Athlète**,
_je veux_ recevoir automatiquement des alertes pertinentes dès l'ouverture du chat si mes données le justifient,
_afin de_ être informé proactivement des risques ou opportunités sans avoir à poser la question.

**Critères d'acceptation :**

- Étant donné que mes données de récupération et/ou de charge indiquent un risque (récupération basse + séance intense, TSB critique, sommeil insuffisant),
  quand j'ouvre `/chat`,
  alors une alerte contextuelle s'affiche automatiquement avec les valeurs concrètes et une proposition d'action.

- Étant donné que j'ai un objectif de priorité A à une échéance proche,
  quand j'ouvre `/chat`,
  alors le Coach affiche un message de compte à rebours avec des conseils adaptés à la phase de préparation.

- Étant donné qu'une source de données n'est pas connectée (ex : Whoop),
  quand j'ouvre `/chat`,
  alors aucune alerte liée à cette source n'est générée et le Coach fonctionne avec les données disponibles.

**Exemple concret :**

> **Données du jour :** Récupération Whoop = 22 % (rouge), séance planifiée = intervalles VO2max 5×3 min, objectif "Marathon de Paris" dans 3 jours.
>
> **Alertes affichées à l'ouverture du chat :**
>
> - _"⚠️ Alerte Récupération : ton score est à 22 % et tu as une séance VO2max prévue. Souhaites-tu qu'on adapte ?"_
> - _"🎯 Marathon de Paris : J-3 ! Tu entres dans la phase de tapering — privilégie le repos et l'activation légère."_

---

### US-27 : Génération d'un plan d'entraînement personnalisé

_En tant qu'_ **Athlète**,
_je veux_ demander au Coach IA de générer un plan d'entraînement sur plusieurs semaines,
_afin de_ obtenir un programme structuré adapté à mon objectif, mon niveau et ma charge actuelle.

**Critères d'acceptation :**

- Étant donné que j'envoie une demande de plan,
  quand l'intention est détectée automatiquement sans devoir activer une option,
  alors le Coach génère un plan structuré par semaine et par jour demandé par l'utilisateur, avec pour chaque séance : sport, durée, intensité et description.

- Étant donné que le plan est généré avec succès,
  quand la réponse s'affiche,
  alors le plan est rendu sous forme d'un widget interactif dans le chat avec un bouton "Accepter ce plan".

- Étant donné que je clique sur "Accepter ce plan",
  quand la confirmation est reçue,
  alors chaque séance est créée avec le statut `planned` aux bonnes dates et apparaît dans `/calendar`.

- Étant donné que je clique sur "Adapter" sur le widget de plan,
  quand ma demande de modification est envoyée,
  alors le Coach génère un nouveau plan tenant compte de mes contraintes exprimées et le widget est remplacé par la nouvelle proposition.

- Étant donné que je clique sur "Refuser" sur le widget de plan,
  quand l'action est confirmée,
  alors le widget disparaît et le champ de saisie est pré-rempli pour inviter à reformuler la demande.

- Étant donné que le Coach ne parvient pas à générer un plan valide,
  quand la génération échoue,
  alors un message de fallback s'affiche et aucune donnée n'est écrite en base.

**Exemple concret :**

> **Profil :** Triathlète, objectif "Ironman 70.3" dans 8 semaines, CTL = 55, TSB = -8.
>
> **Message envoyé :** _"Génère-moi un plan de 3 semaines pour préparer mon 70.3."_
>
> **Widget affiché dans le chat :**
>
> - **Semaine 1 — Charge progressive** : Lundi repos · Mardi course 1h seuil · Mercredi natation 3×400m CSS · Jeudi vélo 2h endurance · Vendredi repos · Samedi brique vélo/course 2h30 · Dimanche natation 1h
> - **Semaine 2 — Charge haute** : …
> - **Semaine 3 — Tapering** : …
>
> L'athlète clique sur "Accepter ce plan" → les 21 séances apparaissent dans le calendrier avec le statut `planned`.

---

### US-28 : Adaptation dynamique du planning existant

_En tant qu'_ **Athlète**,
_je veux_ demander au Coach IA de modifier des séances de mon planning en cours,
_afin de_ ajuster mon programme en fonction d'imprévus (fatigue, météo, blessure légère) sans recréer un plan complet.

**Critères d'acceptation :**

- Étant donné que j'exprime un besoin d'adaptation (fatigue, imprévu, météo…),
  quand l'intention est détectée automatiquement,
  alors le Coach propose une modification concrète et explicite tenant compte du TSB actuel et des séances restantes.

- Étant donné que le Coach a proposé une adaptation et que je l'accepte,
  quand la confirmation est reçue,
  alors la séance concernée est mise à jour en base et le calendrier est rafraîchi.

- Étant donné que je demande de modifier une séance dont la date est passée,
  quand l'IA analyse la demande,
  alors le Coach répond qu'il ne peut pas modifier des séances passées et propose d'adapter les séances futures.

**Exemple concret :**

> **Données du jour :** TSB = -22, séances restantes cette semaine : mercredi seuil 1h, vendredi sortie longue 2h.
>
> **Message envoyé :** _"Je me sens vraiment à plat, je n'ai pas la tête à une séance intense."_
>
> **Réponse du Coach :** > _"Ton TSB est à -22 — tu accumules de la fatigue. Je te propose de remplacer ta séance seuil de mercredi par 45 min d'endurance fondamentale, et de réduire ta sortie longue de vendredi à 1h15. Ça préserve le volume sans creuser davantage."_
>
> L'athlète répond "Ok" → les deux séances sont mises à jour dans le calendrier.

---

### US-29 : Respect des limites médicales du Coach IA

_En tant qu'_ **Athlète**,
_je veux_ que le Coach IA reste dans son rôle de coach sportif et ne produise aucun diagnostic médical,
_afin de_ ne pas être induit en erreur sur des questions de santé nécessitant un professionnel.

**Critères d'acceptation :**

- Étant donné que j'exprime un symptôme bénin lié à l'effort (courbatures, fatigue musculaire),
  quand la réponse est générée,
  alors le Coach donne des conseils de récupération pratiques sans évoquer de pathologie ni recommander de consultation médicale.

- Étant donné que j'exprime un symptôme potentiellement grave (douleur thoracique, malaise à l'effort),
  quand la réponse est générée,
  alors le Coach ne propose aucun conseil d'entraînement et recommande explicitement une consultation médicale avant tout retour à l'effort.

- Étant donné que je demande un conseil sur des médicaments ou des substances,
  quand la réponse est générée,
  alors le Coach décline la demande et redirige vers des stratégies de récupération naturelles.

- Étant donné que je mentionne un diagnostic médical établi,
  quand la réponse est générée,
  alors le Coach respecte le cadre posé par le médecin et propose uniquement des activités compatibles avec ce diagnostic.

- Étant donné que j'exprime une gêne ou inconfort mineur,
  quand la réponse est générée,
  alors le Coach propose des adaptations concrètes sans rediriger vers un médecin, et ne recommande une consultation que si la gêne persiste, s'aggrave ou présente des signes d'alerte.

**Exemple concret :**

> **Message envoyé :** _"J'ai une douleur dans la poitrine quand je cours depuis hier soir."_
>
> **Réponse du Coach :** > _"Ce type de douleur thoracique à l'effort ne doit pas être pris à la légère. Je te déconseille fortement de t'entraîner aujourd'hui et je t'encourage à consulter un médecin avant tout retour à l'effort — même léger. Ce n'est pas de mon ressort de te conseiller sur ce symptôme."_

---

### US-30 : Construction et injection du contexte JSON

_En tant qu'_ **Athlète**,
_je veux_ que chaque réponse du Coach IA soit basée sur un contexte fraîchement construit à partir de mes données réelles,
_afin de_ recevoir des conseils précis et à jour reflétant mon état physiologique et mon planning au moment de la conversation.

**Critères d'acceptation :**

- Étant donné que j'envoie un message,
  quand le contexte est construit,
  alors il contient : date et heure actuelles, profil athlète (sports, seuils physiologiques, objectif principal), statut physiologique du jour (récupération, sommeil, HRV), métriques de charge (CTL, ATL, TSB) et planning (séance du jour + prochaines séances).

- Étant donné qu'une source de données n'est pas connectée,
  quand le contexte est construit,
  alors les champs correspondants sont absents ou nuls et le Coach adapte ses conseils en conséquence sans générer d'erreur.

- Étant donné que je modifie mon profil (sport, seuils, objectif),
  quand le prochain message est envoyé,
  alors le contexte reflète immédiatement les nouvelles données et le Coach ajuste ses conseils dès la réponse suivante.

**Exemple concret :**

> **Contexte injecté à 7h43 un mardi :**
> profil : coureur, VMA 16 km/h, objectif "Semi de Lyon" dans 18 jours · récupération Whoop : 61 %, sommeil 7h12 · CTL 48 / ATL 55 / TSB -7 · séance du jour : tempo 45 min
>
> **Message envoyé :** _"Comment aborder ma séance de ce matin ?"_
>
> **Réponse du Coach :** basée sur ces données exactes — il mentionne le TSB, la récupération, l'objectif proche et adapte ses conseils à la séance tempo prévue.

---

### US-31 : Analyse de l'évolution des métriques de récupération

_En tant qu'_ **Athlète**,
_je veux_ demander au Coach IA d'analyser l'évolution de mes métriques de récupération sur une période,
_afin de_ comprendre les causes d'une fatigue persistante ou d'une baisse de performance.

**Critères d'acceptation :**

- Étant donné que j'ai suffisamment de données de récupération en base,
  quand je demande une analyse de tendance,
  alors le Coach décrit l'évolution avec les valeurs numériques réelles et fournit une interprétation physiologique.

- Étant donné que les données disponibles sont insuffisantes pour établir une tendance fiable,
  quand je demande une analyse,
  alors le Coach l'indique clairement et suggère d'attendre davantage de données.

- Étant donné que mes données révèlent un pattern de fatigue (ex : HRV en baisse + FC repos en hausse),
  quand je demande une analyse,
  alors le Coach identifie le signal, en explique l'interprétation physiologique et recommande un ajustement de charge, sans diagnostic médical.

**Exemple concret :**

> **Données des 7 derniers jours :** HRV : 68 → 64 → 61 → 58 → 55 ms (tendance baisse), FC repos : 48 → 49 → 51 → 52 → 53 bpm (tendance hausse).
>
> **Message envoyé :** _"Comment évolue ma récupération cette semaine ?"_
>
> **Réponse du Coach :** > _"Ton HRV a chuté de 68 à 55 ms en 5 jours, pendant que ta FC de repos remontait de 48 à 53 bpm. C'est un signal classique de fatigue systémique accumulée. Je te recommande de réduire ton volume de 30 % cette semaine et de privilégier les séances d'endurance fondamentale."_

---

### US-32 : Intégration de la météo dans les conseils

_En tant qu'_ **Athlète**,
_je veux_ que le Coach IA prenne en compte les conditions météo de ma localisation dans ses conseils,
_afin de_ recevoir des recommandations adaptées aux conditions réelles d'entraînement extérieur.

**Critères d'acceptation :**

- Étant donné que ma localisation est renseignée et que les conditions météo sont défavorables pour une séance extérieure,
  quand j'ouvre le chat avec une séance planifiée,
  alors une alerte météo s'affiche avec une alternative indoor de durée et d'intensité équivalentes.

- Étant donné que les conditions météo sont favorables,
  quand le Coach conseille sur la séance du jour,
  alors aucune alerte météo n'est générée et les conditions peuvent être mentionnées positivement si pertinent.

- Étant donné que ma localisation n'est pas disponible,
  quand le contexte est construit,
  alors aucun conseil météo n'est généré et le Coach fonctionne sans cette donnée.

**Exemple concret :**

> **Données du jour :** Localisation Grenoble, prévision : pluie verglaçante + vent 60 km/h. Séance planifiée : sortie vélo 2h endurance.
>
> **Alerte affichée à l'ouverture du chat :** > _"🌬️ Conditions extérieures dangereuses aujourd'hui (vent 60 km/h, verglas). Ta sortie vélo est déconseillée. Je te propose 2h sur home trainer à la même intensité (65 % FTP)."_

---

### US-33 : Message de bienvenue personnalisé au premier lancement

_En tant que_ **nouvel Athlète** ayant terminé l'onboarding,
_je veux_ recevoir un message de bienvenue personnalisé du Coach IA à ma première connexion,
_afin de_ comprendre immédiatement la valeur de l'application et savoir comment démarrer.

**Critères d'acceptation :**

- Étant donné que c'est ma première ouverture du chat après l'onboarding,
  quand j'accède au chat,
  alors un message de bienvenue s'affiche automatiquement, personnalisé avec mon prénom, mon sport et une première recommandation basée sur mon profil.

- Étant donné que j'ai renseigné un objectif lors de l'onboarding,
  quand le message de bienvenue est généré,
  alors il fait référence à cet objectif et au nombre de jours restants.

- Étant donné que j'ai déjà ouvert le chat au moins une fois,
  quand j'ouvre à nouveau le chat,
  alors aucun message de bienvenue automatique ne s'affiche et le fil de la dernière session est restauré.

**Exemple concret :**

> **Profil :** Thomas, nageur, CSS 1'25/100m, objectif "Championnat régional" dans 42 jours.
>
> **Message de bienvenue affiché :** > _"Bienvenue Thomas ! Je suis ton Coach IA. Tu prépares le Championnat régional dans 42 jours — on a du travail devant nous. Pour commencer, dis-moi comment tu te sens aujourd'hui ou pose-moi ta première question sur ta préparation."_

---

### US-34 : Renommage et suppression d'une session de chat

_En tant qu'_ **Athlète**,
_je veux_ renommer ou supprimer une session de chat,
_afin de_ organiser mon historique de conversations et supprimer les échanges obsolètes.

**Critères d'acceptation :**

- Étant donné que je clique sur "Renommer" sur une session,
  quand je saisis un nouveau titre et valide,
  alors le titre est mis à jour en base via `PATCH /api/chat` et le nouveau nom s'affiche immédiatement dans la liste.

- Étant donné que je clique sur "Supprimer" sur une session,
  quand je confirme dans la modale,
  alors les messages de la session sont supprimés puis la session est supprimée via `DELETE /api/chat`, et la liste est mise à jour sans rechargement.

- Étant donné que je tente de supprimer la session active (celle ouverte en ce moment),
  quand je confirme la suppression,
  alors la session est supprimée, je suis redirigé vers une nouvelle session vide et un message indique _"Conversation supprimée"_.

---

## Récapitulatif

| US    | Titre                                       | EPIC    |
| ----- | ------------------------------------------- | ------- |
| US-01 | Inscription par e-mail                      | EPIC-01 |
| US-02 | Connexion et persistance de session         | EPIC-01 |
| US-03 | Réinitialisation du mot de passe            | EPIC-01 |
| US-04 | Onboarding — Profil sportif initial         | EPIC-01 |
| US-05 | Modification du profil sportif              | EPIC-01 |
| US-06 | Création d'un objectif sportif              | EPIC-02 |
| US-07 | Visualisation et suivi des objectifs        | EPIC-02 |
| US-08 | Modification et suppression d'un objectif   | EPIC-02 |
| US-09 | Connexion Strava via OAuth                  | EPIC-03 |
| US-10 | Connexion Whoop via OAuth                   | EPIC-03 |
| US-11 | Synchronisation manuelle                    | EPIC-03 |
| US-12 | Déconnexion d'une intégration               | EPIC-03 |
| US-13 | Calcul et affichage CTL / ATL / TSB         | EPIC-04 |
| US-14 | Calcul du TSS par activité                  | EPIC-04 |
| US-15 | Historique des activités                    | EPIC-04 |
| US-16 | Alertes de surcharge                        | EPIC-04 |
| US-17 | Résumé hebdomadaire                         | EPIC-04 |
| US-18 | Visualisation du calendrier                 | EPIC-05 |
| US-19 | Création manuelle d'une séance planifiée    | EPIC-05 |
| US-20 | Saisie manuelle d'une activité réalisée     | EPIC-05 |
| US-21 | Marquage séance accomplie                   | EPIC-05 |
| US-22 | Marquage séance manquée                     | EPIC-05 |
| US-23 | Conversation contextuelle avec le Coach IA  | EPIC-06 |
| US-24 | Adaptation du vocabulaire par sport         | EPIC-06 |
| US-25 | Persistance des sessions de chat            | EPIC-06 |
| US-26 | Alertes proactives à l'ouverture du chat    | EPIC-06 |
| US-27 | Génération d'un plan d'entraînement         | EPIC-06 |
| US-28 | Adaptation dynamique du planning            | EPIC-06 |
| US-29 | Respect des limites médicales               | EPIC-06 |
| US-30 | Construction et injection du contexte JSON  | EPIC-06 |
| US-31 | Analyse des métriques de récupération       | EPIC-06 |
| US-32 | Intégration de la météo dans les conseils   | EPIC-06 |
| US-33 | Message de bienvenue personnalisé           | EPIC-06 |
| US-34 | Renommage et suppression de session de chat | EPIC-06 |
