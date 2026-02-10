# Plan v2 - Météo dynamique + intégration UI

## Problèmes actuels

1. **Localisation figée** : Le hook `useGeolocation` ne met à jour la position que tous les **7 jours** (localStorage TTL). Si l'utilisateur se déplace de Fribourg à Bulle, il garde l'ancienne météo pendant une semaine.
2. **Météo séparée du planning** : La météo est affichée dans un bloc indépendant au-dessus du calendrier, sans lien visuel avec les jours d'entraînement. On ne voit pas d'un coup d'oeil quel jour a quelle météo.
3. **Logs de debug** encore présents dans `weather-forecast.tsx` et `weather.ts`.

---

## Partie A - Localisation dynamique

### A.1 Modifier `src/lib/hooks/useGeolocation.ts`

**Problème** : TTL de 7 jours trop long + ne compare pas si la position a changé.

**Nouvelle logique** :
- Réduire le TTL à **1 heure** (pas besoin de re-demander la position à chaque navigation)
- Stocker les **coordonnées** en plus du timestamp dans localStorage
- Comparer la nouvelle position avec l'ancienne : si l'écart est > 5 km (~0.05° de latitude), envoyer la mise à jour au serveur même si le TTL n'est pas expiré
- Conserver l'échec silencieux

**Changements concrets** :

```typescript
const LOCATION_STORAGE_KEY = "cyt_location";
const LOCATION_TTL_MS = 60 * 60 * 1000; // 1 heure
const SIGNIFICANT_DISTANCE_DEG = 0.05; // ~5 km
```

Remplacer le contenu du `useEffect` :
1. Lire `localStorage.getItem(LOCATION_STORAGE_KEY)` → parser le JSON `{ lat, lon, ts }`
2. Si `ts` existe et `Date.now() - ts < LOCATION_TTL_MS` → ne rien faire (return)
3. Sinon, appeler `navigator.geolocation.getCurrentPosition()`
4. En cas de succès :
   - Comparer `newLat/newLon` avec `storedLat/storedLon`
   - Si écart > `SIGNIFICANT_DISTANCE_DEG` OU si pas de position stockée → POST `/api/location`
   - Stocker `{ lat: newLat, lon: newLon, ts: Date.now() }` dans localStorage

### A.2 Modifier `src/app/api/location/route.ts`

Pas de changement nécessaire. L'endpoint accepte déjà latitude/longitude et met à jour la DB.

### A.3 Invalider le cache météo quand la position change

**Modifier `src/app/api/location/route.ts`** :

Après la mise à jour de la position dans `users`, ajouter :
```typescript
// Supprimer le cache météo de l'ancienne position
// (le nouveau fetch recréera le cache avec les nouvelles coordonnées)
await supabase
  .from("weather_cache")
  .delete()
  .eq("latitude", roundCoord(latitude))
  .eq("longitude", roundCoord(longitude));
```

Pas nécessaire d'importer `roundCoord` : dupliquer la logique d'arrondi à 2 décimales inline (une seule ligne, `Math.round(v * 100) / 100`).

---

## Partie B - Météo intégrée aux jours du calendrier

### Objectif

Au lieu d'un bloc météo séparé en haut de la page, afficher une **petite icône météo + température directement sur chaque jour** du calendrier et du week-calendar. L'utilisateur voit d'un coup d'oeil la météo de chaque jour à côté de ses séances.

### B.1 Supprimer le composant `WeatherForecast` standalone

**Supprimer** les imports et appels de `<WeatherForecast />` dans :
- `src/app/(dashboard)/calendar/page.tsx` (ligne 614 : `<WeatherForecast />`)
- `src/components/dashboard/week-calendar.tsx` (ligne 77 : `<WeatherForecast compact={true} />` + le fragment `<>...</>`)

**Ne pas supprimer** le fichier `src/components/weather/weather-forecast.tsx` tout de suite — on le remplacera par un composant plus petit.

### B.2 Créer `src/components/weather/weather-day-badge.tsx`

Petit composant inline qui affiche l'icône Lucide + la température pour un jour donné.

