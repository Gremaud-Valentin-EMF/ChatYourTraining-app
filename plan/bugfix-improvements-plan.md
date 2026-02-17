# Plan de corrections et améliorations v0.0.7+

## 1. Bouton suggestion chat - texte tronqué

**Fichier :** `src/app/(dashboard)/chat/page.tsx` (lignes 822-842)

**Problème :** Les boutons de suggestion rapide (quick actions) utilisent un layout `flex items-center gap-3` dans une Card de padding `sm` (p-4). Sur mobile (grid-cols-1), le texte du label (`text-sm font-medium`) peut manquer de place à cause de l'icône (h-10 w-10) et du chevron (h-4 w-4).

**Correction :**
- Ajouter `min-w-0` sur le `div.flex-1` contenant le texte pour permettre le text-wrap
- Ajouter `break-words` ou `whitespace-normal` sur le `<p>` du label
- Optionnel : réduire l'icône à `h-8 w-8` et le conteneur à `h-9 w-9` sur mobile
- Vérifier que `overflow-hidden` n'est pas présent sur le parent qui empêcherait le wrapping

---

## 2. Pop-up RPE + commentaire à la première visite d'une activité synchronisée

**Fichier principal :** `src/app/(dashboard)/workouts/[id]/page.tsx`

**Problème :** Quand un utilisateur clique pour la première fois sur une activité synchronisée (Strava), il n'y a pas d'invitation à remplir le RPE et un commentaire.

**Implémentation :**
1. **Détection "première visite"** : Ajouter une colonne `viewed_at` (timestamptz, nullable) dans la table `activities` via migration SQL. Quand `viewed_at` est null et que l'activité est `completed` et `source !== 'manual'` → afficher la pop-up.
2. **Modal RPE + Commentaire** :
   - Créer un composant `<RpeCommentModal>` (ou directement dans le page.tsx)
   - Contenu :
     - Slider RPE (1-10) — réutiliser le slider existant (lignes 1753-1786)
     - Textarea pour commentaire/notes (placeholder: "Comment s'est passée la séance ?")
     - Bouton "Enregistrer" et bouton "Plus tard" (ferme sans sauver)
   - Au clic "Enregistrer" : update `activities` avec `rpe`, `description` (ou `notes`), et `viewed_at = now()`
   - Au clic "Plus tard" : update uniquement `viewed_at = now()` pour ne plus réafficher
3. **Mise à jour `viewed_at`** : À chaque ouverture de la page, si `viewed_at` est null, marquer `viewed_at = now()` côté serveur
4. **UX** : La modal s'affiche automatiquement au chargement de la page (useEffect), seulement si `viewed_at === null && status === 'completed'`

**Migration SQL :**
```sql
ALTER TABLE activities ADD COLUMN viewed_at timestamptz;
```

---

## 3. Navigation retour : revenir à la page d'origine

**Fichiers :**
- `src/app/(dashboard)/workouts/[id]/page.tsx` (ligne 1186-1192)
- `src/app/(dashboard)/calendar/page.tsx` (ligne 1095)
- `src/components/dashboard/week-calendar.tsx` (ligne 201)

**Problème :** Le bouton "Retour" sur la page d'entraînement pointe en dur vers `/workouts` (Link href="/workouts"). Si l'utilisateur vient du calendrier ou du dashboard, il devrait revenir à cette page.

**Correction :**
- Remplacer le `<Link href="/workouts">` par un bouton utilisant `router.back()`
- Code : `<button onClick={() => router.back()} className="..."><ArrowLeft /> Retour</button>`
- Le `useRouter` est déjà importé dans le composant (ligne 737 utilise déjà `router.back()`)
- Supprimer l'import de `Link` de `next/link` s'il n'est plus utilisé ailleurs dans ce fichier

---

## 4. Météo : inclure le jour actuel lors de la première sync

**Fichier :** `src/lib/integrations/weather.ts` (lignes 175-230)

