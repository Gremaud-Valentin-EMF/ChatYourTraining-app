"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Badge,
  Button,
  Spinner,
  Slider,
  DeleteConfirmationModal,
} from "@/components/ui";
import { ArrowLeft, Activity, Check, Trash, Edit, X, Save } from "lucide-react";
import {
  formatDuration,
  formatDistance,
  getSportColor,
} from "@/lib/utils";
import { getSportIconComponent } from "@/lib/sport-icons";
import type { Json } from "@/types/database";
import { ActivityStreamChart } from "@/components/workouts/activity-stream-chart";
import { FirstVisitRpeModal } from "@/components/workouts/first-visit-rpe-modal";
import { estimateTSSFromRPE } from "@/lib/calculations/training-load";
import { getSportFields } from "@/lib/calculations/manual-activity";
import { recomputeAndStoreTrainingLoad } from "@/lib/calculations/persist-training-load";

const focusByIntensity: Record<string, string> = {
  endurance: "Endurance fondamentale",
  tempo: "Développement VMA",
  threshold: "Seuil / tenue de puissance",
  vo2max: "Augmentation de VO2max",
  recovery: "Récupération active",
};

const intensityOptions = [
  { value: "recovery", label: "Récupération active" },
  { value: "endurance", label: "Endurance fondamentale" },
  { value: "tempo", label: "Développement VMA" },
  { value: "threshold", label: "Seuil / tenue de puissance" },
  { value: "vo2max", label: "Augmentation de VO2max" },
];

// Human label for the TSS calculation method stored in activities.tss_type.
const TSS_TYPE_LABELS: Record<string, string> = {
  tss: "power-based",
  hrtss: "hr-based",
  rpe: "rpe-based",
  estimated: "estimated",
  rtss: "pace-based",
  stss: "swim-based",
};

function tssTypeLabel(tssType: string | null | undefined): string | null {
  if (!tssType) return null;
  return TSS_TYPE_LABELS[tssType] ?? tssType;
}

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
  tss_type: string | null;
  intensity: string | null;
  source: string;
  description: string | null;
  rpe: number | null;
  raw_data: Json | null;
  first_viewed_at: string | null;
}

