# Plan d'implémentation - Intégration Météo

## Vue d'ensemble

4 fichiers à créer, 4 fichiers à modifier, 1 migration SQL.

---

## Phase 1 - Base de données & Types

### 1.1 Migration SQL

**Créer** : `supabase/migrations/00007_add_weather_support.sql`

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS latitude double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz DEFAULT NULL;

CREATE TABLE IF NOT EXISTS weather_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  cache_type text NOT NULL CHECK (cache_type IN ('current', 'forecast')),
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_cache_lookup
  ON weather_cache (latitude, longitude, cache_type, expires_at);
```

### 1.2 Modifier `src/types/database.ts`

**A) Ajouter 3 champs à `users`** (Row ligne 37-46, Insert ligne 48-57, Update ligne 59-68) :

- `latitude: number | null` (Row) / `latitude?: number | null` (Insert/Update)
- `longitude: number | null` (Row) / `longitude?: number | null` (Insert/Update)
- `location_updated_at: string | null` (Row) / `location_updated_at?: string | null` (Insert/Update)

**B) Ajouter table `weather_cache`** après le bloc `training_load` (ligne 580), avant la fermeture de `Tables` :

```typescript
weather_cache: {
  Row: {
    id: string;
    latitude: number;
    longitude: number;
    cache_type: string;
    data: Json;
    fetched_at: string;
    expires_at: string;
    created_at: string;
  };
  Insert: {
    id?: string;
    latitude: number;
    longitude: number;
    cache_type: string;
    data: Json;
    fetched_at?: string;
    expires_at: string;
    created_at?: string;
  };
  Update: {
    id?: string;
    latitude?: number;
    longitude?: number;
    cache_type?: string;
    data?: Json;
    fetched_at?: string;
    expires_at?: string;
    created_at?: string;
  };
  Relationships: [];
};
```

**C) Ajouter convenience type** (après ligne 650) :

```typescript
export type WeatherCache = Tables<"weather_cache">;
```

---

## Phase 2 - Service Météo

### 2.1 Créer `src/lib/integrations/weather.ts`

Fichier complet. Suit le pattern des autres intégrations (strava, whoop).

**Constantes :**

```typescript
const OWM_BASE_URL = "https://api.openweathermap.org/data/2.5";
const CACHE_TTL_CURRENT_MIN = 30;
const CACHE_TTL_FORECAST_MIN = 180;
const COORD_PRECISION = 2; // Arrondi à 2 décimales (~1.1km)
```

**Interfaces exportées :**

```typescript
export interface WeatherContext {
  location: {
    latitude: number;
    longitude: number;
    city_name: string | null;
  };
  current: {
    temperature_c: number;
    feels_like_c: number;
    humidity_percent: number;
    wind_speed_kmh: number;
    wind_gust_kmh: number | null;
    description: string;
    icon: string;
    precipitation_mm: number;
    snow_mm: number;
    visibility_km: number;
    uv_index: number | null;
    clouds_percent: number;
  };
  forecast: ForecastDay[];
  ground_conditions: GroundConditions;
  alerts: WeatherAlert[];
}

export interface ForecastDay {
  date: string;                 // YYYY-MM-DD
  temp_min_c: number;
  temp_max_c: number;
  feels_like_c: number;
  description: string;
  icon: string;
  wind_speed_kmh: number;
  wind_gust_kmh: number | null;
  precipitation_probability: number;
  precipitation_mm: number;
  snow_mm: number;
  uv_index: number | null;
  outdoor_feasibility: OutdoorFeasibility;
}

export interface OutdoorFeasibility {
  running: "ok" | "prudence" | "deconseille";
  cycling: "ok" | "prudence" | "deconseille";
  swimming_outdoor: "ok" | "prudence" | "deconseille";
  summary_fr: string;
}

export interface GroundConditions {
  recent_snow_accumulation_cm: number;
  recent_rain_mm: number;
  ground_assessment: string;  // "Sol sec", "Sol mouillé", "Neige au sol probable"
}