**Props** :
```typescript
interface WeatherDayBadgeProps {
  iconCode: string;
  tempMax: number;
  tempMin?: number;
  precipMm?: number;
  compact?: boolean; // true = icône seule + temp, false = + description
}
```

**Rendu compact** (pour grille calendrier mois) :
```tsx
<div className="flex items-center gap-1 text-xs text-muted">
  <WeatherIcon code={iconCode} className="h-3.5 w-3.5" />
  <span>{tempMax}°</span>
</div>
```

**Rendu normal** (pour vue semaine) :
```tsx
<div className="flex items-center gap-1.5 text-xs text-muted">
  <WeatherIcon code={iconCode} className="h-4 w-4" />
  <span>{tempMax}° / {tempMin}°</span>
  {precipMm > 0 && <span className="text-blue-400">{precipMm}mm</span>}
</div>
```

### B.3 Extraire `getWeatherIcon` dans un composant réutilisable

**Créer `src/components/weather/weather-icon.tsx`** :

Composant qui prend `code` (code icône OWM) et retourne l'icône Lucide correspondante.

```typescript
interface WeatherIconProps {
  code: string;
  className?: string;
}
```

Mapping :
| OWM code | Lucide | Couleur |
|----------|--------|---------|
| 01d | `Sun` | `text-yellow-400` |
| 01n | `Moon` | `text-gray-400` |
| 02d, 02n | `CloudSun` | `text-gray-300` |
| 03d, 03n, 04d, 04n | `Cloud` | `text-gray-400` |
| 09d, 09n, 10d, 10n | `CloudRain` | `text-blue-400` |
| 11d, 11n | `CloudLightning` | `text-purple-400` |
| 13d, 13n | `CloudSnow` | `text-blue-200` |
| 50d, 50n | `CloudFog` | `text-gray-400` |

Utiliser `Moon` et `CloudSun` de Lucide en plus des icônes actuelles.

### B.4 Créer un hook `useWeatherForecast`

**Créer `src/lib/hooks/useWeatherForecast.ts`** :

Hook qui fetch `/api/weather` une seule fois et retourne un `Map<string, ForecastDay>` indexé par date (YYYY-MM-DD) pour un lookup rapide.

```typescript
export function useWeatherForecast() {
  const [forecastMap, setForecastMap] = useState<Map<string, ForecastDay> | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const map = new Map();
          for (const day of data.forecast) {
            map.set(day.date, day);
          }
          setForecastMap(map);
          setCurrentWeather(data.current);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { forecastMap, currentWeather, loading };
}
```

### B.5 Intégrer dans le week-calendar du Dashboard

**Modifier `src/components/dashboard/week-calendar.tsx`** :

1. Supprimer l'import et l'appel de `<WeatherForecast compact={true} />`, revenir à un simple `<Card>` sans fragment
2. Ajouter le hook `useWeatherForecast` dans le composant
3. Dans la boucle `weekData.map((day) => ...)`, après le numéro du jour (ligne 176 `{day.dayNumber}`), ajouter :

```tsx
{(() => {
  const dateStr = day.date.toISOString().split("T")[0];
  const forecast = forecastMap?.get(dateStr);
  if (!forecast) return null;
  return <WeatherDayBadge iconCode={forecast.icon} tempMax={forecast.temp_max_c} />;
})()}
```

Emplacement exact : après la ligne `{day.dayNumber}` (ligne 176), dans le `<div className="text-center mb-2">`.

### B.6 Intégrer dans le calendrier (vue mois)

**Modifier `src/app/(dashboard)/calendar/page.tsx`** :

1. Supprimer `<WeatherForecast />` (ligne 614) et son import
2. Ajouter le hook `useWeatherForecast` dans le composant principal
3. **Vue mois** : Dans la boucle des jours du mois (ligne 772), après l'affichage du numéro du jour (lignes 796-806), ajouter le badge météo :

```tsx
{(() => {
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const forecast = forecastMap?.get(dateStr);
  if (!forecast) return null;
  return <WeatherDayBadge iconCode={forecast.icon} tempMax={forecast.temp_max_c} compact />;
})()}
```

Emplacement : après la ligne 806 (`</div>` du numéro de jour), avant `{/* Objectifs badge */}`.

