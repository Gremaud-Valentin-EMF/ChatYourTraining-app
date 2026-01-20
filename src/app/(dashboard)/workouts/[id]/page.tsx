"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge, Button, Spinner } from "@/components/ui";
import { ArrowLeft, BarChart3, ShieldCheck, Activity } from "lucide-react";
import { formatDuration, formatDistance, getSportColor } from "@/lib/utils";
import { getSportIconComponent } from "@/lib/sport-icons";
import type { Json } from "@/types/database";

const focusByIntensity: Record<string, string> = {
  endurance: "Endurance fondamentale",
  tempo: "Développement VMA",
  threshold: "Seuil / tenue de puissance",
  vo2max: "Augmentation de VO2max",
  recovery: "Récupération active",
};

const intensityRpeMap: Record<string, { value: number; description: string }> =
  {
    endurance: { value: 5, description: "Modéré / stable" },
    tempo: { value: 7, description: "Difficile" },
    threshold: { value: 8, description: "Très exigeant" },
    vo2max: { value: 9, description: "Très intense" },
    recovery: { value: 3, description: "Facile / relâché" },
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

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

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
        source,
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
        raw_data: data.raw_data ?? null,
      });
    } else {
      setActivity(null);
    }
    setIsLoading(false);
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
  type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "outline";

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
  const statusVariant: BadgeVariant = statusVariantMap[activity.status] ?? "outline";
  const plannedDuration = activity.planned_duration_minutes;
  const actualDuration = activity.actual_duration_minutes; // This is already a number or null
  const intensityKey = (activity.intensity ?? "endurance").toLowerCase();
  const rpeInfo = intensityRpeMap[intensityKey] ?? {
    value: 6,
    description: "Effort équilibré",
  };
  const focusLabel =
    focusByIntensity[intensityKey] ?? "Approche guidée pour cette séance";
  const rawData = (activity.raw_data as Record<string, unknown> | null) ?? null;
  const calculated = rawData?._calculated as Record<string, unknown> | undefined;
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
    normalizedHeartRate && lthrValue
      ? normalizedHeartRate / lthrValue
      : null;
  const intensityFactor =
    intensityFactorPower ?? intensityFactorHeart ?? null;
  const intensitySource = intensityFactorPower
    ? "Puissance"
    : intensityFactorHeart
    ? "Fréquence cardiaque"
    : undefined;
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
    helper?: string;
    planned?: string | null;
    actual?: string | null;
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
      helper: elapsedTimeSeconds
        ? "Inclut les pauses"
        : "Durée réelle rapportée",
      planned: plannedDurationString,
      actual: actualDurationString,
    },
    {
      label: "Moving time",
      helper: "Temps passé en mouvement",
      actual: actualMovingString,
    },
    {
      label: "Distance",
      helper: "Distance effectuée",
      planned: plannedDistanceString,
      actual: actualDistanceString,
    },
    {
      label: "Moyenne / rythme moyen",
      helper: "Rythme moyen sur la distance parcourue",
      planned: plannedPaceString,
      actual: actualPaceString,
    },
    {
      label: "NP",
      helper: "Normalized Power",
      actual:
        isCycling && normalizedPower
          ? `${Math.round(normalizedPower)} W`
          : null,
    },
    {
      label: "VI",
      helper: "Variation Index (NP / puissance moyenne)",
      actual:
        isCycling && variabilityIndex ? variabilityIndex.toFixed(2) : null,
    },
    {
      label: "Work",
      helper: "Travail énergétique",
      actual:
        isCycling && workKilojoules !== null
          ? `${Math.round(workKilojoules)} kJ`
          : null,
    },
    {
      label: "Calories",
      helper: "Énergie dépensée estimée",
      actual: calories !== null ? `${Math.round(calories)} kcal` : null,
    },
    {
      label: "Dénivelé",
      helper: "Gain d'altitude",
      actual:
        elevationGain !== null ? `${Math.round(elevationGain)} m` : null,
    },
    {
      label: "TSS",
      helper: "Training Stress Score",
      actual:
        activity.tss !== null && activity.tss !== undefined
          ? `${activity.tss}`
          : null,
    },
    {
      label: "IF",
      helper: intensitySource
        ? `Basé sur ${intensitySource}`
        : undefined,
      actual:
        intensityFactor && (isCycling || isRunning)
          ? intensityFactor.toFixed(2)
          : null,
    },
  ].filter((row) => row.planned || row.actual);
  const totalDuration = Math.max(actualDuration ?? plannedDuration ?? 60, 15);
  const warmupMinutes = Math.max(8, Math.round(totalDuration * 0.15));
  const mainMinutes = Math.max(10, Math.round(totalDuration * 0.55));
  const cooldownMinutes = Math.max(
    5,
    totalDuration - warmupMinutes - mainMinutes
  );
  const targetIntensity = Math.min(10, Math.max(3, rpeInfo.value)); // Ensure rpeInfo.value is treated as a number
  const structureSegments = [
    {
      label: "Échauffement",
      intensity: Math.max(2, targetIntensity - 2), // Ensure targetIntensity is a number
      duration: warmupMinutes,
    },
    {
      label: "Blocs ciblés",
      intensity: targetIntensity,
      duration: mainMinutes,
    },
    {
      label: "Retour au calme",
      intensity: Math.max(2, targetIntensity - 3), // Ensure targetIntensity is a number
      duration: cooldownMinutes,
    },
  ];
  const maxStructureIntensity = Math.max(
    ...structureSegments.map((segment) => segment.intensity),
    1
  );
  const compliancePercent =
    typeof plannedDuration === 'number' && typeof actualDuration === 'number' && plannedDuration > 0
      ? Math.min(100, Math.round((actualDuration / plannedDuration) * 100))
      : null;
  const complianceBadgeVariant =
    compliancePercent === null
      ? "outline"
      : compliancePercent >= 95 // Adjusted threshold for 'success'
      ? "success"
      : compliancePercent >= 90
      ? "info"
      : "warning";
  const heartDriftPercent =
    activity.avg_hr && activity.max_hr
      ? Math.round(
          ((activity.max_hr - activity.avg_hr) / activity.avg_hr) * 100 // Ensure avg_hr is not zero
        )
      : null;
  const heartDriftMessage =
    heartDriftPercent !== null
      ? `Ta FC a augmenté de ${heartDriftPercent}% en fin de séance pour la même puissance. Vérifie l'hydratation.`
      : "Données cardio insuffisantes pour mesurer la dérive.";
  const coachComment =
    compliancePercent === null
      ? "Ton coach IA attend plus de données pour analyser la régularité."
      : compliancePercent >= 95 // Adjusted threshold for 'bravo'
      ? "Tu as respecté le plan à la lettre, bravo."
      : compliancePercent >= 85
      ? "Quelques écarts sur la durée mais les blocs restent dans la cible."
      : "Tu t'es un peu écarté du plan ; ajuste la cadence la prochaine fois.";
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
                  <p className="text-xs text-muted uppercase">{date}</p>
                </div>
                <div className="flex flex-row items-center gap-3">
                  <h1 className="text-2xl font-bold">{activity.title}</h1>
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
                <p className="text-sm text-muted">{activity.sport_label}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs uppercase text-muted">
                    Objectif de la séance
                  </span>
                  <span className="font-medium">{focusLabel}</span>
                </div>
              </div>
            </div>
          </header>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Données d&apos;entraînement
              </h3>
              <span className="text-xs uppercase text-muted">
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
                      <p className="text-xs uppercase text-muted">{row.label}</p>
                      {row.helper && (
                        <p className="text-xs text-muted">{row.helper}</p>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs uppercase text-muted">Prévu</p>
                        <p className="text-lg font-semibold">
                          {row.planned ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted">Réalisé</p>
                        <p className="text-lg font-semibold">
                          {row.actual ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Aucune donnée spécifique n&apos;est disponible pour cette séance.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Corps de séance
              </h3>
              <span className="text-xs uppercase text-muted">Structure</span>
            </div>
            <div className="flex items-end gap-3 h-32">
              {structureSegments.map((segment) => (
                <div
                  key={segment.label}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <div className="h-24 w-full rounded-full bg-dark-200">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        height: `${
                          (segment.intensity / maxStructureIntensity) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-center">{segment.label}</p>
                  <p className="text-xs text-muted">{segment.duration} min</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted uppercase">
              <span>RPE</span>
              <span className="font-semibold text-foreground">
                {rpeInfo.value}/10 ({rpeInfo.description})
              </span>
            </div>
          </section>

          {activity.status === "completed" && (
            <section className="space-y-3 border-t border-dark-200 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted uppercase">Compliance</p>
                  <p className="text-lg font-semibold">
                    Respect du plan :{" "}
                    <span className="text-accent">
                      {compliancePercent !== null
                        ? `${compliancePercent}%`
                        : "—"}
                    </span>
                  </p>
                </div>
                <Badge
                    variant={complianceBadgeVariant}
                    className="uppercase text-xs tracking-wide"
                  >
                    {compliancePercent !== null ? `${compliancePercent}%` : "—"}
                  </Badge>
              </div>
              <div className="rounded-2xl border border-dark-200 bg-dark-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase text-muted">
                  <span>Dérive cardiaque</span>
                  <ShieldCheck className="h-4 w-4 text-muted" />
                </div>
                <p className="text-sm">{heartDriftMessage}</p>
              </div>
              <div className="rounded-2xl border border-dark-200 bg-dark-100 p-4 space-y-2">
                <p className="text-xs uppercase text-muted">
                  Commentaire du coach IA
                </p>
                <p className="font-semibold">{coachComment}</p>
              </div>
            </section>
          )}

        </div>
      </Card>
    </div>
  );
}
