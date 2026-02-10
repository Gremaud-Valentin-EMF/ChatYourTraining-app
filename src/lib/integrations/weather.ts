import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const OWM_BASE_URL = "https://api.openweathermap.org/data/2.5";
const CACHE_TTL_CURRENT_MIN = 30;
const CACHE_TTL_FORECAST_MIN = 180;
const COORD_PRECISION = 2;

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
  date: string;
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
  ground_assessment: string;
}

export interface WeatherAlert {
  event: string;
  description: string;
  severity: "minor" | "moderate" | "severe" | "extreme";
  start: string;
  end: string;
}

function roundCoord(value: number): number {
  return Math.round(value * Math.pow(10, COORD_PRECISION)) / Math.pow(10, COORD_PRECISION);
}

async function fetchCurrentWeather(lat: number, lon: number): Promise<unknown> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    throw new Error("OPENWEATHERMAP_API_KEY not configured");
  }

  const url = `${OWM_BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OWM current weather error: ${response.status}`);
  }
  return response.json();
}

async function fetchForecast(lat: number, lon: number): Promise<unknown> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    throw new Error("OPENWEATHERMAP_API_KEY not configured");
  }

  const url = `${OWM_BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OWM forecast error: ${response.status}`);
  }
  return response.json();
}

async function getCachedOrFetch<T>(
  supabase: SupabaseClient<Database>,
  lat: number,
  lon: number,
  cacheType: "current" | "forecast",
  fetchFn: () => Promise<T>,
  ttlMin: number
): Promise<T> {
  const roundedLat = roundCoord(lat);
  const roundedLon = roundCoord(lon);

  // Check cache
  const { data: cached } = await supabase
    .from("weather_cache")
    .select("data")
    .eq("latitude", roundedLat)
    .eq("longitude", roundedLon)
    .eq("cache_type", cacheType)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return cached.data as unknown as T;
  }

  // Fetch new data
  const data = await fetchFn();

  // Opportunistic cleanup
  await supabase
    .from("weather_cache")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .limit(10);

  // Insert new cache entry
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("weather_cache").insert({
    latitude: roundedLat,
    longitude: roundedLon,
    cache_type: cacheType,
    data: data as unknown,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  return data;
}

function transformCurrentWeather(owmData: Record<string, unknown>): WeatherContext["current"] {
  const wind = owmData.wind as Record<string, number> | undefined || {};
  const rain = (owmData.rain as Record<string, number> | undefined) || {};
  const snow = (owmData.snow as Record<string, number> | undefined) || {};
  const weather = (owmData.weather as Array<Record<string, unknown>>) || [];

  return {
    temperature_c: (owmData.main as Record<string, number>).temp || 0,
    feels_like_c: (owmData.main as Record<string, number>).feels_like || 0,
    humidity_percent: (owmData.main as Record<string, number>).humidity || 0,
    wind_speed_kmh: (wind.speed || 0) * 3.6,
    wind_gust_kmh: wind.gust ? wind.gust * 3.6 : null,
    description: (weather[0]?.description as string) || "Sans description",
    icon: (weather[0]?.icon as string) || "01d",
    precipitation_mm: rain["1h"] || 0,
    snow_mm: snow["1h"] || 0,
    visibility_km: ((owmData.visibility as number) || 10000) / 1000,
    uv_index: null,
    clouds_percent: (owmData.clouds as Record<string, number>).all || 0,
  };
}

function transformForecast(owmData: Record<string, unknown>): ForecastDay[] {
  const list = (owmData.list as Array<Record<string, unknown>>) || [];
  const dayMap = new Map<string, Array<Record<string, unknown>>>();

  // Group by day
  for (const item of list) {
    const dt = item.dt as number;
    const date = new Date(dt * 1000).toISOString().split("T")[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, []);
    }
    dayMap.get(date)!.push(item);
  }

  const days: ForecastDay[] = [];
  const daysArray = Array.from(dayMap);
  for (let i = 0; i < daysArray.length; i++) {
    const [date, items] = daysArray[i];
    if (items.length === 0) continue;

    const temps = items.map((i) => ((i.main as Record<string, number>).temp_min || 0));
    const tempMaxs = items.map((i) => ((i.main as Record<string, number>).temp_max || 0));
    const feelsLikes = items.map((i) => ((i.main as Record<string, number>).feels_like || 0));
    const winds = items.map((i) => ((i.wind as Record<string, number>).speed || 0) * 3.6);
    const windGusts = items
      .map((i) => ((i.wind as Record<string, number>).gust || 0) * 3.6)
      .filter((v) => v > 0);
    const rains = items.map((i) => ((i.rain as Record<string, number>)?.["3h"] || 0));
    const snows = items.map((i) => ((i.snow as Record<string, number>)?.["3h"] || 0));
    const pops = items.map((i) => ((i.pop as number) || 0) * 100);

    // Get midday entry (closest to 12:00)
    const middayItem = items.reduce((prev, curr) => {
      const prevHour = new Date((prev.dt as number) * 1000).getHours();
      const currHour = new Date((curr.dt as number) * 1000).getHours();
      return Math.abs(currHour - 12) < Math.abs(prevHour - 12) ? curr : prev;
    });

    const weather = (middayItem.weather as Array<Record<string, unknown>>) || [];

    const day: ForecastDay = {
      date,
      temp_min_c: Math.min(...temps),
      temp_max_c: Math.max(...tempMaxs),
      feels_like_c: feelsLikes.length > 0 ? feelsLikes.reduce((a, b) => a + b) / feelsLikes.length : 0,
      description: (weather[0]?.description as string) || "Sans description",
      icon: (weather[0]?.icon as string) || "01d",
      wind_speed_kmh: Math.max(...winds),
      wind_gust_kmh: windGusts.length > 0 ? Math.max(...windGusts) : null,
      precipitation_probability: Math.max(...pops),
      precipitation_mm: rains.reduce((a, b) => a + b, 0),
      snow_mm: snows.reduce((a, b) => a + b, 0),
      uv_index: null,
      outdoor_feasibility: assessOutdoorFeasibility(
        Math.max(...tempMaxs),
        Math.max(...winds),
        rains.reduce((a, b) => a + b, 0),
        snows.reduce((a, b) => a + b, 0),
        ((middayItem.visibility as number) || 10000) / 1000
      ),
    };

    days.push(day);
  }

  return days;
}