4. **Vue semaine** : Dans la boucle `weekDays.map((day) => ...)` (ligne 939), après le `dateStr` (ligne 963), ajouter le badge entre la date et le badge "Aujourd'hui" :

```tsx
{(() => {
  const isoDate = toLocalDateString(day.date);
  const forecast = forecastMap?.get(isoDate);
  if (!forecast) return null;
  return (
    <WeatherDayBadge
      iconCode={forecast.icon}
      tempMax={forecast.temp_max_c}
      tempMin={forecast.temp_min_c}
      precipMm={forecast.precipitation_mm}
    />
  );
})()}
```

Emplacement : dans le `<div className="flex items-center justify-between mb-2">` (ligne 960), ajouter entre le `<div>` de la date et le badge `{day.isToday && ...}`.

### B.7 Supprimer l'ancien composant

**Supprimer** `src/components/weather/weather-forecast.tsx` et `src/lib/weather-icons.ts` (remplacés par les nouveaux composants).

---

## Partie C - Nettoyage

### C.1 Supprimer les console.log de debug

**Fichier `src/lib/integrations/weather.ts`** :
- Supprimer les 3 `console.log("DEBUG: ...")` dans `fetchCurrentWeather` (ajoutés pour le debug de la clé API)

**Fichier `src/components/weather/weather-forecast.tsx`** :
- Ce fichier sera supprimé (partie B.7)

---

## Résumé des fichiers

| Action | Fichier | Quoi |
|--------|---------|------|
| MODIFIER | `src/lib/hooks/useGeolocation.ts` | TTL 1h, comparaison de distance, stockage coords |
| MODIFIER | `src/app/api/location/route.ts` | Invalidation cache météo au changement de position |
| CRÉER | `src/components/weather/weather-icon.tsx` | Composant icône Lucide par code OWM |
| CRÉER | `src/components/weather/weather-day-badge.tsx` | Badge jour (icône + temp) compact et normal |
| CRÉER | `src/lib/hooks/useWeatherForecast.ts` | Hook fetch météo avec Map par date |
| MODIFIER | `src/components/dashboard/week-calendar.tsx` | Supprimer WeatherForecast, ajouter badge inline par jour |
| MODIFIER | `src/app/(dashboard)/calendar/page.tsx` | Supprimer WeatherForecast, ajouter badge inline vue mois + semaine |
| SUPPRIMER | `src/components/weather/weather-forecast.tsx` | Remplacé par les badges inline |
| SUPPRIMER | `src/lib/weather-icons.ts` | Remplacé par `weather-icon.tsx` |
| MODIFIER | `src/lib/integrations/weather.ts` | Supprimer console.log de debug |

## Ordre d'implémentation

```
Partie C (nettoyage debug)
    ↓
Partie A (géolocalisation dynamique)
    ↓
Partie B.3 (WeatherIcon) + B.4 (hook useWeatherForecast)
    ↓
Partie B.2 (WeatherDayBadge)
    ↓
Partie B.5 (week-calendar) + B.6 (calendar) en parallèle
    ↓
Partie B.1 + B.7 (supprimer anciens fichiers)
    ↓
Build check
```

## Rendu visuel attendu

### Dashboard - Week Calendar
```
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│ lun │ │ mar │ │ mer │ │ jeu │ │ ven │ │ sam │ │ dim │
│ 10  │ │ 11  │ │ 12  │ │ 13  │ │ 14  │ │ 15  │ │ 16  │
│☀️ 8°│ │🌧 5°│ │☁ 6° │ │☀️ 9°│ │⛈ 4° │ │     │ │     │
│─────│ │─────│ │─────│ │─────│ │─────│ │     │ │     │
│Course│ │Vélo │ │Repos│ │Force│ │Course│ │     │ │     │
│Planif│ │Planif│ │     │ │Planif│ │Planif│ │     │ │     │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

### Calendrier - Vue mois (cellule)
```
┌────────────┐
│ 12         │
│ ☁ 6°      │
│ ◉ Course  │
│ ◉ Natation│
└────────────┘
```

L'icône météo est discrète (petite, grisée) et ne prend pas la place des séances.
La météo n'apparaît que pour les jours couverts par les prévisions OWM (5 jours max).