export interface WeatherAlert {
  event: string;
  description: string;
  severity: "minor" | "moderate" | "severe" | "extreme";
  start: string;
  end: string;
}
```

**Fonctions à implémenter :**

#### `roundCoord(value: number): number`
Arrondit à `COORD_PRECISION` décimales pour partage de cache.

#### `fetchCurrentWeather(lat: number, lon: number): Promise<OWMCurrentResponse>`
- Appel GET `${OWM_BASE_URL}/weather?lat={lat}&lon={lon}&units=metric&lang=fr&appid={key}`
- Retourne le JSON brut de l'API OWM

#### `fetchForecast(lat: number, lon: number): Promise<OWMForecastResponse>`
- Appel GET `${OWM_BASE_URL}/forecast?lat={lat}&lon={lon}&units=metric&lang=fr&appid={key}`
- Retourne le JSON brut (segments de 3h sur 5 jours)

#### `getCachedOrFetch<T>(supabase, lat, lon, cacheType, fetchFn): Promise<T>`
- Arrondit les coordonnées
- Cherche dans `weather_cache` une entrée valide (non expirée)
- Si trouvée : retourne `data` depuis le cache
- Si non trouvée :
  1. Appelle `fetchFn()`
  2. Nettoyage opportuniste : `DELETE FROM weather_cache WHERE expires_at < now()` (limité à 10 entrées)
  3. INSERT dans `weather_cache` avec `expires_at` = now + TTL
  4. Retourne les données

#### `transformCurrentWeather(owmData): WeatherContext["current"]`
Convertit le JSON OWM en notre format :
- `wind_speed_kmh` = `owmData.wind.speed * 3.6` (OWM donne m/s en metric)
- `wind_gust_kmh` = `owmData.wind.gust * 3.6` si présent
- `precipitation_mm` = `owmData.rain?.["1h"] || 0`
- `snow_mm` = `owmData.snow?.["1h"] || 0`
- `visibility_km` = `owmData.visibility / 1000`
- `description` = `owmData.weather[0].description`
- `icon` = `owmData.weather[0].icon`

#### `transformForecast(owmData): ForecastDay[]`
- Les données OWM arrivent en segments de 3h. Regrouper par jour (date YYYY-MM-DD).
- Par jour :
  - `temp_min_c` = min des `main.temp_min` du jour
  - `temp_max_c` = max des `main.temp_max` du jour
  - `feels_like_c` = moyenne des `main.feels_like`
  - `description` = description du segment de midi (ou le plus proche)
  - `icon` = icone du segment de midi
  - `wind_speed_kmh` = max des `wind.speed * 3.6`
  - `wind_gust_kmh` = max des `wind.gust * 3.6` si présent
  - `precipitation_probability` = max des `pop`
  - `precipitation_mm` = somme des `rain?.["3h"] || 0`
  - `snow_mm` = somme des `snow?.["3h"] || 0`
  - Appeler `assessOutdoorFeasibility()` pour chaque jour

#### `assessOutdoorFeasibility(temp, wind, precip, snow, visibility): OutdoorFeasibility`

Seuils :

| Critère | Vélo déconseillé | Vélo prudence | Course déconseillée | Course prudence |
|---------|-----------------|---------------|--------------------| --------------- |
| Vent km/h | > 50 | > 30 | > 60 | > 40 |
| Pluie mm | > 5 | > 1 | > 10 | > 3 |
| Temp basse °C | < -5 | < 2 | < -15 | < -5 |
| Temp haute °C | — | — | > 38 | > 32 |
| Neige mm | > 0 | — | > 10 | > 3 |
| Visibilité km | < 1 | < 3 | — | — |

- `swimming_outdoor` : `"deconseille"` si temp < 10 ou neige > 0, `"prudence"` si temp < 15, sinon `"ok"`
- `summary_fr` : phrase résumant la conclusion (ex: "Vent fort, vélo déconseillé")

#### `assessGroundConditions(forecastDays): GroundConditions`
- Calcule la neige totale et la pluie totale sur les 2 premiers jours de prévision (approximation des 48h passées depuis qu'on n'a pas d'historique)
- Si neige > 5cm ET temp max restée < 2°C → `"Neige au sol probable"`
- Si pluie > 20mm → `"Sol probablement mouillé / boueux"`
- Sinon → `"Sol sec"`

#### `getWeatherContext(supabase, lat, lon): Promise<WeatherContext>`
Fonction principale orchestratrice :
1. Appelle `getCachedOrFetch` pour current et forecast en parallèle
2. Transforme les données via `transformCurrentWeather` et `transformForecast`
3. Évalue `assessGroundConditions`
4. Extrait les alertes OWM si présentes dans la réponse
5. Retourne le `WeatherContext` complet

---

## Phase 3 - Extension du Coach IA

### 3.1 Modifier `src/lib/openai/coach.ts`

**A) Ajouter import** (après ligne 8) :

```typescript
import { getWeatherContext, type WeatherContext } from "@/lib/integrations/weather";
```

**B) Ajouter `weather_context` à l'interface `CoachContext`** (ligne 102-112) :

```typescript
export interface CoachContext {
  // ... champs existants inchangés ...
  weather_context: WeatherContext | null;
}
```

**C) Enrichir `SYSTEM_PROMPT`** (après ligne 165, avant le backtick de fermeture) :

Ajouter cette section :

```
## Conditions météo et entraînement

Si le contexte JSON contient "weather_context", utilise-le pour adapter tes conseils :