function assessOutdoorFeasibility(
  tempMaxC: number,
  windKmh: number,
  precipMm: number,
  snowMm: number,
  visibilityKm: number
): OutdoorFeasibility {
  let cycling: "ok" | "prudence" | "deconseille" = "ok";
  let running: "ok" | "prudence" | "deconseille" = "ok";
  let swimming_outdoor: "ok" | "prudence" | "deconseille" = "ok";

  // Cycling
  if (windKmh > 50 || precipMm > 5 || snowMm > 0 || visibilityKm < 1 || tempMaxC < -5) {
    cycling = "deconseille";
  } else if (windKmh > 30 || precipMm > 1 || (tempMaxC < 2 && precipMm > 0) || visibilityKm < 3) {
    cycling = "prudence";
  }

  // Running
  if (
    windKmh > 60 ||
    precipMm > 10 ||
    snowMm > 10 ||
    tempMaxC < -15 ||
    tempMaxC > 38
  ) {
    running = "deconseille";
  } else if (windKmh > 40 || precipMm > 3 || (snowMm > 3 && snowMm <= 10) || tempMaxC > 32) {
    running = "prudence";
  }

  // Outdoor swimming
  if (tempMaxC < 10 || snowMm > 0) {
    swimming_outdoor = "deconseille";
  } else if (tempMaxC < 15) {
    swimming_outdoor = "prudence";
  }

  let summary_fr = "Conditions OK";
  if (cycling === "deconseille" || running === "deconseille") {
    summary_fr = "Conditions défavorables pour sports outdoor";
  } else if (cycling === "prudence" || running === "prudence") {
    summary_fr = "Prudence pour sports outdoor";
  }

  return { running, cycling, swimming_outdoor, summary_fr };
}

function assessGroundConditions(forecastDays: ForecastDay[]): GroundConditions {
  let totalSnow = 0;
  let totalRain = 0;
  let minTemp = 0;

  for (let i = 0; i < Math.min(2, forecastDays.length); i++) {
    const day = forecastDays[i];
    totalSnow += day.snow_mm;
    totalRain += day.precipitation_mm;
    if (i === 0) {
      minTemp = day.temp_min_c;
    } else {
      minTemp = Math.min(minTemp, day.temp_min_c);
    }
  }

  let ground_assessment = "Sol sec";
  if (totalSnow > 50 && minTemp < 2) {
    ground_assessment = "Neige au sol probable";
  } else if (totalRain > 20) {
    ground_assessment = "Sol probablement mouillé / boueux";
  }

  return {
    recent_snow_accumulation_cm: totalSnow / 10,
    recent_rain_mm: totalRain,
    ground_assessment,
  };
}

export async function getWeatherContext(
  supabase: SupabaseClient<Database>,
  lat: number,
  lon: number
): Promise<WeatherContext> {
  const [currentData, forecastData] = await Promise.all([
    getCachedOrFetch(
      supabase,
      lat,
      lon,
      "current",
      () => fetchCurrentWeather(lat, lon),
      CACHE_TTL_CURRENT_MIN
    ),
    getCachedOrFetch(
      supabase,
      lat,
      lon,
      "forecast",
      () => fetchForecast(lat, lon),
      CACHE_TTL_FORECAST_MIN
    ),
  ]);

  const current = transformCurrentWeather(currentData as Record<string, unknown>);
  const forecast = transformForecast(forecastData as Record<string, unknown>);
  const groundConditions = assessGroundConditions(forecast);

  // Extract alerts from OWM if present
  const alerts: WeatherAlert[] = [];
  const alertsData = (currentData as Record<string, unknown>)?.alerts;
  if (Array.isArray(alertsData)) {
    for (const alert of alertsData) {
      if (typeof alert === "object" && alert !== null) {
        const alertObj = alert as Record<string, unknown>;
        alerts.push({
          event: (alertObj.event as string) || "Alerte",
          description: (alertObj.description as string) || "",
          severity:
            ((alertObj.severity as string)?.toLowerCase() as "minor" | "moderate" | "severe" | "extreme") ||
            "minor",
          start: (alertObj.start as string) || "",
          end: (alertObj.end as string) || "",
        });
      }
    }
  }

  return {
    location: {
      latitude: roundCoord(lat),
      longitude: roundCoord(lon),
      city_name: (currentData as Record<string, unknown>)?.name as string | null,
    },
    current,
    forecast,
    ground_conditions: groundConditions,
    alerts,
  };
}