**Problème :** L'API OpenWeatherMap `/forecast` renvoie les prévisions à partir du moment de l'appel en tranches de 3h. Si l'appel se fait tard dans la journée, il n'y aura que quelques tranches pour "aujourd'hui", et `temp_min`/`temp_max` seront partielles. Pire, si le premier créneau tombe le lendemain (appel très tard), le jour actuel sera absent.

**Correction :**
- Dans `getWeatherContext()` (lignes 321-380), après avoir obtenu `current` et `forecast` :
  - Vérifier si `forecast[0].date` correspond à aujourd'hui (ISO date)
  - Si non (ou si les données du jour sont incomplètes) : créer une entrée ForecastDay pour aujourd'hui à partir des données `current` :
    ```typescript
    const todayStr = new Date().toISOString().split("T")[0];
    if (!forecast.find(f => f.date === todayStr)) {
      forecast.unshift({
        date: todayStr,
        temp_min_c: current.temperature_c,
        temp_max_c: current.temperature_c,
        feels_like_c: current.feels_like_c,
        description: current.description,
        icon: current.icon,
        // ... remplir les autres champs depuis current
      });
    }
    ```
  - Si le jour existe mais avec des données partielles : fusionner `current.temperature_c` dans `temp_min`/`temp_max` existants (prendre le min/max entre les deux)

---

## 5. Météo : préciser l'altitude pour la neige

**Fichier :** `src/lib/integrations/weather.ts` + `src/lib/openai/coach.ts`

**Problème :** Quand il y a de la neige, on ne sait pas à quelle altitude.

**Options (du plus simple au plus complet) :**