### Compatibilité sport / météo
- **Vélo** : déconseillé si vent > 50 km/h, pluie > 5mm/h, neige, verglas (< 2°C + humidité), visibilité < 1 km
- **Course** : plus tolérant. Déconseillé si vent > 60 km/h, orage violent, temp < -15°C ou > 38°C
- **Natation ext.** : déconseillée en cas d'orage ou températures très basses
- **Alerte sévère** : toutes activités → intérieur

### Alternatives indoor
- Vélo → Home trainer / vélo d'intérieur
- Course → Tapis / renforcement musculaire
- Natation ext. → Piscine couverte / renforcement
- Ne supprime JAMAIS la séance : propose une alternative de même durée et intensité

### Conditions au sol
- "Neige au sol" même sans nouvelle chute → déconseille vélo route, prudence course
- "Sol mouillé/boueux" → prudence trail, OK route

### Dans les plans
- Consulte les prévisions pour chaque jour et choisis le sport en conséquence
- Mentionne brièvement la météo dans la description si elle influence le choix
- Pas de paragraphe météo complet, juste une mention contextuelle naturelle

### Alerte proactive
Si la météo du jour rend la séance prévue déconseillable, signale-le IMMÉDIATEMENT avec une alternative concrète.
```

**D) Enrichir `PLAN_GENERATION_PROMPT`** (après ligne 199, avant le backtick de fermeture) :

Ajouter ces règles :

```
- Si "weather_context" est présent dans le contexte, choisis les sports en fonction de la météo de chaque jour.
  Si conditions défavorables → propose alternative intérieure.
- Ajoute un champ optionnel "weather_note" par session si la météo influence le choix :
  { "weather_note": "Pluie prévue l'après-midi, séance matinale recommandée" }
```

**E) Modifier `buildCoachContext`** (lignes 205-493) :

1. La requête `profileResult` (ligne 223) récupère déjà `*` donc `latitude`/`longitude` sont inclus automatiquement.

2. Ajouter une promesse météo **après** le `Promise.all` (ligne 290), car elle dépend de `profile` :

```typescript
// Après ligne 302 (const upcoming = ...)
let weatherContext: WeatherContext | null = null;
if (profile?.latitude && profile?.longitude) {
  try {
    weatherContext = await getWeatherContext(supabase, profile.latitude, profile.longitude);
  } catch (e) {
    console.error("Weather fetch failed, continuing without:", e);
    weatherContext = null;
  }
}
```

3. Ajouter `weather_context: weatherContext` dans l'objet `context` retourné (après `schedule_context`, ligne 489) :

```typescript
const context: CoachContext = {
  // ... tous les champs existants ...
  schedule_context: { ... },
  weather_context: weatherContext,
};
```

**F) Enrichir `checkProactiveAlerts`** (après ligne 550, avant le `return alerts`) :

```typescript
// Alertes météo
if (context.weather_context) {
  const weather = context.weather_context;
  const todayWorkout = context.schedule_context.today.planned_workout;

  // Alertes OWM sévères/extrêmes
  for (const alert of weather.alerts) {
    if (alert.severity === "severe" || alert.severity === "extreme") {
      alerts.push(
        `🚨 **Alerte Météo ${alert.severity === "extreme" ? "Extrême" : "Sévère"}** : ${alert.event} — ${alert.description}`
      );
    }
  }

  if (todayWorkout) {
    const sport = todayWorkout.sport.toLowerCase();
    const isOutdoorCycling = sport.includes("cycl") || sport.includes("vélo") || sport === "cycling";
    const isOutdoorRunning = sport.includes("run") || sport.includes("course") || sport === "running";
    const isOutdoorSwimming = sport.includes("swim") || sport.includes("nata");

    // Chercher la faisabilité du jour dans le forecast
    const todayForecast = weather.forecast.find(
      f => f.date === context.current_datetime.date
    );
    const feasibility = todayForecast?.outdoor_feasibility;

    if (feasibility) {
      const sportFeasibility =
        isOutdoorCycling ? feasibility.cycling :
        isOutdoorRunning ? feasibility.running :
        isOutdoorSwimming ? feasibility.swimming_outdoor :
        null;

      if (sportFeasibility === "deconseille") {
        alerts.push(
          `🌧️ **Alerte Météo** : ${weather.current.description} (${weather.current.temperature_c}°C, vent ${weather.current.wind_speed_kmh.toFixed(0)} km/h). Ta séance **${todayWorkout.title}** est déconseillée en extérieur. Envisage une alternative indoor.`
        );
      } else if (sportFeasibility === "prudence") {
        alerts.push(
          `⚠️ **Météo** : ${weather.current.description} (${weather.current.temperature_c}°C). Prudence pour ta séance **${todayWorkout.title}** en extérieur.`
        );
      }
    }

    // Conditions au sol
    if (weather.ground_conditions.ground_assessment.includes("Neige") && isOutdoorCycling) {
      alerts.push(
        `❄️ **Conditions au sol** : ${weather.ground_conditions.ground_assessment}. Vélo route fortement déconseillé.`
      );
    }
  }
}
```

---

## Phase 4 - Capture de Localisation

### 4.1 Créer `src/app/api/location/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { latitude, longitude } = body;

    // Validation
    if (
      typeof latitude !== "number" || typeof longitude !== "number" ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("users")
      .update({
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Error updating location:", error);
      return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Location API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### 4.2 Créer `src/lib/hooks/useGeolocation.ts`

```typescript
"use client";

import { useEffect } from "react";

const LOCATION_STORAGE_KEY = "cyt_location_sent_at";
const LOCATION_TTL_DAYS = 7;

export function useGeolocation() {
  useEffect(() => {
    // Vérifier si déjà envoyé récemment
    const lastSent = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (lastSent) {
      const daysSince = (Date.now() - Number(lastSent)) / (1000 * 60 * 60 * 24);
      if (daysSince < LOCATION_TTL_DAYS) return;
    }

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch("/api/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          });
          if (res.ok) {
            localStorage.setItem(LOCATION_STORAGE_KEY, String(Date.now()));
          }
        } catch {
          // Échec silencieux
        }
      },
      () => {
        // Permission refusée ou erreur — échec silencieux
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000,
      }
    );
  }, []);
}
```

### 4.3 Modifier `src/app/(dashboard)/layout.tsx`

Ce fichier est un composant client (`"use client"`), donc on peut directement utiliser le hook.

**A) Ajouter import** (après les imports existants, ligne 22) :

```typescript
import { useGeolocation } from "@/lib/hooks/useGeolocation";
```

**B) Appeler le hook** dans le composant `DashboardLayout` (après les hooks existants, ligne 65) :

```typescript
useGeolocation();
```

---

## Phase 5 - UI Météo dans les Plans

### 5.1 Créer `src/lib/weather-icons.ts`

```typescript
const OWM_ICON_MAP: Record<string, string> = {
  "01d": "☀️", "01n": "🌙",
  "02d": "⛅", "02n": "☁️",
  "03d": "☁️", "03n": "☁️",
  "04d": "☁️", "04n": "☁️",
  "09d": "🌧️", "09n": "🌧️",
  "10d": "🌦️", "10n": "🌧️",
  "11d": "⛈️", "11n": "⛈️",
  "13d": "🌨️", "13n": "🌨️",
  "50d": "🌫️", "50n": "🌫️",
};

export function getWeatherEmoji(iconCode: string): string {
  return OWM_ICON_MAP[iconCode] || "🌤️";
}
```

### 5.2 Modifier `src/app/(dashboard)/chat/page.tsx`

**A) Ajouter `weather_note` à l'interface `PlanSession`** (ligne 43-49) :

