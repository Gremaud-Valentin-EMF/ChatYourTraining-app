"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge, Button, Spinner, Slider } from "@/components/ui";
import { ArrowLeft, Activity } from "lucide-react";
import {
  formatDuration,
  formatDistance,
  getSportColor,
} from "@/lib/utils";
import { getSportIconComponent } from "@/lib/sport-icons";
import type { Json } from "@/types/database";

const focusByIntensity: Record<string, string> = {
  endurance: "Endurance fondamentale",
  tempo: "Développement VMA",
  threshold: "Seuil / tenue de puissance",
  vo2max: "Augmentation de VO2max",
  recovery: "Récupération active",
};

interface ActivityDetail {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
  sport_id: string | null;
  sport_name: string;
  sport_label: string;
  sport_icon: string | null;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  planned_distance_km: number | null;
  actual_distance_km: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_watts: number | null;
  tss: number | null;
  intensity: string | null;
  source: string;
  description: string | null;
  rpe: number | null;
  raw_data: Json | null;
}

export default function WorkoutDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ftpWatts, setFtpWatts] = useState<number | null>(null);
  const [lthrValue, setLthrValue] = useState<number | null>(null);
  const [rpeInput, setRpeInput] = useState<number>(0);
  const [isSavingRpe, setIsSavingRpe] = useState(false);

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (activity) {
      setRpeInput(activity.rpe ?? 0);
    }
  }, [activity]);

  const loadActivity = async () => {
    setIsLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from("activities")
      .select(
        `
        id,
        title,
        scheduled_date,
        status,
        sport_id,
        planned_duration_minutes,
        actual_duration_minutes,
        planned_distance_km,
        actual_distance_km,
        elevation_gain_m,
        avg_hr,
        max_hr,
        tss,
        intensity,
        rpe,
        source,
        description,
        avg_power_watts,
        raw_data
      `
      )
      .eq("id", params.id)
      .single();

    if (data) {
      let sportName = "other";
      let sportLabel = "Autre";
      let sportIconName: string | null = null;
      if (data.sport_id) {
        const { data: sportInfo } = await supabase
          .from("sports")
          .select("name, name_fr, icon")
          .eq("id", data.sport_id)
          .single();
        if (sportInfo) {
          sportName = sportInfo.name || sportName;
          sportLabel = sportInfo.name_fr || sportLabel;
          sportIconName = sportInfo.icon ?? null;
        }
      }

      const [physioResponse, sportResponse] = await Promise.all([
        supabase
          .from("physiological_data")
          .select("lthr")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_sports")
          .select("ftp_watts")
          .eq("user_id", user.id)
          .eq("sport_id", data.sport_id)
          .maybeSingle(),
      ]);

      const physioData = physioResponse.data as { lthr?: number } | null;
      const sportData = sportResponse.data as { ftp_watts?: number } | null;
      setLthrValue(physioData?.lthr ?? null);
      setFtpWatts(sportData?.ftp_watts ?? null);

      setActivity({
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        status: data.status,
        sport_id: data.sport_id,
        sport_name: sportName,
        sport_label: sportLabel,
        sport_icon: sportIconName,
        description: data.description ?? null,
        planned_duration_minutes: data.planned_duration_minutes,
        actual_duration_minutes: data.actual_duration_minutes,
        planned_distance_km: data.planned_distance_km,
        actual_distance_km: data.actual_distance_km,
        elevation_gain_m: data.elevation_gain_m,
        avg_hr: data.avg_hr,
        max_hr: data.max_hr,
        avg_power_watts: data.avg_power_watts ?? null,
        tss: data.tss,
        intensity: data.intensity,
        source: data.source,
        rpe: data.rpe ?? null,
        raw_data: data.raw_data ?? null,
      });
    } else {
      setActivity(null);
    }
    setIsLoading(false);
  };

  const handleRpeSave = async () => {
    if (!activity) return;
    setIsSavingRpe(true);
    const { error } = await supabase
      .from("activities")
      .update({ rpe: rpeInput })
      .eq("id", activity.id);
    setIsSavingRpe(false);
    if (!error) {
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              rpe: rpeInput,
            }
          : prev
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <Card className="p-6 text-center text-muted">
          Impossible de trouver cette séance.
        </Card>
      </div>
    );
  }

  const sportColor = getSportColor(activity.sport_name);
  const SportIcon = getSportIconComponent(activity.sport_icon ?? undefined);
  const date = new Date(activity.scheduled_date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  type BadgeVariant =
    | "default"
    | "success"
    | "warning"
    | "error"
    | "info"
    | "outline";

  const statusLabelMap: Record<string, string> = {
    planned: "Prévu",
    completed: "Réalisé",
    in_progress: "En cours",
    skipped: "Annulé",
  };
  const statusVariantMap: Record<string, BadgeVariant> = {
    planned: "outline",
    completed: "success",
    // "secondary" is not part of BadgeVariant, map it to "info" (or another valid variant)
    in_progress: "info",
    skipped: "error",
  };
  const statusLabel = statusLabelMap[activity.status] ?? "Prévu";
  const statusVariant: BadgeVariant =
    statusVariantMap[activity.status] ?? "outline";
  const intensityKey = (activity.intensity ?? "endurance").toLowerCase();
  const focusLabel =
    focusByIntensity[intensityKey] ?? "Approche guidée pour cette séance";
  const rawData = (activity.raw_data as Record<string, unknown> | null) ?? null;
  const calculated = rawData?._calculated as
    | Record<string, unknown>
    | undefined;
  const normalizedPower =
    typeof calculated?.normalized_power === "number"
      ? calculated.normalized_power
      : null;
  const normalizedHeartRate =
    typeof calculated?.normalized_hr === "number"
      ? calculated.normalized_hr
      : null;
  const normalizedPaceSeconds =
    typeof calculated?.normalized_pace === "number"
      ? calculated.normalized_pace
      : null;
  const elapsedTimeSeconds =
    typeof rawData?.elapsed_time === "number" ? rawData.elapsed_time : null;
  const movingTimeSeconds =
    typeof rawData?.moving_time === "number" ? rawData.moving_time : null;
  const workKilojoules =
    typeof rawData?.kilojoules === "number" ? rawData.kilojoules : null;
  const distanceKm =
    activity.actual_distance_km ?? activity.planned_distance_km ?? null;
  const durationMinutesValue =
    elapsedTimeSeconds !== null
      ? elapsedTimeSeconds / 60
      : activity.actual_duration_minutes ?? null;
  const movingMinutesValue =
    movingTimeSeconds !== null
      ? movingTimeSeconds / 60
      : activity.actual_duration_minutes ?? null;
  const isCycling = activity.sport_name === "cycling";
  const isRunning = activity.sport_name === "running";
  const formatDurationValue = (minutes: number) =>
    formatDuration(Math.round(minutes));
  const formatPaceValue = (secondsPerKm: number) => {
    if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--";
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}'${String(seconds).padStart(2, "0")}" /km`;
  };
  const averagePaceSeconds =
    normalizedPaceSeconds ??
    (elapsedTimeSeconds && distanceKm ? elapsedTimeSeconds / distanceKm : null);
  const intensityFactorPower =
    normalizedPower && ftpWatts ? normalizedPower / ftpWatts : null;
  const intensityFactorHeart =
    normalizedHeartRate && lthrValue ? normalizedHeartRate / lthrValue : null;
  const intensityFactor = intensityFactorPower ?? intensityFactorHeart ?? null;
  const averagePower =
    typeof rawData?.avg_power_watts === "number"
      ? rawData.avg_power_watts
      : activity.avg_power_watts ?? null;
  const variabilityIndex =
    normalizedPower && averagePower && averagePower > 0
      ? normalizedPower / averagePower
      : null;
  const elevationGain =
    typeof activity.elevation_gain_m === "number"
      ? activity.elevation_gain_m
      : null;
  const getRawNumber = (key: string) =>
    typeof rawData?.[key] === "number" ? (rawData[key] as number) : null;
  const calories =
    getRawNumber("calories") ??
    getRawNumber("kcal") ??
    getRawNumber("calories_kcal") ??
    getRawNumber("estimated_calories");
  type ComparisonRow = {
    label: string;
    planned?: string | null;
    actual?: string | null;
    plannedRaw?: number | null;
    actualRaw?: number | null;
  };

  const plannedDurationMinutes = activity.planned_duration_minutes;
  const plannedDistanceKm = activity.planned_distance_km;
  const plannedDurationString =
    typeof plannedDurationMinutes === "number"
      ? formatDurationValue(plannedDurationMinutes)
      : null;
  const plannedDistanceString =
    typeof plannedDistanceKm === "number"
      ? formatDistance(plannedDistanceKm)
      : null;
  const plannedPaceSeconds =
    typeof plannedDurationMinutes === "number" &&
    typeof plannedDistanceKm === "number" &&
    plannedDistanceKm > 0
      ? (plannedDurationMinutes * 60) / plannedDistanceKm
      : null;
  const plannedPaceString =
    plannedPaceSeconds !== null ? formatPaceValue(plannedPaceSeconds) : null;
  const actualDurationString =
    durationMinutesValue !== null
      ? formatDurationValue(durationMinutesValue)
      : null;
  const actualMovingString =
    movingMinutesValue !== null
      ? formatDurationValue(movingMinutesValue)
      : null;
  const actualDistanceString =
    distanceKm !== null ? formatDistance(distanceKm) : null;
  const actualPaceString =
    averagePaceSeconds !== null ? formatPaceValue(averagePaceSeconds) : null;

  const comparisonRows: ComparisonRow[] = [
    {
      label: "Durée totale",
      planned: plannedDurationString,
      actual: actualDurationString,
      plannedRaw:
        typeof plannedDurationMinutes === "number"
          ? plannedDurationMinutes
          : null,
      actualRaw: durationMinutesValue,
    },
    {
      label: "Moving time",
      actual: actualMovingString,
      actualRaw: movingMinutesValue,
    },
    {
      label: "Distance",
      planned: plannedDistanceString,
      actual: actualDistanceString,
      plannedRaw:
        typeof plannedDistanceKm === "number" ? plannedDistanceKm : null,
      actualRaw: distanceKm,
    },
    {
      label: "Moyenne / rythme moyen",
      planned: plannedPaceString,
      actual: actualPaceString,
      plannedRaw: plannedPaceSeconds,
      actualRaw: averagePaceSeconds,
    },
    {
      label: "NP",
      actual:
        isCycling && normalizedPower
          ? `${Math.round(normalizedPower)} W`
          : null,
      actualRaw: normalizedPower,
    },
    {
      label: "VI",
      actual:
        isCycling && variabilityIndex ? variabilityIndex.toFixed(2) : null,
      actualRaw: variabilityIndex,
    },
    {
      label: "Work",
      actual:
        isCycling && workKilojoules !== null
          ? `${Math.round(workKilojoules)} kJ`
          : null,
      actualRaw: workKilojoules,
    },
    {
      label: "Calories",
      actual: calories !== null ? `${Math.round(calories)} kcal` : null,
      actualRaw: calories,
    },
    {
      label: "Dénivelé",
      actual: elevationGain !== null ? `${Math.round(elevationGain)} m` : null,
      actualRaw: elevationGain,
    },
    {
      label: "TSS",
      actual:
        activity.tss !== null && activity.tss !== undefined
          ? `${activity.tss}`
          : null,
      actualRaw: activity.tss,
    },
    {
      label: "IF",
      actual:
        intensityFactor && (isCycling || isRunning)
          ? intensityFactor.toFixed(2)
          : null,
      actualRaw: intensityFactor,
    },
  ].filter((row) => row.planned || row.actual);
  const formatComparisonValue = (
    formatted?: string | null,
    raw?: number | null
  ) => (raw === 0 ? "--" : formatted ?? "—");

  const getFirstRawNumber = (...keys: string[]) => {
    for (const key of keys) {
      const value = getRawNumber(key);
      if (value !== null) {
        return value;
      }
    }
    return null;
  };

  const sportKey = (activity.sport_name || "").toLowerCase();
  const prefersPace =
    sportKey.includes("run") ||
    sportKey.includes("triathlon") ||
    sportKey.includes("trail");
  const toKmh = (value: number | null) => (value === null ? null : value * 3.6);

  const heartRateStats = {
    min: getFirstRawNumber("min_heartrate", "min_hr"),
    avg: activity.avg_hr ?? getFirstRawNumber("average_heartrate", "avg_hr"),
    max: activity.max_hr ?? getFirstRawNumber("max_heartrate", "max_hr"),
  };
  const powerStats = {
    min: getFirstRawNumber("min_watts", "min_power", "min_power_watts"),
    avg:
      averagePower ??
      getFirstRawNumber("weighted_average_watts", "average_watts"),
    max: getFirstRawNumber("max_watts", "max_power"),
  };
  const cadenceStats = {
    min: getFirstRawNumber("min_cadence"),
    avg: getFirstRawNumber("average_cadence", "cadence_average"),
    max: getFirstRawNumber("max_cadence"),
  };
  const avgSpeedFromDistance =
    distanceKm !== null && durationMinutesValue
      ? distanceKm / (durationMinutesValue / 60)
      : null;
  const speedStats = {
    min: toKmh(getFirstRawNumber("min_speed", "min_velocity")),
    avg:
      avgSpeedFromDistance ??
      toKmh(getFirstRawNumber("average_speed", "velocity_average")),
    max: toKmh(getFirstRawNumber("max_speed", "max_velocity")),
  };

  type StatEntry = {
    label: string;
    min?: number | null;
    avg?: number | null;
    max?: number | null;
    formatter: (value: number) => string;
  };

  const formatStatNumber = (
    value: number | null | undefined,
    formatter: (value: number) => string
  ) => {
    if (value === null || value === undefined) return "—";
    if (value === 0) return "--";
    return formatter(value);
  };

  const hasStatValue = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value);

  const statCards: StatEntry[] = [];

  const addStatCard = (entry: StatEntry) => {
    if (
      hasStatValue(entry.min) ||
      hasStatValue(entry.avg) ||
      hasStatValue(entry.max)
    ) {
      statCards.push(entry);
    }
  };

  addStatCard({
    label: "Fréquence cardiaque",
    min: heartRateStats.min,
    avg: heartRateStats.avg,
    max: heartRateStats.max,
    formatter: (value) => `${Math.round(value)} bpm`,
  });
  addStatCard({
    label: "Puissance",
    min: powerStats.min,
    avg: powerStats.avg,
    max: powerStats.max,
    formatter: (value) => `${Math.round(value)} W`,
  });
  addStatCard({
    label: "Cadence",
    min: cadenceStats.min,
    avg: cadenceStats.avg,
    max: cadenceStats.max,
    formatter: (value) => `${Math.round(value)} rpm`,
  });
  const speedLabel = prefersPace ? "Allure" : "Vitesse";
  addStatCard({
    label: speedLabel,
    min: speedStats.min,
    avg: speedStats.avg,
    max: speedStats.max,
    formatter: (value) =>
      prefersPace ? formatPaceValue(3600 / value) : `${value.toFixed(1)} km/h`,
  });

  return (
    <div className="space-y-6">
      <Link
        href="/workouts"
        className="inline-flex items-center text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour à la liste
      </Link>

      <Card>
        <div className="space-y-6">
          <header className="border-b border-dark-200 pb-4 space-y-3">
            <div className="flex items-start gap-4">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ backgroundColor: sportColor }}
              >
                <SportIcon className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="flex-1 space-y-1">
                <div>
                  <p className="text-xs uppercase text-foreground/60">{date}</p>
                </div>
                <div className="flex flex-row items-center gap-3">
                  <h1 className="text-2xl font-bold text-foreground">
                    {activity.title}
                  </h1>
                  <Badge
                    variant={statusVariant}
                    className="uppercase text-xs tracking-wide"
                  >
                    {statusLabel}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="uppercase text-xs tracking-wide"
                  >
                    {activity.source.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/70">
                  {activity.sport_label}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs uppercase text-foreground/60">
                    Objectif de la séance
                  </span>
                  <span className="font-medium text-foreground">
                    {focusLabel}
                  </span>
                </div>
              </div>
            </div>
            {activity.description && (
              <section className="space-y-3 border-t border-dark-200 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Description
                  </h3>
                  <span className="text-xs uppercase text-foreground/60">
                    Notes de contexte
                  </span>
                </div>
                <div className="rounded-2xl border border-dark-200 bg-dark-100/50 px-4 py-3 text-sm text-foreground/70">
                  {activity.description}
                </div>
              </section>
            )}
          </header>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Données d&apos;entraînement
              </h3>
              <span className="text-xs uppercase text-foreground/60">
                {comparisonRows.length ? "Détails" : "Relevé indisponible"}
              </span>
            </div>
            {comparisonRows.length ? (
              <div className="grid gap-3">
                {comparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-2xl border border-dark-200 bg-dark-100 p-4 shadow-inner"
                  >
                    <div>
                      <p className="text-xs uppercase text-accent font-semibold">
                        {row.label}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs uppercase text-foreground/60">
                          Prévu
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatComparisonValue(row.planned, row.plannedRaw)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-foreground/60">
                          Réalisé
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatComparisonValue(row.actual, row.actualRaw)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Aucune donnée spécifique n&apos;est disponible pour cette
                séance.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-dark-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                RPE de la séance
              </h3>
              <span className="text-xs uppercase text-foreground/60">
                {activity.rpe ?? "—"} / 10
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="rpe-input"
                  className="text-xs uppercase text-foreground/60"
                >
                  Perception de l’effort
                </label>
                <Slider
                  id="rpe-input"
                  value={rpeInput}
                  min={0}
                  max={10}
                  step={1}
                  label="RPE"
                  showValue
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    if (Number.isNaN(numeric)) return;
                    setRpeInput(Math.min(10, Math.max(0, numeric)));
                  }}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={handleRpeSave}
                isLoading={isSavingRpe}
                disabled={isSavingRpe || (activity.rpe ?? 0) === rpeInput}
                className="whitespace-nowrap"
              >
                Enregistrer
              </Button>
            </div>
            <p className="text-xs text-foreground/60">
              Renseigne le RPE une fois la séance terminée pour améliorer les
              analyses futures.
            </p>
          </section>

          <section className="space-y-3 border-t border-dark-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Statistiques de la séance
              </h3>
              <span className="text-xs uppercase text-muted">
                Min / Moy / Max
              </span>
            </div>
            {statCards.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-dark-200 bg-dark-100 p-4 shadow-inner"
                  >
                    <p className="text-xs uppercase text-accent font-semibold">
                      {card.label}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div className="text-center">
                        <p className="uppercase text-foreground/60 text-[10px]">
                          Min
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatStatNumber(card.min, card.formatter)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="uppercase text-foreground/60 text-[10px]">
                          Moy
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatStatNumber(card.avg, card.formatter)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="uppercase text-foreground/60 text-[10px]">
                          Max
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {formatStatNumber(card.max, card.formatter)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Aucune donnée de performance n&apos;est disponible.
              </p>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
