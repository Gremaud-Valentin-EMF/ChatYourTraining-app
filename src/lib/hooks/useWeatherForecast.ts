"use client";

import { useEffect, useState } from "react";
import type { ForecastDay } from "@/lib/integrations/weather";

export function useWeatherForecast() {
  const [forecastMap, setForecastMap] = useState<Map<string, ForecastDay> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("/api/weather");
        if (res.ok) {
          const data = await res.json();
          if (data?.forecast) {
            const map = new Map<string, ForecastDay>();
            for (const day of data.forecast) {
              map.set(day.date, day);
            }
            setForecastMap(map);
          }
        }
      } catch (error) {
        console.error("Failed to fetch weather forecast:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, []);

  return { forecastMap, loading };
}