```typescript
interface PlanSession {
  title: string;
  sport?: string;
  duration_minutes?: number;
  description?: string;
  intensity?: string;
  weather_note?: string;  // NOUVEAU
}
```

**B) Afficher la weather_note dans `renderPlanSuggestion`** (après le bloc `{session.description && ...}` vers ligne 570-573) :

Ajouter juste après `</p>` de la description :

```tsx
{session.weather_note && (
  <p className="mt-1 text-xs text-accent/80 flex items-center gap-1">
    <span>🌤️</span>
    {session.weather_note}
  </p>
)}
```

Emplacement exact : après la ligne `{session.description && (` ... `)}` (lignes 570-573), avant la fermeture du `</div>` de la session (ligne 574).

---

## Résumé des fichiers

| Action | Fichier | Quoi |
|--------|---------|------|
| CRÉER | `supabase/migrations/00007_add_weather_support.sql` | Migration DB |
| CRÉER | `src/lib/integrations/weather.ts` | Service météo complet (~300 lignes) |
| CRÉER | `src/app/api/location/route.ts` | Endpoint POST sauvegarde coordonnées |
| CRÉER | `src/lib/hooks/useGeolocation.ts` | Hook géolocalisation navigateur |
| CRÉER | `src/lib/weather-icons.ts` | Mapping icônes OWM → emoji |
| MODIFIER | `src/types/database.ts` | +3 champs users, +table weather_cache, +type |
| MODIFIER | `src/lib/openai/coach.ts` | Import, interface, buildContext, prompts, alertes |
| MODIFIER | `src/app/(dashboard)/layout.tsx` | Import + appel useGeolocation() |
| MODIFIER | `src/app/(dashboard)/chat/page.tsx` | weather_note interface + rendu UI |

## Ordre d'implémentation

```
Phase 1 → Phase 2 → Phase 3 + Phase 4 (parallèle) → Phase 5 → Build check
```

## Variable d'environnement

Ajouter dans `.env.local` :
```
OPENWEATHERMAP_API_KEY=your_key_here
```