const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export default function WorkoutDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const router = useRouter();

  // US-13: keep the stored CTL/ATL/TSB series in sync after any mutation that
  // changes a completed activity's TSS, status or date.
  const refreshTrainingLoad = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await recomputeAndStoreTrainingLoad(supabase, user.id);
  };
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ftpWatts, setFtpWatts] = useState<number | null>(null);
  const [lthrValue, setLthrValue] = useState<number | null>(null);
  const [rpeInput, setRpeInput] = useState<number>(0);
  const [isSavingRpe, setIsSavingRpe] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isTssInlineEditing, setIsTssInlineEditing] = useState(false);
  const [isPlannedDurationInlineEditing, setIsPlannedDurationInlineEditing] =
    useState(false);
  const [isPlannedDistanceInlineEditing, setIsPlannedDistanceInlineEditing] =
    useState(false);
  const [isPlannedPaceInlineEditing, setIsPlannedPaceInlineEditing] =
    useState(false);
  const [isPlannedMovingTimeInlineEditing, setIsPlannedMovingTimeInlineEditing] =
    useState(false);
  const [isPlannedElevationInlineEditing, setIsPlannedElevationInlineEditing] =
    useState(false);
  const [isPlannedTssInlineEditing, setIsPlannedTssInlineEditing] =
    useState(false);
  const [isPlannedIfInlineEditing, setIsPlannedIfInlineEditing] =
    useState(false);
  const [isIfInlineEditing, setIsIfInlineEditing] = useState(false);
  const [isTitleInlineEditing, setIsTitleInlineEditing] = useState(false);
  const [isIntensityInlineEditing, setIsIntensityInlineEditing] =
    useState(false);
  const intensityMenuRef = useRef<HTMLDivElement>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSportInlineEditing, setIsSportInlineEditing] = useState(false);
  const sportMenuRef = useRef<HTMLDivElement>(null);
  const [streamData, setStreamData] = useState<{
    time?: number[] | null;
    heartrate?: number[] | null;
    power?: number[] | null;
  } | null>(null);
  const [userSports, setUserSports] = useState<
    Array<{ id: string; name: string; name_fr: string }>
  >([]);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    intensity: "",
    tss: "",
    sport_id: "" as string | null,
    planned_duration_minutes: "",
    planned_distance_km: "",
    planned_pace_min_km: "",
    planned_moving_time_minutes: "",
    planned_elevation_m: "",
    planned_tss: "",
    planned_if: "",
    if_value: "",
  });
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFirstVisitRpeModalOpen, setIsFirstVisitRpeModalOpen] = useState(false);

  const parseStreamArray = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) return null;
    const numeric = value
      .map((item) => (typeof item === "number" ? item : Number(item)))
      .filter((item) => Number.isFinite(item));
    return numeric.length > 0 ? numeric : null;
  };

  useEffect(() => {
    loadActivity();
    loadUserSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (activity) {
      const raw = (activity.raw_data as Record<string, unknown> | null) ?? null;
      const manual =
        raw && typeof raw._manual === "object"
          ? (raw._manual as Record<string, unknown>)
          : null;
      const manualPlannedPaceSeconds =
        typeof manual?.planned_pace_seconds === "number"
          ? manual.planned_pace_seconds
          : null;
      const derivedPlannedPaceSeconds =
        activity.planned_duration_minutes !== null &&
        activity.planned_duration_minutes !== undefined &&
        activity.planned_distance_km !== null &&
        activity.planned_distance_km !== undefined &&
        activity.planned_distance_km > 0
          ? (activity.planned_duration_minutes * 60) / activity.planned_distance_km
          : null;
      const paceSecondsForEdit =
        manualPlannedPaceSeconds ?? derivedPlannedPaceSeconds;
      const manualIfValue =
        typeof manual?.if_override === "number" ? manual.if_override : null;
      const manualPlannedMovingTime =
        typeof manual?.planned_moving_time_minutes === "number"
          ? manual.planned_moving_time_minutes
          : null;
      const manualPlannedElevation =
        typeof manual?.planned_elevation_m === "number"
          ? manual.planned_elevation_m
          : null;
      const manualPlannedTss =
        typeof manual?.planned_tss === "number" ? manual.planned_tss : null;
      const manualPlannedIf =
        typeof manual?.planned_if === "number" ? manual.planned_if : null;
      setEditForm({
        title: activity.title,
        description: activity.description ?? "",
        intensity: activity.intensity ?? "endurance",
        tss: activity.tss?.toString() || "",
        sport_id: activity.sport_id || "",
        planned_duration_minutes: activity.planned_duration_minutes?.toString() || "",
        planned_distance_km: activity.planned_distance_km?.toString() || "",
        planned_pace_min_km:
          paceSecondsForEdit !== null ? (paceSecondsForEdit / 60).toFixed(2) : "",
        planned_moving_time_minutes: manualPlannedMovingTime?.toString() || "",
        planned_elevation_m: manualPlannedElevation?.toString() || "",
        planned_tss: manualPlannedTss?.toString() || "",
        planned_if: manualPlannedIf?.toFixed(2) || "",
        if_value: manualIfValue?.toFixed(2) || "",
      });
      setRpeInput(activity.rpe ?? 0);
    }
  }, [activity]);

  const loadUserSports = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_sports")
        .select("sport_id, sports(id, name, name_fr)")
        .eq("user_id", user.id);

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedSports = (data as any).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (us: any) => us.sports
        )
          .filter(Boolean)
          .sort(
            (
              a: { id: string; name: string; name_fr: string },
              b: { id: string; name: string; name_fr: string }
            ) =>
              (a.name_fr || a.name).localeCompare(b.name_fr || b.name, "fr")
          );
        setUserSports(mappedSports);
      }
    } catch (error) {
      console.error("Error loading user sports:", error);
    }
  };

  useEffect(() => {
    if (!isIntensityInlineEditing) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        intensityMenuRef.current &&
        !intensityMenuRef.current.contains(event.target as Node)
      ) {
        setIsIntensityInlineEditing(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsIntensityInlineEditing(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isIntensityInlineEditing]);

  useEffect(() => {
    if (!isSportInlineEditing) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        sportMenuRef.current &&
        !sportMenuRef.current.contains(event.target as Node)
      ) {
        setIsSportInlineEditing(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSportInlineEditing(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSportInlineEditing]);

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
        tss_type,
        intensity,
        rpe,
        source,
        description,
        avg_power_watts,
        raw_data,
        first_viewed_at
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
        tss_type: data.tss_type ?? null,
        intensity: data.intensity,
        source: data.source,
        rpe: data.rpe ?? null,
        raw_data: data.raw_data ?? null,
        first_viewed_at: data.first_viewed_at ?? null,
      });

      // Check if this is the first visit to a completed activity
      const isFirstVisit = !data.first_viewed_at && data.status === "completed";
      if (isFirstVisit) {
        // Mark as viewed immediately
        await supabase
          .from("activities")
          .update({ first_viewed_at: new Date().toISOString() })
          .eq("id", data.id);

        // Show RPE modal
        setIsFirstVisitRpeModalOpen(true);
      }

      const { data: streamRows } = await supabase
        .from("activity_streams")
        .select("data_type, values")
        .eq("activity_id", data.id);

      const streamMap = new Map<string, number[]>();
      if (streamRows) {
        for (const row of streamRows) {
          const parsed = parseStreamArray(row.values);
          if (parsed) {
            streamMap.set(row.data_type, parsed);
          }
        }
      }

      const rawStreams =
        (data.raw_data as Record<string, unknown> | null)?._streams as
          | Record<string, unknown>
          | undefined;

      setStreamData({
        time: streamMap.get("time") ?? parseStreamArray(rawStreams?.time),
        heartrate:
          streamMap.get("heartrate") ??
          parseStreamArray(rawStreams?.heartrate),
        power: streamMap.get("power") ?? parseStreamArray(rawStreams?.power),
      });
    } else {
      setActivity(null);
      setStreamData(null);
    }
    setIsLoading(false);
  };

  const handleMarkAsDone = async () => {
    if (!activity) return;
    const scheduledDate = parseLocalDate(activity.scheduled_date);
    scheduledDate.setHours(0, 0, 0, 0);
    if (activity.status !== "planned" || scheduledDate.getTime() > today.getTime())
      return;

    setIsMarkingDone(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("activities")
        .update({
          status: "completed",
          actual_duration_minutes:
            activity.actual_duration_minutes ?? activity.planned_duration_minutes,
          actual_distance_km:
            activity.actual_distance_km ?? activity.planned_distance_km,
        })
        .eq("id", activity.id)
        .eq("user_id", user.id);

      setActivity((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              actual_duration_minutes:
                prev.actual_duration_minutes ?? prev.planned_duration_minutes ?? null,
              actual_distance_km:
                prev.actual_distance_km ?? prev.planned_distance_km ?? null,
            }
          : prev
      );
      await refreshTrainingLoad();
    } catch (error) {
      console.error("Error marking activity as done:", error);
    } finally {
      setIsMarkingDone(false);
    }
  };

  const openDeleteModal = () => setIsDeleteModalOpen(true);

  const handleRpeSave = async () => {
    if (!activity) return;
    setIsSavingRpe(true);
    const nextRpe = Math.min(10, Math.max(0, Math.round(rpeInput)));
    const updateFields: Record<string, unknown> = { rpe: nextRpe };

    const canOverrideTss = !activity.tss_type || activity.tss_type === "estimated";
    const durationSec = (activity.actual_duration_minutes ?? activity.planned_duration_minutes ?? 0) * 60;
    if (canOverrideTss && nextRpe >= 1 && durationSec > 0) {
      updateFields.tss = estimateTSSFromRPE({ rpe: nextRpe, durationSeconds: durationSec });
      updateFields.tss_type = "rpe";
    }

    const { error } = await supabase
      .from("activities")
      .update(updateFields)
      .eq("id", activity.id);
    setIsSavingRpe(false);
    if (!error) {
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              rpe: nextRpe,
              ...(updateFields.tss !== undefined
                ? { tss: updateFields.tss as number, tss_type: "rpe" }
                : {}),
            }
          : prev
      );
      if (updateFields.tss !== undefined) await refreshTrainingLoad();
    }
  };

  const handleFirstVisitRpeSave = async (data: {
    rpe: number;
    comment: string;
  }) => {
    if (!activity) return;

    try {
      const updateFields: Record<string, unknown> = { rpe: data.rpe };
      const canOverrideTss = !activity.tss_type || activity.tss_type === "estimated";
      const durationSec = (activity.actual_duration_minutes ?? activity.planned_duration_minutes ?? 0) * 60;
      if (canOverrideTss && data.rpe >= 1 && durationSec > 0) {
        updateFields.tss = estimateTSSFromRPE({ rpe: data.rpe, durationSeconds: durationSec });
        updateFields.tss_type = "rpe";
      }

      await supabase
        .from("activities")
        .update(updateFields)
        .eq("id", activity.id);

      const tssOverride = updateFields.tss !== undefined
        ? { tss: updateFields.tss as number, tss_type: "rpe" as const }
        : {};

      // Append comment to description if provided
      if (data.comment.trim()) {
        const currentDescription = activity.description || "";
        const separator = currentDescription ? "\n\n---\n\n" : "";
        const newDescription = `${currentDescription}${separator}**Ressenti:** ${data.comment.trim()}`;

        await supabase
          .from("activities")
          .update({ description: newDescription })
          .eq("id", activity.id);

        setActivity((prev) =>
          prev
            ? { ...prev, rpe: data.rpe, description: newDescription, ...tssOverride }
            : prev
        );
      } else {
        setActivity((prev) =>
          prev
            ? { ...prev, rpe: data.rpe, ...tssOverride }
            : prev
        );
      }

      setRpeInput(data.rpe);
      if (updateFields.tss !== undefined) await refreshTrainingLoad();
    } catch (error) {
      console.error("Error saving first visit RPE:", error);
      throw error;
    }
  };

  const handleDeleteActivity = async () => {
    if (!activity) return;
    setIsDeleting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("activities")
        .delete()
        .eq("id", activity.id)
        .eq("user_id", user.id);

      await recomputeAndStoreTrainingLoad(supabase, user.id);

      setIsDeleteModalOpen(false);
      router.push("/workouts");
    } catch (error) {
      console.error("Error deleting activity:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEdit = () => {
    if (activity) {
      const raw = (activity.raw_data as Record<string, unknown> | null) ?? null;
      const manual =
        raw && typeof raw._manual === "object"
          ? (raw._manual as Record<string, unknown>)
          : null;
      const manualPlannedPaceSeconds =
        typeof manual?.planned_pace_seconds === "number"
          ? manual.planned_pace_seconds
          : null;
      const derivedPlannedPaceSeconds =
        activity.planned_duration_minutes !== null &&
        activity.planned_duration_minutes !== undefined &&
        activity.planned_distance_km !== null &&
        activity.planned_distance_km !== undefined &&
        activity.planned_distance_km > 0
          ? (activity.planned_duration_minutes * 60) / activity.planned_distance_km
          : null;
      const paceSecondsForEdit =
        manualPlannedPaceSeconds ?? derivedPlannedPaceSeconds;
      const manualIfValue =
        typeof manual?.if_override === "number" ? manual.if_override : null;
      const manualPlannedMovingTime =
        typeof manual?.planned_moving_time_minutes === "number"
          ? manual.planned_moving_time_minutes
          : null;
      const manualPlannedElevation =
        typeof manual?.planned_elevation_m === "number"
          ? manual.planned_elevation_m
          : null;
      const manualPlannedTss =
        typeof manual?.planned_tss === "number" ? manual.planned_tss : null;
      const manualPlannedIf =
        typeof manual?.planned_if === "number" ? manual.planned_if : null;
      setEditForm({
        title: activity.title,
        description: activity.description ?? "",
        intensity: activity.intensity ?? "endurance",
        tss: activity.tss?.toString() || "",
        sport_id: activity.sport_id || "",
        planned_duration_minutes: activity.planned_duration_minutes?.toString() || "",
        planned_distance_km: activity.planned_distance_km?.toString() || "",
        planned_pace_min_km:
          paceSecondsForEdit !== null ? (paceSecondsForEdit / 60).toFixed(2) : "",
        planned_moving_time_minutes: manualPlannedMovingTime?.toString() || "",
        planned_elevation_m: manualPlannedElevation?.toString() || "",
        planned_tss: manualPlannedTss?.toString() || "",
        planned_if: manualPlannedIf?.toFixed(2) || "",
        if_value: manualIfValue?.toFixed(2) || "",
      });
    }
    setIsTssInlineEditing(false);
    setIsPlannedDurationInlineEditing(false);
    setIsPlannedDistanceInlineEditing(false);
    setIsPlannedPaceInlineEditing(false);
    setIsPlannedMovingTimeInlineEditing(false);
    setIsPlannedElevationInlineEditing(false);
    setIsPlannedTssInlineEditing(false);
    setIsPlannedIfInlineEditing(false);
    setIsIfInlineEditing(false);
    setIsTitleInlineEditing(false);
    setIsIntensityInlineEditing(false);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (activity) {
      const raw = (activity.raw_data as Record<string, unknown> | null) ?? null;
      const manual =
        raw && typeof raw._manual === "object"
          ? (raw._manual as Record<string, unknown>)
          : null;
      const manualPlannedPaceSeconds =
        typeof manual?.planned_pace_seconds === "number"
          ? manual.planned_pace_seconds
          : null;
      const derivedPlannedPaceSeconds =
        activity.planned_duration_minutes !== null &&
        activity.planned_duration_minutes !== undefined &&
        activity.planned_distance_km !== null &&
        activity.planned_distance_km !== undefined &&
        activity.planned_distance_km > 0
          ? (activity.planned_duration_minutes * 60) / activity.planned_distance_km
          : null;
      const paceSecondsForEdit =
        manualPlannedPaceSeconds ?? derivedPlannedPaceSeconds;
      const manualIfValue =
        typeof manual?.if_override === "number" ? manual.if_override : null;
      const manualPlannedMovingTime =
        typeof manual?.planned_moving_time_minutes === "number"
          ? manual.planned_moving_time_minutes
          : null;
      const manualPlannedElevation =
        typeof manual?.planned_elevation_m === "number"
          ? manual.planned_elevation_m
          : null;
      const manualPlannedTss =
        typeof manual?.planned_tss === "number" ? manual.planned_tss : null;
      const manualPlannedIf =
        typeof manual?.planned_if === "number" ? manual.planned_if : null;
      setEditForm({
        title: activity.title,
        description: activity.description ?? "",
        intensity: activity.intensity ?? "endurance",
        tss: activity.tss?.toString() || "",
        sport_id: activity.sport_id || "",
        planned_duration_minutes: activity.planned_duration_minutes?.toString() || "",
        planned_distance_km: activity.planned_distance_km?.toString() || "",
        planned_pace_min_km:
          paceSecondsForEdit !== null ? (paceSecondsForEdit / 60).toFixed(2) : "",
        planned_moving_time_minutes: manualPlannedMovingTime?.toString() || "",
        planned_elevation_m: manualPlannedElevation?.toString() || "",
        planned_tss: manualPlannedTss?.toString() || "",
        planned_if: manualPlannedIf?.toFixed(2) || "",
        if_value: manualIfValue?.toFixed(2) || "",
      });
    }
    setIsTssInlineEditing(false);
    setIsPlannedDurationInlineEditing(false);
    setIsPlannedDistanceInlineEditing(false);
    setIsPlannedPaceInlineEditing(false);
    setIsPlannedMovingTimeInlineEditing(false);
    setIsPlannedElevationInlineEditing(false);
    setIsPlannedTssInlineEditing(false);
    setIsPlannedIfInlineEditing(false);
    setIsIfInlineEditing(false);
    setIsTitleInlineEditing(false);
    setIsIntensityInlineEditing(false);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!activity) return;
    setIsSavingEdit(true);
    try {
      const parsedTss =
        editForm.tss.trim() === "" ? null : Math.max(0, Number(editForm.tss));
      const parsedPlannedDuration =
        editForm.planned_duration_minutes.trim() === ""
          ? null
          : Math.max(0, Math.round(Number(editForm.planned_duration_minutes)));
      const parsedPlannedDistance =
        editForm.planned_distance_km.trim() === ""
          ? null
          : Math.max(0, Number(editForm.planned_distance_km));
      const parsedPlannedPaceMinKm =
        editForm.planned_pace_min_km.trim() === ""
          ? null
          : Math.max(0, Number(editForm.planned_pace_min_km));
      const parsedIfValue =
        editForm.if_value.trim() === ""
          ? null
          : Math.max(0, Number(editForm.if_value));
      const parsedPlannedMovingTime =
        editForm.planned_moving_time_minutes.trim() === ""
          ? null
          : Math.max(0, Math.round(Number(editForm.planned_moving_time_minutes)));
      const parsedPlannedElevation =
        editForm.planned_elevation_m.trim() === ""
          ? null
          : Math.max(0, Math.round(Number(editForm.planned_elevation_m)));
      const parsedPlannedTss =
        editForm.planned_tss.trim() === ""
          ? null
          : Math.max(0, Math.round(Number(editForm.planned_tss)));
      const parsedPlannedIf =
        editForm.planned_if.trim() === ""
          ? null
          : Math.max(0, Number(editForm.planned_if));
      const currentRawData =
        (activity.raw_data as Record<string, unknown> | null) ?? null;
      const currentManual =
        currentRawData && typeof currentRawData._manual === "object"
          ? (currentRawData._manual as Record<string, unknown>)
          : {};
      const nextManual = {
        ...currentManual,
        planned_pace_seconds:
          parsedPlannedPaceMinKm !== null && Number.isFinite(parsedPlannedPaceMinKm)
            ? Math.round(parsedPlannedPaceMinKm * 60)
            : null,
        planned_moving_time_minutes:
          parsedPlannedMovingTime !== null &&
          Number.isFinite(parsedPlannedMovingTime)
            ? parsedPlannedMovingTime
            : null,
        planned_elevation_m:
          parsedPlannedElevation !== null && Number.isFinite(parsedPlannedElevation)
            ? parsedPlannedElevation
            : null,
        planned_tss:
          parsedPlannedTss !== null && Number.isFinite(parsedPlannedTss)
            ? parsedPlannedTss
            : null,
        planned_if:
          parsedPlannedIf !== null && Number.isFinite(parsedPlannedIf)
            ? Number(parsedPlannedIf.toFixed(2))
            : null,
        if_override:
          parsedIfValue !== null && Number.isFinite(parsedIfValue)
            ? Number(parsedIfValue.toFixed(2))
            : null,
      };
      const nextRawData = {
        ...(currentRawData ?? {}),
        _manual: nextManual,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        title: editForm.title,
        description: editForm.description || null,
        intensity: editForm.intensity,
        planned_duration_minutes:
          parsedPlannedDuration !== null && Number.isFinite(parsedPlannedDuration)
            ? parsedPlannedDuration
            : null,
        planned_distance_km:
          parsedPlannedDistance !== null && Number.isFinite(parsedPlannedDistance)
            ? parsedPlannedDistance
            : null,
        tss:
          parsedTss !== null && Number.isFinite(parsedTss)
            ? parsedTss
            : null,
        raw_data: nextRawData as Json,
      };

      if (editForm.sport_id) {
        updatePayload.sport_id = editForm.sport_id;
      }

      const { error } = await supabase
        .from("activities")
        .update(updatePayload)
        .eq("id", activity.id);

      if (!error) {
        setActivity((prev) =>
          prev
            ? {
                ...prev,
                title: editForm.title,
                description: editForm.description || null,
                intensity: editForm.intensity,
                planned_duration_minutes:
                  parsedPlannedDuration !== null &&
                  Number.isFinite(parsedPlannedDuration)
                    ? parsedPlannedDuration
                    : null,
                planned_distance_km:
                  parsedPlannedDistance !== null &&
                  Number.isFinite(parsedPlannedDistance)
                    ? parsedPlannedDistance
                    : null,
                tss:
                  parsedTss !== null && Number.isFinite(parsedTss)
                    ? parsedTss
                    : null,
                raw_data: nextRawData as Json,
              }
            : prev
        );
        setIsTssInlineEditing(false);
        setIsPlannedDurationInlineEditing(false);
        setIsPlannedDistanceInlineEditing(false);
        setIsPlannedPaceInlineEditing(false);
        setIsPlannedMovingTimeInlineEditing(false);
        setIsPlannedElevationInlineEditing(false);
        setIsPlannedTssInlineEditing(false);
        setIsPlannedIfInlineEditing(false);
        setIsIfInlineEditing(false);
        setIsTitleInlineEditing(false);
        setIsIntensityInlineEditing(false);
        setIsEditing(false);
        await refreshTrainingLoad();
      }
    } catch (error) {
      console.error("Error updating activity:", error);
    } finally {
      setIsSavingEdit(false);
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
  const scheduledDateLocal = parseLocalDate(activity.scheduled_date);
  const date = scheduledDateLocal.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const normalizedScheduled = new Date(scheduledDateLocal);
  normalizedScheduled.setHours(0, 0, 0, 0);
  const canMarkAsDone =
    activity.status === "planned" && normalizedScheduled <= today;
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
  const editIntensityKey = (editForm.intensity ?? "endurance").toLowerCase();
  const editFocusLabel =
    focusByIntensity[editIntensityKey] ?? "Approche guidée pour cette séance";
  const rawData = (activity.raw_data as Record<string, unknown> | null) ?? null;
  const manualData =
    rawData && typeof rawData._manual === "object"
      ? (rawData._manual as Record<string, unknown>)
      : null;
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
  // Per-sport field model (distance/elevation/pace/power/hr) drives which metrics
  // are relevant for this activity's sport. `power` covers cycling AND VTT.
  const sportFields = getSportFields(activity.sport_name);
  const isCycling = sportFields.power;
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
  const computedIntensityFactor =
    intensityFactorPower ?? intensityFactorHeart ?? null;
  const manualIfOverride =
    typeof manualData?.if_override === "number"
      ? manualData.if_override
      : null;
  const manualPlannedMovingTime =
    typeof manualData?.planned_moving_time_minutes === "number"
      ? manualData.planned_moving_time_minutes
      : null;
  const manualPlannedElevation =
    typeof manualData?.planned_elevation_m === "number"
      ? manualData.planned_elevation_m
      : null;
  const manualPlannedTss =
    typeof manualData?.planned_tss === "number" ? manualData.planned_tss : null;
  const manualPlannedIf =
    typeof manualData?.planned_if === "number" ? manualData.planned_if : null;
  const intensityFactor = manualIfOverride ?? computedIntensityFactor ?? null;
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

  const plannedDurationMinutes = isEditing
    ? editForm.planned_duration_minutes.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(editForm.planned_duration_minutes)))
    : activity.planned_duration_minutes;
  const plannedDistanceKm = isEditing
    ? editForm.planned_distance_km.trim() === ""
      ? null
      : Math.max(0, Number(editForm.planned_distance_km))
    : activity.planned_distance_km;
  const plannedDurationString =
    typeof plannedDurationMinutes === "number"
      ? formatDurationValue(plannedDurationMinutes)
      : null;
  const plannedDistanceString =
    typeof plannedDistanceKm === "number"
      ? formatDistance(plannedDistanceKm)
      : null;
  const derivedPlannedPaceSeconds =
    typeof plannedDurationMinutes === "number" &&
    typeof plannedDistanceKm === "number" &&
    plannedDistanceKm > 0
      ? (plannedDurationMinutes * 60) / plannedDistanceKm
      : null;
  const manualPlannedPaceSeconds =
    typeof manualData?.planned_pace_seconds === "number"
      ? manualData.planned_pace_seconds
      : null;
  const editedPlannedPaceSeconds =
    editForm.planned_pace_min_km.trim() === ""
      ? null
      : Math.max(0, Number(editForm.planned_pace_min_km) * 60);
  const plannedPaceSeconds = isEditing
    ? editedPlannedPaceSeconds ?? derivedPlannedPaceSeconds
    : manualPlannedPaceSeconds ?? derivedPlannedPaceSeconds;
  const plannedPaceString =
    plannedPaceSeconds !== null ? formatPaceValue(plannedPaceSeconds) : null;
  const plannedMovingTimeMinutes = isEditing
    ? editForm.planned_moving_time_minutes.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(editForm.planned_moving_time_minutes)))
    : manualPlannedMovingTime;
  const plannedMovingTimeString =
    plannedMovingTimeMinutes !== null
      ? formatDurationValue(plannedMovingTimeMinutes)
      : null;
  const plannedElevation = isEditing
    ? editForm.planned_elevation_m.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(editForm.planned_elevation_m)))
    : manualPlannedElevation;
  const plannedTss = isEditing
    ? editForm.planned_tss.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(editForm.planned_tss)))
    : manualPlannedTss;
  const plannedIf = isEditing
    ? editForm.planned_if.trim() === ""
      ? null
      : Math.max(0, Number(editForm.planned_if))
    : manualPlannedIf;
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

  const displayedTss = isEditing
    ? editForm.tss.trim() === ""
      ? null
      : Math.max(0, Number(editForm.tss))
    : activity.tss;
  const displayedIf = isEditing
    ? editForm.if_value.trim() === ""
      ? intensityFactor
      : Math.max(0, Number(editForm.if_value))
    : intensityFactor;

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
      planned: plannedMovingTimeString,
      actual: actualMovingString,
      plannedRaw: plannedMovingTimeMinutes,
      actualRaw: movingMinutesValue,
    },
    {
      label: "Distance",
      planned: sportFields.distance ? plannedDistanceString : null,
      actual: sportFields.distance ? actualDistanceString : null,
      plannedRaw:
        typeof plannedDistanceKm === "number" ? plannedDistanceKm : null,
      actualRaw: distanceKm,
    },
    {
      // Pace ("rythme") only makes sense for running.
      label: "Moyenne / rythme moyen",
      planned: sportFields.pace ? plannedPaceString : null,
      actual: sportFields.pace ? actualPaceString : null,
      plannedRaw: plannedPaceSeconds,
      actualRaw: averagePaceSeconds,
    },
    {
      label: "Puissance moyenne",
      actual:
        isCycling && activity.avg_power_watts
          ? `${Math.round(activity.avg_power_watts)} W`
          : null,
      actualRaw: activity.avg_power_watts,
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
      planned:
        sportFields.elevation && plannedElevation !== null
          ? `${Math.round(plannedElevation)} m`
          : null,
      actual:
        sportFields.elevation && elevationGain !== null
          ? `${Math.round(elevationGain)} m`
          : null,
      plannedRaw: plannedElevation,
      actualRaw: elevationGain,
    },
    {
      label: "TSS",
      planned: plannedTss !== null ? `${Math.round(plannedTss)}` : null,
      actual:
        displayedTss !== null && displayedTss !== undefined
          ? `${displayedTss}`
          : null,
      plannedRaw: plannedTss,
      actualRaw: displayedTss,
    },
    {
      label: "IF",
      planned: plannedIf !== null ? plannedIf.toFixed(2) : null,
      actual:
        displayedIf !== null && displayedIf !== undefined
          ? displayedIf.toFixed(2)
          : null,
      plannedRaw: plannedIf,
      actualRaw: displayedIf,
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

  const hasStreamData =
    Boolean(streamData?.heartrate && streamData.heartrate.length > 0) ||
    Boolean(streamData?.power && streamData.power.length > 0);
  const resolvedStreamData = streamData ?? {
    time: null,
    heartrate: null,
    power: null,
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour
      </button>

      <Card>
        <div className="space-y-6">
          <header className="border-b border-dark-200 pb-4 space-y-3">
            <div className="flex items-start gap-4">
              <div
                className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ backgroundColor: sportColor }}
              >
                <SportIcon className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="flex-1 space-y-1">
                <div>
                  <p className="text-xs uppercase text-foreground/60">{date}</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {isEditing ? (
                    isTitleInlineEditing ? (
                      <input
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        onBlur={() => setIsTitleInlineEditing(false)}
                        className="w-full max-w-md border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-2xl font-bold text-foreground focus:outline-none focus:border-accent"
                        placeholder="Titre de la séance"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsTitleInlineEditing(true)}
                        className="text-2xl font-bold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                      >
                        {editForm.title || activity.title || "—"}
                      </button>
                    )
                  ) : (
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                      {activity.title}
                    </h1>
                  )}
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
                {isEditing ? (
                  <div className="relative" ref={sportMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsSportInlineEditing((prev) => !prev)}
                      className="text-sm text-foreground/70 underline underline-offset-2 decoration-dotted hover:text-foreground transition-colors"
                    >
                      {editForm.sport_id
                        ? userSports.find((s) => s.id === editForm.sport_id)
                            ?.name_fr ||
                          userSports.find((s) => s.id === editForm.sport_id)?.name ||
                          activity.sport_label
                        : activity.sport_label}
                    </button>
                    {isSportInlineEditing && (
                      <div className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-dark-200 bg-dark-100/95 backdrop-blur-sm shadow-2xl">
                        {userSports.map((sport, index) => {
                          const isSelected = editForm.sport_id === sport.id;
                          return (
                            <button
                              key={sport.id}
                              type="button"
                              onClick={() => {
                                setEditForm((prev) => ({
                                  ...prev,
                                  sport_id: sport.id,
                                }));
                                setIsSportInlineEditing(false);
                              }}
                              className={
                                "w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 " +
                                (index === 0 ? "rounded-t-2xl " : "") +
                                (index === userSports.length - 1 ? "rounded-b-2xl " : "") +
                                (isSelected
                                  ? "bg-accent/20 text-accent shadow-inner"
                                  : "text-foreground hover:bg-dark-200 hover:text-accent")
                              }
                            >
                              <span className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="flex h-4 w-4 items-center justify-center">
                                    <span className="h-2 w-2 rounded-full bg-accent" />
                                  </span>
                                )}
                                {!isSelected && <span className="w-4" />}
                                {sport.name_fr || sport.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/70">
                    {activity.sport_label}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs uppercase text-foreground/60">
                    Objectif de la séance
                  </span>
                  {isEditing ? (
                    <div className="relative" ref={intensityMenuRef}>
                      <button
                        type="button"
                        onClick={() =>
                          setIsIntensityInlineEditing((prev) => !prev)
                        }
                        className="font-medium text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                      >
                        {editFocusLabel}
                      </button>
                      {isIntensityInlineEditing && (
                        <div className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-dark-200 bg-dark-100/95 backdrop-blur-sm shadow-2xl">
                          {intensityOptions.map((option, index) => {
                            const isSelected = editForm.intensity === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setEditForm((prev) => ({
                                    ...prev,
                                    intensity: option.value,
                                  }));
                                  setIsIntensityInlineEditing(false);
                                }}
                                className={
                                  "w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 " +
                                  (index === 0 ? "rounded-t-2xl " : "") +
                                  (index === intensityOptions.length - 1 ? "rounded-b-2xl " : "") +
                                  (isSelected
                                    ? "bg-accent/20 text-accent shadow-inner"
                                    : "text-foreground hover:bg-dark-200 hover:text-accent")
                                }
                              >
                                <span className="flex items-center gap-2">
                                  {isSelected && (
                                    <span className="flex h-4 w-4 items-center justify-center">
                                      <span className="h-2 w-2 rounded-full bg-accent" />
                                    </span>
                                  )}
                                  {!isSelected && <span className="w-4" />}
                                  {option.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="font-medium text-foreground">
                      {focusLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {(activity.description || isEditing) && (
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
                {isEditing ? (
                  <textarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-dark-200 bg-dark-100/50 px-4 py-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                    rows={3}
                    placeholder="Description de la séance (optionnel)"
                  />
                ) : (
                  <div className="rounded-2xl border border-dark-200 bg-dark-100/50 px-4 py-3 text-sm text-foreground/70">
                    {activity.description}
                  </div>
                )}
              </section>
            )}
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-2">
              {isEditing ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveEdit}
                    isLoading={isSavingEdit}
                    leftIcon={<Save className="h-4 w-4" />}
                    className="w-full sm:w-auto"
                  >
                    Enregistrer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSavingEdit}
                    leftIcon={<X className="h-4 w-4" />}
                    className="w-full sm:w-auto"
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <>
                  {canMarkAsDone && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleMarkAsDone}
                      isLoading={isMarkingDone}
                      leftIcon={<Check className="h-4 w-4" />}
                      className="w-full sm:w-auto"
                    >
                      Marquer comme fait
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStartEdit}
                    leftIcon={<Edit className="h-4 w-4" />}
                    className="w-full sm:w-auto"
                  >
                    Modifier
                  </Button>
                </>
              )}
            </div>
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
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs uppercase text-foreground/60">
                          Prévu
                        </p>
                        {isEditing && row.label === "Durée totale" ? (
                          isPlannedDurationInlineEditing ? (
                            <input
                              id="planned-duration-input"
                              type="number"
                              min={0}
                              step={1}
                              value={editForm.planned_duration_minutes}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_duration_minutes: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                setIsPlannedDurationInlineEditing(false)
                              }
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setIsPlannedDurationInlineEditing(true)
                              }
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "Distance" ? (
                          isPlannedDistanceInlineEditing ? (
                            <input
                              id="planned-distance-input"
                              type="number"
                              min={0}
                              step={0.01}
                              value={editForm.planned_distance_km}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_distance_km: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                setIsPlannedDistanceInlineEditing(false)
                              }
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setIsPlannedDistanceInlineEditing(true)
                              }
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "Moyenne / rythme moyen" ? (
                          isPlannedPaceInlineEditing ? (
                            <input
                              id="planned-pace-input"
                              type="number"
                              min={0}
                              step={0.01}
                              value={editForm.planned_pace_min_km}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_pace_min_km: e.target.value,
                                }))
                              }
                              onBlur={() => setIsPlannedPaceInlineEditing(false)}
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsPlannedPaceInlineEditing(true)}
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "Moving time" ? (
                          isPlannedMovingTimeInlineEditing ? (
                            <input
                              id="planned-moving-time-input"
                              type="number"
                              min={0}
                              step={1}
                              value={editForm.planned_moving_time_minutes}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_moving_time_minutes: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                setIsPlannedMovingTimeInlineEditing(false)
                              }
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsPlannedMovingTimeInlineEditing(true)}
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "Dénivelé" ? (
                          isPlannedElevationInlineEditing ? (
                            <input
                              id="planned-elevation-input"
                              type="number"
                              min={0}
                              step={1}
                              value={editForm.planned_elevation_m}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_elevation_m: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                setIsPlannedElevationInlineEditing(false)
                              }
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsPlannedElevationInlineEditing(true)}
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "TSS" ? (
                          isPlannedTssInlineEditing ? (
                            <input
                              id="planned-tss-input"
                              type="number"
                              min={0}
                              step={1}
                              value={editForm.planned_tss}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_tss: e.target.value,
                                }))
                              }
                              onBlur={() => setIsPlannedTssInlineEditing(false)}
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsPlannedTssInlineEditing(true)}
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : isEditing && row.label === "IF" ? (
                          isPlannedIfInlineEditing ? (
                            <input
                              id="planned-if-input"
                              type="number"
                              min={0}
                              step={0.01}
                              value={editForm.planned_if}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  planned_if: e.target.value,
                                }))
                              }
                              onBlur={() => setIsPlannedIfInlineEditing(false)}
                              autoFocus
                              className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsPlannedIfInlineEditing(true)}
                              className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                            >
                              {formatComparisonValue(row.planned, row.plannedRaw)}
                            </button>
                          )
                        ) : (
                          <p className="text-lg font-semibold text-foreground">
                            {formatComparisonValue(row.planned, row.plannedRaw)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase text-foreground/60">
                          Réalisé
                        </p>
                        {(row.label === "TSS" || row.label === "IF") && isEditing ? (
                          <div>
                            {(row.label === "TSS"
                              ? isTssInlineEditing
                              : isIfInlineEditing) ? (
                              <input
                                id={row.label === "TSS" ? "tss-inline-input" : "if-inline-input"}
                                type="number"
                                min={0}
                                step={row.label === "TSS" ? 1 : 0.01}
                                value={row.label === "TSS" ? editForm.tss : editForm.if_value}
                                onChange={(e) =>
                                  setEditForm((prev) => {
                                    if (row.label === "TSS") {
                                      return {
                                        ...prev,
                                        tss: e.target.value,
                                      };
                                    }
                                    return {
                                      ...prev,
                                      if_value: e.target.value,
                                    };
                                  })
                                }
                                onBlur={() => {
                                  if (row.label === "TSS") {
                                    setIsTssInlineEditing(false);
                                    return;
                                  }
                                  setIsIfInlineEditing(false);
                                }}
                                autoFocus
                                className="no-spinner w-28 border-0 border-b border-accent/70 bg-transparent px-0 py-0 text-lg font-semibold text-foreground focus:outline-none focus:border-accent"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (row.label === "TSS") {
                                    setIsTssInlineEditing(true);
                                    return;
                                  }
                                  if (
                                    !editForm.if_value &&
                                    row.actualRaw !== null &&
                                    row.actualRaw !== undefined
                                  ) {
                                    setEditForm((prev) => ({
                                      ...prev,
                                      if_value: Number(row.actualRaw).toFixed(2),
                                    }));
                                  }
                                  setIsIfInlineEditing(true);
                                }}
                                className="text-lg font-semibold text-foreground underline underline-offset-4 decoration-dotted hover:text-accent transition-colors"
                              >
                                {row.label === "TSS"
                                  ? editForm.tss || "—"
                                  : editForm.if_value ||
                                    formatComparisonValue(row.actual, row.actualRaw)}
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-lg font-semibold text-foreground">
                            {formatComparisonValue(row.actual, row.actualRaw)}
                          </p>
                        )}
                        {row.label === "TSS" &&
                          activity.status === "completed" &&
                          tssTypeLabel(activity.tss_type) && (
                            <p className="text-xs text-muted mt-1">
                              Calcul : {tssTypeLabel(activity.tss_type)}
                            </p>
                          )}
                        {row.label === "TSS" && activity.status === "completed" && activity.tss_type === "estimated" && (
                          <p className="text-xs text-yellow-400 mt-1">
                            TSS estimé — aucune donnée de puissance, allure ou FC disponible.
                          </p>
                        )}
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
                Courbes de performance
              </h3>
              <span className="text-xs uppercase text-foreground/60">
                Zoom & sélection
              </span>
            </div>
            {hasStreamData ? (
              <ActivityStreamChart
                timeStream={resolvedStreamData.time ?? null}
                heartRateStream={resolvedStreamData.heartrate ?? null}
                powerStream={resolvedStreamData.power ?? null}
              />
            ) : (
              <p className="text-sm text-muted">
                Aucune donnée détaillée n&apos;est disponible pour cette
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
              Le RPE peut etre ajuste directement ici.
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
                        <p className="text-lg sm:text-xl font-semibold text-foreground">
                          {formatStatNumber(card.min, card.formatter)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="uppercase text-foreground/60 text-[10px]">
                          Moy
                        </p>
                        <p className="text-lg sm:text-xl font-semibold text-foreground">
                          {formatStatNumber(card.avg, card.formatter)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="uppercase text-foreground/60 text-[10px]">
                          Max
                        </p>
                        <p className="text-lg sm:text-xl font-semibold text-foreground">
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
          <section className="space-y-3 border-t border-dark-200 pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase text-muted">
                  Suppression définitive
                </p>
                <p className="text-sm text-muted">
                  L&apos;entraînement sera supprimé de votre historique.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={openDeleteModal}
                leftIcon={<Trash className="h-4 w-4" />}
                className="border-error text-error hover:bg-error/10 focus:ring-error"
              >
                Supprimer la séance
              </Button>
            </div>
          </section>
        </div>
      </Card>
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteActivity}
        isLoading={isDeleting}
        description={`Supprimer la séance "${activity.title}" et toutes ses données est définitif.`}
      />
      <FirstVisitRpeModal
        isOpen={isFirstVisitRpeModalOpen}
        onClose={() => setIsFirstVisitRpeModalOpen(false)}
        onSave={handleFirstVisitRpeSave}
        activityTitle={activity.title}
        sportColor={sportColor}
      />
    </div>
  );
}
