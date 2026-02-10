"use client";

import { useEffect } from "react";

const LOCATION_STORAGE_KEY = "cyt_location";
const LOCATION_TTL_MS = 60 * 60 * 1000; // 1 heure
const SIGNIFICANT_DISTANCE_DEG = 0.05; // ~5 km

interface StoredLocation {
  lat: number;
  lon: number;
  ts: number;
}

export function useGeolocation() {
  useEffect(() => {
    if (!navigator.geolocation) return;

    const checkAndUpdateLocation = async (newLat: number, newLon: number) => {
      const stored = localStorage.getItem(LOCATION_STORAGE_KEY);

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as StoredLocation;

          // Check if TTL is still valid
          if (Date.now() - parsed.ts < LOCATION_TTL_MS) {
            // TTL valid, check if position changed significantly
            const latDiff = Math.abs(newLat - parsed.lat);
            const lonDiff = Math.abs(newLon - parsed.lon);

            if (latDiff < SIGNIFICANT_DISTANCE_DEG && lonDiff < SIGNIFICANT_DISTANCE_DEG) {
              // Position didn't change significantly, skip update
              return;
            }
          }
        } catch {
          // Parse error, continue with update
        }
      }

      // Update location on server
      try {
        await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: newLat,
            longitude: newLon,
          }),
        });
      } catch {
        // Silent failure
      }

      // Store new location
      const locationData: StoredLocation = {
        lat: newLat,
        lon: newLon,
        ts: Date.now(),
      };
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationData));
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        checkAndUpdateLocation(
          position.coords.latitude,
          position.coords.longitude
        );
      },
      () => {
        // Permission denied or error — silent failure
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000,
      }
    );
  }, []);
}