**Option A — Mentionner l'altitude de la station météo (simple) :**
- L'API OWM ne renvoie pas directement l'altitude de la station, mais on peut l'estimer via les coordonnées utilisateur
- Ajouter un champ `altitude` dans la table `users` (rempli lors de l'onboarding ou manuellement)
- Dans le ground_assessment : "Neige au sol probable (à ~{altitude}m)"

**Option B — Ajouter l'altitude utilisateur dans le contexte météo :**
- Modifier `WeatherContext` pour inclure `location.altitude_m`
- Récupérer l'altitude depuis les coordonnées utilisateur via API externe (par ex. Open-Elevation API) ou via un champ user
- Ajuster le `ground_assessment` : "Neige au sol probable à {altitude}m et au-dessus"
- Dans `coach.ts` (lignes 643-648), enrichir le message neige avec l'altitude

**Recommandation :** Option A — ajouter une colonne `altitude` dans `users`, la remplir dans les settings utilisateur, et l'utiliser dans l'assessment.

**Migration SQL :**
```sql
ALTER TABLE users ADD COLUMN altitude integer;
```

---

## 6. Dashboard : afficher tous les entraînements du jour

**Fichiers :**
- `src/app/(dashboard)/dashboard/page.tsx` (lignes 310-327)
- `src/components/dashboard/today-workout.tsx`

**Problème :** Le code `todayActivity = activities?.find(...)` ne prend que le premier entraînement trouvé par priorité de statut. Les autres sont ignorés.

**Correction :**
1. **dashboard/page.tsx** :
   - Remplacer la logique `find()` par un tri + passage du tableau complet
   - Au lieu de `todayActivity` (objet unique), passer `todayActivities` (tableau)
   - Mapper chaque activité comme avant pour créer les props

2. **today-workout.tsx** :
   - Modifier les props pour accepter `workouts: WorkoutProps[]` (tableau) au lieu de `workout: WorkoutProps | null`
   - Rendre la liste de cards : `workouts.map(w => <Card key={w.id}>...</Card>)`
   - Gérer le cas vide (aucun entraînement) comme avant
   - Si un seul entraînement, le design ne change pas
   - Limiter l'affichage à 3-4 entraînements max avec un lien "Voir tout" vers `/workouts`

---

## 7. Page entraînement : header responsive (colonnes sur mobile)

**Fichier :** `src/app/(dashboard)/workouts/[id]/page.tsx` (lignes 1196-1260)

**Problème :** Le header avec le titre, les badges de statut/source, le sport et l'objectif de séance sont en layout horizontal (`flex-row`), ce qui déborde sur mobile.

**Correction :**
- Ligne 1197 : `<div className="flex items-start gap-4">` → réduire le gap et rendre l'icône sport plus petite sur mobile
  - Icône sport : `h-12 w-12 sm:h-16 sm:w-16` au lieu de `h-16 w-16`
- Ligne 1208 : `<div className="flex flex-row items-center gap-3">` (titre + badges) → passer en `flex-col items-start sm:flex-row sm:items-center gap-2`
  - Le titre passe au-dessus des badges sur mobile
  - Les badges se mettent en dessous du titre
- Ligne 1254 : `<div className="flex flex-wrap items-center gap-2">` (objectif) → ok tel quel grâce à `flex-wrap`
- Ligne 1234 : taille titre `text-2xl sm:text-3xl` → déjà responsive, ok

---

## 8. Page entraînement : modifier le sport

**Fichier :** `src/app/(dashboard)/workouts/[id]/page.tsx`

**Problème :** On peut modifier l'objectif de séance (intensité) mais pas le sport.

**Implémentation :**
1. **Charger les sports** : Ajouter un fetch des sports disponibles (`user_sports` jointé avec `sports`) au chargement de la page
2. **Ajouter `sport_id` dans `editForm`** : Inclure `sport_id: activity.sport_id` dans l'état d'édition
3. **UI** : Sur la ligne 1251-1252 (`<p>{activity.sport_label}</p>`), ajouter un dropdown inline en mode édition (même pattern que l'intensité lignes 1259-1307)
   - Afficher les sports de l'utilisateur dans le dropdown
   - Chaque option = icône sport + nom français
4. **Sauvegarde** : Dans `handleSaveEdit()`, inclure `sport_id` dans le payload d'update
5. **Après sauvegarde** : Rafraîchir les données affichées (sport_label, icône, couleur)

---

## 9. Objectifs : pouvoir modifier et supprimer

**Fichier :** `src/app/(dashboard)/objectives/page.tsx`

**État actuel :** Le CRUD est déjà implémenté :
- **Create** : lignes 141-145, modal lignes 356-418
- **Update** : lignes 147-158, 176-181 (réutilise le même modal)
- **Delete** : lignes 197-217, modal de confirmation lignes 421-431

**Vérification nécessaire :**
- Vérifier que les boutons "Modifier" et "Supprimer" sont bien visibles dans la liste des objectifs (lignes 277-352)
- S'assurer que les boutons sont accessibles (pas masqués par overflow ou taille)
- Si les boutons existent déjà mais sont peu visibles → améliorer le design (icônes Pencil/Trash, plus gros, meilleur contraste)
- Tester le flow complet : cliquer modifier → modal pré-rempli → sauvegarder → liste rafraîchie

---

## 10. Météo : afficher temp min et max de la journée

**Fichiers :**
- `src/components/weather/weather-day-badge.tsx`
- `src/components/dashboard/week-calendar.tsx` (lignes 185-188)

**État actuel :** Le composant `WeatherDayBadge` accepte déjà `tempMin` en prop (ligne 6) et l'affiche quand fourni (ligne 32). Mais le week-calendar ne passe que `tempMax`.

**Correction :**
- Dans `week-calendar.tsx` ligne 187, ajouter la prop `tempMin` :
  ```tsx
  <WeatherDayBadge
    iconCode={dayForecast.icon}
    tempMax={dayForecast.temp_max_c}
    tempMin={dayForecast.temp_min_c}  // AJOUTER
    compact
  />
  ```
- Si la version `compact` n'affiche pas tempMin (ligne 22), modifier le rendu compact pour l'inclure :
  ```tsx
  <span>{Math.round(tempMax)}° / {Math.round(tempMin)}°</span>
  ```
- Vérifier aussi le dashboard et tout autre endroit où WeatherDayBadge est utilisé

---

## 11. Barre de navigation : resserrer les icônes

**Fichier :** `src/app/(dashboard)/layout.tsx` (lignes 233-256)

**Problème :** Les icônes dépassent dans les coins sur certains téléphones.

**État actuel :** Chaque nav item a `p-3 flex-1 flex-shrink-0` + le conteneur a `gap-1 px-1`.

**Correction :**
- Réduire le padding des items : `p-3` → `p-2` ou `px-2 py-2.5`
- Le conteneur nav : `px-1` → `px-2` pour un peu plus de marge aux bords
- Optionnel : retirer `flex-shrink-0` sur les items pour permettre la compression
- Les icônes `h-6 w-6` sont ok, c'est le padding qui cause le débordement
- Tester sur viewport 320px (iPhone SE) pour vérifier

---

## 12. Input date trop large lors de la création

**Fichier :** `src/app/(dashboard)/workouts/page.tsx` (lignes 978-985)

**Problème :** L'input date dans le modal de création est plus large que les autres inputs sur mobile.

**Correction :**
- L'input date a déjà `className="w-full"` (ligne 981) et est dans un grid `grid-cols-1 sm:grid-cols-2`
- Le problème est probablement lié au style natif du `type="date"` sur mobile (Safari/Chrome ajoute des padding internes)
- Ajouter un style CSS pour normaliser : `appearance-none` ou `max-w-full`
- S'assurer que le composant `<Input>` applique `w-full box-border` de base
- Vérifier si `<Input type="date">` n'a pas un `min-width` implicite dans le composant UI

---

## 13. Scroll bloqué pour les options d'intensité dans la création

**Fichier :** `src/app/(dashboard)/workouts/page.tsx` (lignes 1021-1028)

**Problème :** Le Select d'intensité est en bas du formulaire. Quand le dropdown s'ouvre vers le bas, les options sont hors de l'écran et on ne peut pas scroller.

**Correction :**
- **Option A** : Faire ouvrir le dropdown vers le haut quand il est proche du bas du modal (`dropup`)
  - Modifier le composant `Select` (`src/components/ui/select.tsx`) pour détecter la position et inverser
- **Option B** : Rendre le contenu du modal scrollable
  - Dans le `<Modal>` composant, ajouter `overflow-y-auto max-h-[80vh]` au contenu
  - Ou wrapper le contenu du modal dans un `div` avec `overflow-y-auto`
- **Option C (plus simple)** : Réorganiser le formulaire pour mettre l'intensité plus haut (avant durée/distance)

**Recommandation :** Option B — rendre le contenu du modal scrollable est la correction la plus pérenne.

---

## 14. Pas de description lors de la création

**Fichier :** `src/app/(dashboard)/workouts/page.tsx` (lignes 962-1046)

**Problème :** Le modal de création ne contient pas de champ description/notes.

**Correction :**
1. Ajouter `description: ""` dans l'état `newSession`
2. Ajouter un `<Textarea>` après le Select d'intensité (avant les boutons) :
   ```tsx
   <Textarea
     label="Description (optionnel)"
     placeholder="Notes sur le contenu de la séance..."
     value={newSession.description}
     onChange={(e) => setNewSession(prev => ({ ...prev, description: e.target.value }))}
     rows={3}
   />
   ```
3. Dans `handleCreateSession()`, inclure `description` dans le payload d'insert
4. Vérifier que la colonne `description` existe dans la table `activities` (elle existe déjà, utilisée sur la page de détail)

---

## 15. Données d'entraînement : colonnes prévu/réalisé côte à côte

**Fichier :** `src/app/(dashboard)/workouts/[id]/page.tsx` (lignes 1410-1421)

**Problème :** Quand l'activité n'est pas encore réalisée, les colonnes "Prévu" et "Réalisé" passent en colonne (`grid-cols-1`) au lieu de rester côte à côte.

**État actuel :** Ligne 1421 : `<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">`

**Correction :**
- Changer `grid-cols-1 sm:grid-cols-2` en `grid-cols-2` (toujours 2 colonnes)
- La colonne "Réalisé" affichera un tiret "—" ou "En attente" quand vide, ce qui est le comportement souhaité
- Ajuster les largeurs si nécessaire : `gap-4` → `gap-3` sur mobile

---

## 16. IA : prendre en compte la description de l'entraînement

**Fichier :** `src/lib/openai/coach.ts` (lignes 503-512)

**Problème :** Le mapping `recent_activities` n'inclut pas la `description` de l'activité.

**Correction :**
- Ligne 503-512 : Ajouter `description` dans le mapping :
  ```typescript
  recent_activities: activities.map((a: any) => ({
    date: a.scheduled_date,
    sport: a.sports?.name || "other",
    title: a.title,
    description: a.description || null,  // AJOUTER
    duration_minutes: a.actual_duration_minutes || a.planned_duration_minutes || 0,
    tss: a.tss || 0,
    rpe: a.rpe,
    status: a.status,
  })),
  ```
- Vérifier que le `select()` qui récupère les activités (lignes ~460-480) inclut bien `description` dans les champs sélectionnés
- Aussi ajouter `description` dans le `schedule_context.today.planned_workout` (lignes 520-525) et dans `upcoming` (lignes 529-534)

---

## 17. Pop-up fatigue quotidienne à la première connexion du jour

**Fichiers :**
- `src/app/(dashboard)/layout.tsx` (composant Layout principal)
- Nouveau composant : `src/components/dashboard/daily-fatigue-modal.tsx`

**Problème :** L'utilisateur n'est pas invité à remplir sa fatigue ressentie lors de sa première connexion quotidienne.

**Implémentation :**
1. **Détection "première visite du jour"** :
   - Dans le layout dashboard, au mount, vérifier si `daily_metrics` a une entrée pour aujourd'hui avec `fatigue_level` rempli
   - Si non → afficher le modal
   - Stocker aussi un flag en `localStorage` (`lastFatiguePrompt: "2026-02-15"`) pour éviter de refetcher à chaque navigation

2. **Composant `DailyFatigueModal`** :
   - Slider fatigue (1-10) avec labels visuels (ex: emojis ou texte "Très frais" → "Épuisé")
   - Optionnel : champ mood (1-5), stress (1-10), notes
   - Bouton "Enregistrer" : insert/update dans `daily_metrics` avec `source = 'manual'`
   - Bouton "Pas maintenant" : ferme le modal, stocke le flag localStorage pour ne pas redemander dans la session

3. **Intégration dans le layout** :
   - Ajouter `<DailyFatigueModal />` dans le layout dashboard (après le `<main>`)
   - Le composant gère son propre état d'affichage via useEffect + check Supabase + localStorage
   - Se ferme automatiquement après sauvegarde

4. **Réutilisation** : Les données sont les mêmes que celles de la page `/health` ("Ressenti du jour") → réutiliser la même logique `saveSubjectiveMetrics()`

---

## Ordre de priorité suggéré

| # | Tâche | Complexité | Impact |
|---|-------|-----------|--------|
| 3 | Navigation retour (router.back) | Faible | Fort |
| 15 | Colonnes prévu/réalisé côte à côte | Faible | Moyen |
| 7 | Header responsive | Faible | Moyen |
| 11 | Navbar resserrée | Faible | Moyen |
| 1 | Bouton suggestion chat | Faible | Moyen |
| 10 | Météo temp min/max | Faible | Moyen |
| 12 | Input date trop large | Faible | Faible |
| 14 | Description à la création | Faible | Moyen |
| 16 | IA + description | Faible | Fort |
| 6 | Dashboard multi-entraînements | Moyen | Fort |
| 13 | Scroll options intensité | Moyen | Moyen |
| 8 | Modifier le sport | Moyen | Moyen |
| 9 | Objectifs modifier/supprimer | Faible (vérif) | Moyen |
| 4 | Météo jour actuel | Moyen | Moyen |
| 2 | Pop-up RPE première visite | Moyen | Fort |
| 17 | Pop-up fatigue quotidienne | Moyen | Fort |
| 5 | Neige + altitude | Moyen | Faible |
