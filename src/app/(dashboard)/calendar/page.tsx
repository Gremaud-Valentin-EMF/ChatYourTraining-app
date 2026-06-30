"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  Slider,
  Progress,
  Input,
  Select,
  Modal,
  Spinner,
} from "@/components/ui";
import {
  loadUserThresholds,
  computeManualTSS,
  getSportFields,
  parsePaceToSeconds,
  isMvpSport,
  deriveActivityStatus,
} from "@/lib/calculations/manual-activity";
import { recomputeAndStoreTrainingLoad } from "@/lib/calculations/persist-training-load";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  Activity,
  Moon,
  Zap,
  Edit2,
  NotebookPen,
  Check,
  Target,
} from "lucide-react";
import {
  cn,
  getSportColor,
  formatDuration,
  toLocalDateString,
} from "@/lib/utils";
import { WeatherIcon } from "@/components/weather/weather-icon";
import { useWeatherForecast } from "@/lib/hooks/useWeatherForecast";
import { getSportIconComponent } from "@/lib/sport-icons";

interface Objective {
  id: string;
  name: string;
  event_date: string | null;
  priority: "A" | "B" | "C";
}

interface Activity {
  id: string;
  title: string;
  sport_id: string;
  sport_name: string;
  sport_name_fr: string;
  sport_color?: string;
  sport_icon?: string | null;
  scheduled_date: string;
  status: "planned" | "completed" | "skipped" | "in_progress";
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  planned_distance_km: number | null;
  actual_distance_km: number | null;
  tss: number | null;
  intensity: string | null;
  rpe: number | null;
}

interface DailyMetrics {
  sleep_duration_minutes: number | null;
  sleep_score: number | null;
  sleep_needed_minutes: number | null;
  mood: number | null;
  fatigue_level: number | null;
  notes: string | null;
}

type ViewMode = "week" | "month";

const STATUS_LABELS: Record<Activity["status"], string> = {
  planned: "planifiée",
  completed: "faite",
  skipped: "manquée",
  in_progress: "en cours",
};

const STATUS_BADGE_VARIANT: Record<
  Activity["status"],
  "success" | "error" | "warning" | "info"
> = {
  completed: "success",
  skipped: "error",
  in_progress: "warning",
  planned: "info",
};

function sessionDurationLabel(activity: Activity): string {
  const mins =
    activity.actual_duration_minutes ?? activity.planned_duration_minutes;
  return mins ? formatDuration(mins) : "";
}

/**
 * A session as shown on a calendar date: sport icon + title + duration, styled by
 * status (faite = filled border, manquée = struck/error, planifiée = plain). The
 * full title/sport/duration/status is exposed via aria-label (CA1).
 */
function SessionChip({
  activity,
  variant,
}: {
  activity: Activity;
  variant: "month" | "week";
}) {
  const Icon = getSportIconComponent(activity.sport_icon ?? undefined);
  const color = activity.sport_color || getSportColor(activity.sport_name);
  const duration = sessionDurationLabel(activity);
  const status = activity.status;
  const ariaLabel = `${activity.title} — ${activity.sport_name_fr} — ${
    duration || "durée n.c."
  } — ${STATUS_LABELS[status]}`;

  if (variant === "week") {
    return (
      <div
        aria-label={ariaLabel}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
          status === "skipped" && "bg-error/20 text-error line-through"
        )}
        style={
          status !== "skipped"
            ? { backgroundColor: `${color}20`, color }
            : undefined
        }
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[10rem]">{activity.title}</span>
        {duration && <span className="opacity-80">· {duration}</span>}
        <Badge variant={STATUS_BADGE_VARIANT[status]} size="sm">
          {STATUS_LABELS[status]}
        </Badge>
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
        status === "skipped" && "bg-error/20 text-error line-through"
      )}
      style={
        status !== "skipped"
          ? {
              backgroundColor: `${color}20`,
              color,
              border:
                status === "completed"
                  ? `1px solid ${color}`
                  : "1px solid transparent",
            }
          : undefined
      }
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{activity.title}</span>
      {duration && (
        <span className="ml-auto shrink-0 opacity-80">{duration}</span>
      )}
    </div>
  );
}

/**
 * Uniform monthly-stat card: stat name on top, then "Prévu" / "Réalisé" side by
 * side (same height), with each value below its label.
 */
function MonthStatCard({
  icon,
  label,
  planned,
  realized,
}: {
  icon?: React.ReactNode;
  label: string;
  planned: React.ReactNode;
  realized: React.ReactNode;
}) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs text-muted uppercase">{label}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted">Prévu</p>
          <p className="text-xl font-bold">{planned}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Réalisé</p>
          <p className="text-xl font-bold">{realized}</p>
        </div>
      </div>
    </Card>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sports, setSports] = useState<
    { id: string; name: string; name_fr: string }[]
  >([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    title: "",
    sportId: "",
    plannedDate: "",
    realizedDate: "",
    duration: "",
    distance: "",
    elevation: "",
    pace: "",
    normalizedPower: "",
    avgPower: "",
    avgHr: "",
    maxHr: "",
    rpe: 0,
    notes: "",
  });
  const [fatigueValue, setFatigueValue] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [isSavingMetrics, setIsSavingMetrics] = useState(false);
  const [completingActivityId, setCompletingActivityId] = useState<
    string | null
  >(null);
  const { forecastMap } = useWeatherForecast();

  // Get calendar data
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  const dayNames = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

  // Get first day of month and days in month
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  let startingDay = firstDayOfMonth.getDay() - 1;
  if (startingDay < 0) startingDay = 6;

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  const formatHoursFromMinutes = (minutes: number) => {
    const safeMinutes = Math.max(0, Math.round(minutes));
    const h = Math.floor(safeMinutes / 60);
    const m = safeMinutes % 60;
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  const DEFAULT_SLEEP_GOAL_MINUTES = 8 * 60;

  const weekRange = useMemo(() => {
    const base = new Date(currentDate);
    const day = base.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(base.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday, end: sunday };
  }, [currentDate]);

  const monthStats = useMemo(() => {
    const base = {
      plannedDuration: 0,
      actualDuration: 0,
      plannedDistance: 0,
      actualDistance: 0,
      plannedTss: 0,
      actualTss: 0,
      sessions: 0,
      completedSessions: activities.filter((a) => a.status === "completed")
        .length,
    };

    activities.forEach((activity) => {
      // Check if activity was explicitly planned (has planned duration)
      const isPlanned =
        activity.planned_duration_minutes !== null &&
        activity.planned_duration_minutes > 0;

      if (isPlanned) {
        base.plannedDuration += activity.planned_duration_minutes || 0;
        base.plannedDistance += activity.planned_distance_km || 0;
        base.plannedTss += activity.tss || 0;
        base.sessions += 1;
      }

      // Actual stats count everything that has values, regardless of planning
      base.actualDuration += activity.actual_duration_minutes || 0;
      base.actualDistance += activity.actual_distance_km || 0;
      base.actualTss += activity.status === "completed" ? activity.tss || 0 : 0;
    });

    return base;
  }, [activities]);

  const weeklyStats = useMemo(() => {
    const stats = {
      plannedMinutes: 0,
      actualMinutes: 0,
      plannedDistance: 0,
      actualDistance: 0,
      plannedTss: 0,
      actualTss: 0,
      sessions: 0,
      completedSessions: 0,
    };

    activities.forEach((activity) => {
      const date = new Date(activity.scheduled_date);
      date.setHours(0, 0, 0, 0);
      if (date >= weekRange.start && date <= weekRange.end) {
        const isPlanned =
          activity.planned_duration_minutes !== null &&
          activity.planned_duration_minutes > 0;

        if (isPlanned) {
          stats.sessions += 1;
          stats.plannedMinutes += activity.planned_duration_minutes || 0;
          stats.plannedDistance += activity.planned_distance_km || 0;
          stats.plannedTss += activity.tss || 0;
        }

        if (activity.status === "completed") {
          stats.completedSessions += 1;
        }

        stats.actualMinutes += activity.actual_duration_minutes || 0;
        stats.actualDistance += activity.actual_distance_km || 0;
        stats.actualTss +=
          activity.status === "completed" ? activity.tss || 0 : 0;
      }
    });

    return stats;
  }, [activities, weekRange]);

  // The header stat cards follow the active view: weekly stats in week view,
  // monthly stats in month view.
  const displayStats =
    viewMode === "week"
      ? {
          plannedDuration: weeklyStats.plannedMinutes,
          actualDuration: weeklyStats.actualMinutes,
          plannedDistance: weeklyStats.plannedDistance,
          actualDistance: weeklyStats.actualDistance,
          plannedTss: weeklyStats.plannedTss,
          actualTss: weeklyStats.actualTss,
          sessions: weeklyStats.sessions,
          completedSessions: weeklyStats.completedSessions,
        }
      : monthStats;

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(weekRange.start);
      date.setDate(weekRange.start.getDate() + index);
      const dateStr = toLocalDateString(date);
      return {
        date,
        activities: activities.filter((a) => a.scheduled_date === dateStr),
        isToday: isSameDay(date, today),
      };
    });
  }, [activities, weekRange, today]);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  useEffect(() => {
    reconcileMissedSessions();
    loadSports();
    loadObjectives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (selectedDate) {
      loadDayDetails(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = toLocalDateString(new Date(year, month, 1));
      const endDate = toLocalDateString(new Date(year, month + 1, 0));

      const { data } = await supabase
        .from("activities")
        .select(
          `
          id,
          title,
          sport_id,
          scheduled_date,
          status,
          planned_duration_minutes,
          actual_duration_minutes,
          planned_distance_km,
          actual_distance_km,
          tss,
          intensity,
          rpe,
          sports (name, name_fr, color, icon)
        `
        )
        .eq("user_id", user.id)
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate);

      if (data) {
        setActivities(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.map((a: any) => ({
            id: a.id,
            title: a.title,
            sport_id: a.sport_id,
            scheduled_date: a.scheduled_date,
            status: a.status,
            planned_duration_minutes: a.planned_duration_minutes,
            actual_duration_minutes: a.actual_duration_minutes,
            planned_distance_km: a.planned_distance_km,
            actual_distance_km: a.actual_distance_km,
            tss: a.tss,
            intensity: a.intensity,
            rpe: a.rpe,
            sport_name: a.sports?.name || "other",
            sport_name_fr: a.sports?.name_fr || "Autre",
            sport_color: a.sports?.color,
            sport_icon: a.sports?.icon,
          }))
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Server-side sweep: flips overdue "planned" sessions to "skipped"
  // (grace period handled server-side). Non-blocking; reloads on change.
  const reconcileMissedSessions = async () => {
    try {
      const res = await fetch("/api/activities/reconcile", { method: "POST" });
      if (res.ok) {
        const { skipped } = await res.json();
        if (skipped > 0) await loadActivities();
      }
    } catch {
      // Reconcile is best-effort — never block the calendar on it.
    }
  };

  const loadSports = async () => {
    const { data } = await supabase
      .from("sports")
      .select("id, name, name_fr")
      .order("name_fr");
    if (data) {
      setSports(data);
    }
  };

  const loadObjectives = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("objectives")
        .select("id, name, event_date, priority")
        .eq("user_id", user.id)
        .order("event_date");
      if (data) {
        setObjectives(data);
      }
    } catch (error) {
      console.error("Error loading objectives:", error);
    }
  };

  const loadDayDetails = async (date: Date) => {
    const now = new Date();
    if (date > now) {
      setDailyMetrics(null);
      setFatigueValue(null);
      setNotesValue("");
      return;
    }

    setDailyMetrics(null);
    setFatigueValue(null);
    setNotesValue("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const dateStr = toLocalDateString(date);

    const { data, error } = await supabase
      .from("daily_metrics")
      .select(
        "sleep_duration_minutes, sleep_score, sleep_needed_minutes, mood, fatigue_level, notes"
      )
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .maybeSingle();

    if (error) {
      console.error("Error loading daily metrics:", error);
      return;
    }

    if (!data) {
      return;
    }

    setDailyMetrics(data);
    setFatigueValue(data.fatigue_level || null);
    setNotesValue(data.notes || "");
  };

  const handleMarkAsDone = async (activity: Activity) => {
    setCompletingActivityId(activity.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("activities")
        .update({
          status: "completed",
          actual_duration_minutes: activity.planned_duration_minutes,
          actual_distance_km: activity.planned_distance_km,
          // We can also copy intensity/RPE if they were set in planned, or leave them null for user to refine later
          // For now, prompt implies taking what was planned.
        })
        .eq("id", activity.id)
        .eq("user_id", user.id);

      await loadActivities();
      if (selectedDate) {
        // Refresh day view if we are on the same day (likely yes since we clicked it)
        // Optimization: we could just update the local state, but reloading ensures consistency
      }
    } catch (error) {
      console.error("Error marking activity as done:", error);
    } finally {
      setCompletingActivityId(null);
    }
  };

  const navigateDate = (direction: number) => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + direction, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + direction * 7);
      setCurrentDate(newDate);
    }
  };

  const handleSaveJournal = async () => {
    if (!selectedDate || selectedDate > today) return;
    const fatigueChanged =
      fatigueValue !== null &&
      fatigueValue !== (dailyMetrics?.fatigue_level || null);
    const notesChanged = notesValue !== (dailyMetrics?.notes || "");
    if (!fatigueChanged && !notesChanged) return;

    setIsSavingMetrics(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const dateStr = toLocalDateString(selectedDate);
      const { data, error } = await supabase
        .from("daily_metrics")
        .upsert(
          {
            user_id: user.id,
            date: dateStr,
            fatigue_level:
              fatigueValue !== null
                ? fatigueValue
                : dailyMetrics?.fatigue_level,
            notes: notesValue || null,
          },
          { onConflict: "user_id,date" }
        )
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setDailyMetrics(data);
        setFatigueValue(data.fatigue_level);
        setNotesValue(data.notes || "");
      }
    } catch (err) {
      console.error("Error saving journal:", err);
    } finally {
      setIsSavingMetrics(false);
    }
  };

  const getActivitiesForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    return activities.filter((a) => a.scheduled_date === dateStr);
  };

  const getObjectivesForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    return objectives.filter((o) => o.event_date === dateStr);
  };

  const isCurrentDay = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const defaultNewSession = {
    title: "",
    sportId: "",
    plannedDate: "",
    realizedDate: "",
    duration: "",
    distance: "",
    elevation: "",
    pace: "",
    normalizedPower: "",
    avgPower: "",
    avgHr: "",
    maxHr: "",
    rpe: 0,
    notes: "",
  };

  const handleCreateSession = async () => {
    const { status, scheduledDate, completedDate } = deriveActivityStatus({
      plannedDate: newSession.plannedDate,
      realizedDate: newSession.realizedDate,
      todayStr: toLocalDateString(today),
    });
    const realized = status === "completed";
    if (!newSession.title || !newSession.sportId || !scheduledDate) return;
    // For a realized session, duration is the only strictly required metric.
    if (realized && !newSession.duration) return;
    setIsSavingSession(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const slug =
        sports.find((s) => s.id === newSession.sportId)?.name ?? "other";
      const durationMin = newSession.duration
        ? parseInt(newSession.duration, 10)
        : null;
      const distanceKm = newSession.distance
        ? parseFloat(newSession.distance)
        : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        user_id: user.id,
        title: newSession.title,
        sport_id: newSession.sportId,
        scheduled_date: scheduledDate,
        description: newSession.notes || null,
        source: "manual",
        status,
      };

      if (realized) {
        // Realized → completed_date set, actual_* filled, TSS computed.
        payload.completed_date = `${completedDate}T12:00:00`;
        payload.actual_duration_minutes = durationMin;
        payload.actual_distance_km = distanceKm;
        payload.elevation_gain_m = newSession.elevation
          ? parseInt(newSession.elevation, 10)
          : null;
        payload.avg_hr = newSession.avgHr
          ? parseInt(newSession.avgHr, 10)
          : null;
        payload.max_hr = newSession.maxHr
          ? parseInt(newSession.maxHr, 10)
          : null;
        payload.avg_power_watts = newSession.avgPower
          ? parseInt(newSession.avgPower, 10)
          : null;
        payload.avg_pace_per_km = newSession.pace || null;
        payload.rpe = newSession.rpe >= 1 ? newSession.rpe : null;

        const np = newSession.normalizedPower
          ? parseInt(newSession.normalizedPower, 10)
          : undefined;
        // Store NP where the engine and diagnostics expect it.
        if (np) payload.raw_data = { _calculated: { normalized_power: np } };

        // Auto-compute TSS with the athlete's profile thresholds (Étape 3).
        if (durationMin && durationMin > 0) {
          const thresholds = await loadUserThresholds(supabase, user.id);
          const { tss, type } = computeManualTSS(
            {
              sportSlug: slug,
              durationMinutes: durationMin,
              distanceKm: distanceKm ?? undefined,
              avgPaceSecondsPerKm: parsePaceToSeconds(newSession.pace),
              normalizedPower: np,
              avgPowerWatts: newSession.avgPower
                ? parseInt(newSession.avgPower, 10)
                : undefined,
              avgHr: newSession.avgHr
                ? parseInt(newSession.avgHr, 10)
                : undefined,
              rpe: newSession.rpe >= 1 ? newSession.rpe : undefined,
            },
            thresholds
          );
          payload.tss = tss;
          payload.tss_type = type;
        }
      } else {
        // Planned / skipped — planned_* columns plus planned targets (precise
        // planning); no realized TSS until the session is actually done.
        payload.planned_duration_minutes = durationMin;
        payload.planned_distance_km = distanceKm;
        payload.tss = null;

        const manual: Record<string, number> = {};
        if (newSession.elevation) {
          manual.planned_elevation_m = parseInt(newSession.elevation, 10);
        }
        const plannedPaceSeconds = parsePaceToSeconds(newSession.pace);
        if (plannedPaceSeconds) manual.planned_pace_seconds = plannedPaceSeconds;

        // Target load from the planned metrics (RPE excluded — realized only).
        if (durationMin && durationMin > 0) {
          const thresholds = await loadUserThresholds(supabase, user.id);
          const np = newSession.normalizedPower
            ? parseInt(newSession.normalizedPower, 10)
            : undefined;
          const { tss } = computeManualTSS(
            {
              sportSlug: slug,
              durationMinutes: durationMin,
              distanceKm: distanceKm ?? undefined,
              avgPaceSecondsPerKm: plannedPaceSeconds,
              normalizedPower: np,
              avgPowerWatts: newSession.avgPower
                ? parseInt(newSession.avgPower, 10)
                : undefined,
              avgHr: newSession.avgHr
                ? parseInt(newSession.avgHr, 10)
                : undefined,
            },
            thresholds
          );
          if (tss > 0) manual.planned_tss = tss;
        }

        if (Object.keys(manual).length > 0) {
          payload.raw_data = { _manual: manual };
        }
      }

      await supabase.from("activities").insert(payload);

      // US-13: a realized session changes the load series → refresh training_load.
      if (realized) {
        await recomputeAndStoreTrainingLoad(supabase, user.id);
      }

      setIsModalOpen(false);
      setNewSession(defaultNewSession);
      // Jump the calendar to the new activity's date so it shows up immediately,
      // even when it lands in another month/week. Changing currentDate/selectedDate
      // triggers the effects that reload the grid and the day panel.
      const createdDate = new Date(`${scheduledDate}T00:00:00`);
      setSelectedDate(createdDate);
      setCurrentDate(createdDate);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleOpenModal = () => {
    const baseDate = selectedDate || currentDate;
    const baseStr = toLocalDateString(baseDate);
    // Pre-fill only the planned date for a future day. The realized date stays
    // empty by default — the athlete fills it in explicitly.
    const isPastOrToday = baseStr <= toLocalDateString(today);
    setNewSession({
      ...defaultNewSession,
      plannedDate: isPastOrToday ? "" : baseStr,
      realizedDate: "",
    });
    setIsModalOpen(true);
  };

  const formatSelectedDate = () => {
    if (!selectedDate) return "";
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "short",
    };
    return selectedDate.toLocaleDateString("fr-FR", options);
  };

  const newSessionSlug =
    sports.find((s) => s.id === newSession.sportId)?.name ?? "";
  const newSessionFields = newSessionSlug
    ? getSportFields(newSessionSlug)
    : null;
  const newSessionStatus = deriveActivityStatus({
    plannedDate: newSession.plannedDate,
    realizedDate: newSession.realizedDate,
    todayStr: toLocalDateString(today),
  }).status;
  const newSessionRealized = newSessionStatus === "completed";
  const mvpSportOptions = sports
    .filter((s) => isMvpSport(s.name))
    .map((s) => ({ value: s.id, label: s.name_fr }));

  const selectedDateActivities = selectedDate
    ? getActivitiesForDate(selectedDate.getDate())
    : [];
  const isFutureSelection =
    selectedDate !== null && selectedDate.getTime() > today.getTime();
  const sleepMinutes = !isFutureSelection
    ? dailyMetrics?.sleep_duration_minutes
    : null;
  const sleepScore = !isFutureSelection ? dailyMetrics?.sleep_score : null;
  const sleepNeededMinutes = !isFutureSelection
    ? dailyMetrics?.sleep_needed_minutes ?? null
    : null;
  const sleepGoalMinutes = Math.max(
    1,
    sleepNeededMinutes ?? DEFAULT_SLEEP_GOAL_MINUTES
  );
  const hasSleepDuration = typeof sleepMinutes === "number";
  const sleepGaugeValue = hasSleepDuration
    ? Math.min(sleepMinutes!, sleepGoalMinutes)
    : 0;
  const sleepGoalLabel = sleepNeededMinutes ? "Objectif" : "Objectif estimé";
  const resolvedFatigue = fatigueValue ?? dailyMetrics?.fatigue_level ?? null;
  const fatigueStatus =
    resolvedFatigue === null
      ? { label: "Non renseigné", color: "text-muted" }
      : resolvedFatigue <= 3
      ? { label: "Très frais", color: "text-success" }
      : resolvedFatigue <= 6
      ? { label: "Modéré", color: "text-warning" }
      : { label: "Élevé", color: "text-error" };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Main Calendar */}
        <div className="flex-1 space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 w-[320px]">
                <h1 className="text-3xl font-bold">{monthNames[month]}</h1>
                <h2 className="text-3xl font-bold text-muted">{year}</h2>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  onClick={() => navigateDate(-1)}
                  className="gap-2"
                  aria-label="Période précédente"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigateDate(1)}
                  className="gap-2"
                  aria-label="Période suivante"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              {isLoading && <Spinner size="sm" />}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                defaultValue="month"
                onValueChange={(v) => setViewMode(v as ViewMode)}
              >
                <TabsList>
                  <TabsTrigger value="week">Semaine</TabsTrigger>
                  <TabsTrigger value="month">Mois</TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                className="w-full sm:w-auto"
                onClick={handleOpenModal}
              >
                Nouvelle séance
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <MonthStatCard
              icon={<Clock className="h-5 w-5 text-secondary" />}
              label="Durée"
              planned={formatHoursFromMinutes(displayStats.plannedDuration)}
              realized={formatHoursFromMinutes(displayStats.actualDuration)}
            />

            <MonthStatCard
              icon={<Activity className="h-5 w-5 text-accent" />}
              label="Distance"
              planned={
                <>
                  {displayStats.plannedDistance.toFixed(1)}
                  <span className="text-sm text-muted ml-1">km</span>
                </>
              }
              realized={
                <>
                  {displayStats.actualDistance.toFixed(1)}
                  <span className="text-sm text-muted ml-1">km</span>
                </>
              }
            />

            <MonthStatCard
              icon={<Zap className="h-5 w-5 text-warning" />}
              label="Charge TSS"
              planned={displayStats.plannedTss}
              realized={displayStats.actualTss}
            />

            <MonthStatCard
              label="Séances"
              planned={displayStats.sessions}
              realized={displayStats.completedSessions}
            />
          </div>

          {/* Calendar View */}
          {viewMode === "month" ? (
            <Card>
              <div className="overflow-x-auto">
                <div className="w-full md:min-w-[720px]">
                  <div className="grid grid-cols-7 gap-px border-b border-dark-200 mb-2">
                    {dayNames.map((day) => (
                      <div
                        key={day}
                        className="p-1 md:p-3 text-center text-xs md:text-sm text-muted font-medium"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px">
                    {Array.from({ length: startingDay }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="min-h-[60px] md:min-h-[100px] p-1 md:p-2 bg-dark-100/50"
                      />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dayActivities = getActivitiesForDate(day);
                      const dayObjectives = getObjectivesForDate(day);
                      const isSelected =
                        selectedDate?.getDate() === day &&
                        selectedDate?.getMonth() === month &&
                        selectedDate?.getFullYear() === year;

                      return (
                        <div
                          key={day}
                          onClick={() =>
                            setSelectedDate(new Date(year, month, day))
                          }
                          className={cn(
                            "min-h-[60px] md:min-h-[100px] p-1 md:p-2 cursor-pointer transition-colors border relative",
                            isCurrentDay(day)
                              ? "border-accent bg-accent/5"
                              : isSelected
                              ? "border-secondary bg-secondary/5"
                              : "border-transparent hover:bg-dark-100"
                          )}
                        >
                          <div
                            className={cn(
                              "text-xs md:text-sm font-medium mb-1 md:mb-2",
                              isCurrentDay(day) && "text-accent"
                            )}
                          >
                            {day}
                            {isCurrentDay(day) && (
                              <span className="ml-1 h-1 w-1 md:h-1.5 md:w-1.5 bg-accent rounded-full inline-block" />
                            )}
                          </div>

                          {/* Weather */}
                          {(() => {
                            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const forecast = forecastMap?.get(dateStr);
                            if (!forecast) return null;
                            return (
                              <div className="mt-2 mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-dark-100/50 border border-dark-200">
                                <WeatherIcon code={forecast.icon} className="h-4 w-4" />
                                <div className="text-xs font-semibold leading-none">
                                  <div>{Math.round(forecast.temp_max_c)}°</div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Objectifs badge (desktop) */}
                          <div className="hidden md:block space-y-1">
                            {dayObjectives.map((obj) => (
                              <div
                                key={`obj-${obj.id}`}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold truncate"
                                style={{
                                  backgroundColor: "rgba(234, 179, 8, 0.15)",
                                  color: "#ca8a04",
                                  border: "1px solid rgba(234, 179, 8, 0.3)",
                                }}
                              >
                                <Target className="h-2.5 w-2.5 flex-shrink-0" />
                                <span className="truncate">
                                  {obj.name.length > 10
                                    ? `${obj.name.substring(0, 10)}...`
                                    : obj.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Desktop: Full List */}
                          <div className="hidden md:block space-y-1">
                            {dayActivities.slice(0, 3).map((activity) => (
                              <SessionChip
                                key={activity.id}
                                activity={activity}
                                variant="month"
                              />
                            ))}
                            {dayActivities.length > 3 && (
                              <div className="text-xs text-muted">
                                +{dayActivities.length - 3} autres
                              </div>
                            )}
                          </div>

                          {/* Mobile: Dots */}
                          <div className="flex md:hidden flex-wrap gap-1 mt-1">
                            {dayObjectives.map((obj) => (
                              <div
                                key={`obj-${obj.id}`}
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: "#ca8a04" }}
                              />
                            ))}
                            {dayActivities.map((activity) => (
                              <div
                                key={activity.id}
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    activity.status === "skipped"
                                      ? "var(--error)"
                                      : activity.sport_color ||
                                        getSportColor(activity.sport_name),
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              {weekDays.every((day) => day.activities.length === 0) && (
                <div className="text-center py-8 px-4 mb-2 rounded-xl border border-dashed border-dark-200 text-sm text-muted">
                  Aucune séance planifiée — demande un plan au Coach IA
                </div>
              )}

              <div className="space-y-2">
                {weekDays.map((day) => {
                  const dateStr = day.date.toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });
                  const isSelected =
                    selectedDate && isSameDay(day.date, selectedDate);

                  return (
                    <button
                      key={toLocalDateString(day.date)}
                      onClick={() => setSelectedDate(new Date(day.date))}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-colors",
                        day.isToday
                          ? "border-accent bg-accent/5"
                          : "border-dark-200 hover:border-accent/50",
                        isSelected && "bg-secondary/10 border-secondary"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-xs text-muted uppercase">
                            {dateStr}
                          </p>
                          <p className="text-sm font-semibold">
                            {day.activities.length > 0
                              ? `${day.activities.length} séance${
                                  day.activities.length > 1 ? "s" : ""
                                }`
                              : "Repos"}
                          </p>
                          {(() => {
                            const dateStr = day.date.toISOString().split("T")[0];
                            const forecast = forecastMap?.get(dateStr);
                            if (!forecast) return null;
                            return (
                              <div className="mt-2 flex items-center gap-2 px-2 py-1 rounded-lg bg-dark-100/50 border border-dark-200 w-fit">
                                <WeatherIcon code={forecast.icon} className="h-4 w-4" />
                                <span className="text-xs font-semibold">
                                  {Math.round(forecast.temp_max_c)}°
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        {day.isToday && (
                          <Badge variant="outline" size="sm">
                            Aujourd&apos;hui
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {day.activities.length > 0 ? (
                          day.activities.map((activity) => (
                            <SessionChip
                              key={activity.id}
                              activity={activity}
                              variant="week"
                            />
                          ))
                        ) : (
                          <span className="text-xs text-muted">Repos</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Day Details */}
        <div className="w-full xl:w-80 space-y-4">
          {selectedDate ? (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-accent uppercase">
                    {selectedDate && isSameDay(selectedDate, today)
                      ? "Aujourd'hui"
                      : "Jour sélectionné"}
                  </p>
                  <h3 className="text-lg font-bold capitalize">
                    {formatSelectedDate()}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedDate(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Workouts for selected day */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted" />
                    Entraînement
                  </h4>
                  <Button variant="ghost" size="sm" onClick={handleOpenModal}>
                    <Edit2 className="h-3 w-3 mr-1" />
                    Planifier
                  </Button>
                </div>

                {selectedDateActivities.length === 0 ? (
                  <div className="text-center py-6 text-muted text-sm">
                    <p>Pas d&apos;entraînement prévu</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={handleOpenModal}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                ) : (
                  selectedDateActivities.map((activity) => (
                    <Card
                      key={activity.id}
                      variant="interactive"
                      padding="sm"
                      className="cursor-pointer hover:border-accent/50 transition-colors"
                      onClick={() => router.push(`/workouts/${activity.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium">{activity.title}</h5>
                        <Badge
                          variant={
                            activity.status === "completed"
                              ? "success"
                              : activity.status === "skipped"
                              ? "error"
                              : activity.status === "in_progress"
                              ? "warning"
                              : "info"
                          }
                          size="sm"
                        >
                          {activity.status === "completed"
                            ? "TERMINÉ"
                            : activity.status === "skipped"
                            ? "ANNULÉ"
                            : activity.status === "in_progress"
                            ? "EN COURS"
                            : "À FAIRE"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted">PRÉVU</p>
                          <p className="font-bold">
                            {activity.planned_duration_minutes
                              ? formatDuration(
                                  activity.planned_duration_minutes
                                )
                              : "--:--"}{" "}
                            h
                          </p>
                          <p>
                            {activity.planned_distance_km?.toFixed(1) || "--"}{" "}
                            km
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">RÉALISÉ</p>
                          <p className="font-bold">
                            {activity.actual_duration_minutes
                              ? formatDuration(activity.actual_duration_minutes)
                              : "--:--"}
                          </p>
                          <p>
                            {activity.actual_distance_km?.toFixed(1) || "--"}
                          </p>
                        </div>
                      </div>

                      {activity.status === "planned" && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full mt-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsDone(activity);
                          }}
                          isLoading={completingActivityId === activity.id}
                          leftIcon={<Check className="h-4 w-4" />}
                        >
                          Marquer comme fait
                        </Button>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </Card>
          ) : (
            <Card className="text-center">
              <h3 className="font-semibold mb-2">Sélectionnez une date</h3>
              <p className="text-sm text-muted">
                Touchez un jour dans le calendrier pour voir les détails.
              </p>
            </Card>
          )}

          {/* Weather Details */}
          {selectedDate && (() => {
            const dateStr = toLocalDateString(selectedDate);
            const forecast = forecastMap?.get(dateStr);
            if (!forecast) {
              return (
                <Card className="text-center py-4">
                  <p className="text-sm text-muted">Météo non disponible</p>
                  <p className="text-xs text-muted mt-2">
                    Assure-toi d&apos;avoir accordé la permission de géolocalisation
                  </p>
                </Card>
              );
            }

            return (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <WeatherIcon code={forecast.icon} className="h-6 w-6" />
                  <div className="flex-1">
                    <h4 className="font-semibold capitalize">{forecast.description}</h4>
                    <p className="text-xs text-muted">
                      {Math.round(forecast.temp_max_c)}° / {Math.round(forecast.temp_min_c)}°
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Temperatures */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-dark-100">
                      <p className="text-xs text-muted uppercase">Max</p>
                      <p className="text-lg font-bold">{Math.round(forecast.temp_max_c)}°</p>
                    </div>
                    <div className="p-2 rounded-lg bg-dark-100">
                      <p className="text-xs text-muted uppercase">Min</p>
                      <p className="text-lg font-bold">{Math.round(forecast.temp_min_c)}°</p>
                    </div>
                    <div className="p-2 rounded-lg bg-dark-100">
                      <p className="text-xs text-muted uppercase">Ressenti</p>
                      <p className="text-lg font-bold">{Math.round(forecast.feels_like_c)}°</p>
                    </div>
                  </div>

                  {/* Wind & Precipitation */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted uppercase mb-1">Vent</p>
                      <p className="font-semibold">{forecast.wind_speed_kmh.toFixed(1)} km/h</p>
                      {forecast.wind_gust_kmh && (
                        <p className="text-xs text-muted">Rafales: {forecast.wind_gust_kmh.toFixed(1)} km/h</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted uppercase mb-1">Précipitations</p>
                      <p className="font-semibold">{forecast.precipitation_mm.toFixed(1)} mm</p>
                      <p className="text-xs text-muted">{forecast.precipitation_probability}% chance</p>
                    </div>
                  </div>

                  {/* Snow and UV */}
                  {(forecast.snow_mm > 0 || forecast.uv_index !== null) && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {forecast.snow_mm > 0 && (
                        <div className="p-2 rounded-lg bg-dark-100">
                          <p className="text-xs text-muted uppercase">Neige</p>
                          <p className="font-semibold">{forecast.snow_mm.toFixed(1)} mm</p>
                        </div>
                      )}
                      {forecast.uv_index !== null && (
                        <div className="p-2 rounded-lg bg-dark-100">
                          <p className="text-xs text-muted uppercase">UV</p>
                          <p className="font-semibold">{forecast.uv_index.toFixed(1)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* Journal du jour */}
          {selectedDate && (
            <Card>
              <h4 className="font-medium flex items-center gap-2 mb-4">
                <Moon className="h-4 w-4 text-secondary" />
                Journal du jour
              </h4>

              <div className="space-y-4">
                {/* Sleep */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted uppercase">
                      Sommeil
                    </span>
                    <Moon className="h-4 w-4 text-muted" />
                  </div>
                  <p className="text-2xl font-bold">
                    {sleepMinutes
                      ? `${Math.floor(sleepMinutes / 60)}h${String(
                          sleepMinutes % 60
                        ).padStart(2, "0")}`
                      : isFutureSelection
                      ? "--"
                      : "Non renseigné"}
                  </p>
                  {hasSleepDuration ? (
                    <>
                      <Progress
                        value={sleepGaugeValue}
                        max={sleepGoalMinutes}
                        size="sm"
                        className="mt-2"
                      />
                      <div className="flex justify-between text-xs text-muted mt-2">
                        <span>
                          {sleepScore !== null && sleepScore !== undefined
                            ? `Score : ${sleepScore}%`
                            : "Score indisponible"}
                        </span>
                        <span>
                          {sleepGoalLabel} :{" "}
                          {formatHoursFromMinutes(sleepGoalMinutes)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted mt-2">
                      {isFutureSelection
                        ? "Les données apparaîtront après la nuit."
                        : "Aucune donnée pour ce jour."}
                    </p>
                  )}
                </div>

                {/* Fatigue */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted">
                      Fatigue ressentie
                    </span>
                    <span
                      className={cn("text-sm font-medium", fatigueStatus.color)}
                    >
                      {fatigueStatus.label}
                      {resolvedFatigue !== null && ` (${resolvedFatigue}/10)`}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={10}
                    value={resolvedFatigue ?? 5}
                    showValue
                    onChange={(e) =>
                      setFatigueValue(Number(e.currentTarget.value))
                    }
                    disabled={isFutureSelection}
                  />
                  <div className="flex justify-between text-xs text-muted mt-1 mb-3">
                    <span>FRAIS</span>
                    <span>ÉPUISÉ</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={handleSaveJournal}
                    disabled={isFutureSelection || isSavingMetrics}
                    isLoading={isSavingMetrics}
                  >
                    Sauvegarder la fatigue
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Notes */}
          {selectedDate && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-muted" />
                  Notes du jour
                </h4>
              </div>
              <p className="text-xs text-muted mb-3">
                Liées à la journée, pas à une séance.
              </p>
              <textarea
                className="w-full h-24 bg-dark-100 rounded-xl p-3 text-sm resize-none border border-dark-200 focus:border-accent focus:outline-none"
                placeholder="Note sur la journée (forme générale, sommeil, événement…)"
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                disabled={isFutureSelection}
              />
              <Button
                variant="secondary"
                size="sm"
                className="mt-2 w-full"
                onClick={handleSaveJournal}
                disabled={isFutureSelection || isSavingMetrics}
                isLoading={isSavingMetrics}
              >
                Sauvegarder le journal
              </Button>
              {isFutureSelection && (
                <p className="text-xs text-muted text-center mt-2">
                  Les entrées futures seront disponibles une fois la journée
                  passée.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          newSessionStatus === "completed"
            ? "Ajouter une séance réalisée"
            : newSessionStatus === "skipped"
              ? "Séance manquée"
              : "Planifier une séance"
        }
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Titre"
            placeholder="Séance tempo, sortie longue..."
            value={newSession.title}
            onChange={(e) =>
              setNewSession((prev) => ({ ...prev, title: e.target.value }))
            }
          />
          <Select
            label="Sport"
            value={newSession.sportId}
            onChange={(value) =>
              setNewSession((prev) => ({ ...prev, sportId: value }))
            }
            placeholder="Choisissez un sport"
            options={mvpSportOptions}
          />
          {/* Deux dates optionnelles — leur combinaison fixe le statut */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date planifiée"
              type="date"
              className="w-full"
              value={newSession.plannedDate}
              onChange={(e) =>
                setNewSession((prev) => ({
                  ...prev,
                  plannedDate: e.target.value,
                }))
              }
            />
            <Input
              label="Date réalisée"
              type="date"
              className="w-full"
              value={newSession.realizedDate}
              onChange={(e) =>
                setNewSession((prev) => ({
                  ...prev,
                  realizedDate: e.target.value,
                }))
              }
            />
          </div>

          {/* Statut déduit de la combinaison des deux dates */}
          {(newSessionStatus === "completed" ||
            newSessionStatus === "skipped") && (
            <p className="text-xs text-muted">
              {newSessionStatus === "completed"
                ? "Séance réalisée : le TSS sera calculé automatiquement."
                : "Date planifiée passée sans réalisation → séance manquée (skipped)."}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={
                newSessionRealized ? "Durée (minutes) *" : "Durée prévue (minutes)"
              }
              type="number"
              min={0}
              value={newSession.duration}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, duration: e.target.value }))
              }
            />
            {newSessionFields?.distance && (
              <Input
                label="Distance (km)"
                type="number"
                min={0}
                step="0.1"
                value={newSession.distance}
                onChange={(e) =>
                  setNewSession((prev) => ({
                    ...prev,
                    distance: e.target.value,
                  }))
                }
              />
            )}
          </div>

          {/* Champs de métriques — disponibles aussi pour planifier (RPE excepté) */}
          {newSessionFields && (
            <>
              {(newSessionFields.elevation || newSessionFields.pace) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {newSessionFields.elevation && (
                    <Input
                      label="Dénivelé D+ (m)"
                      type="number"
                      min={0}
                      value={newSession.elevation}
                      onChange={(e) =>
                        setNewSession((prev) => ({
                          ...prev,
                          elevation: e.target.value,
                        }))
                      }
                    />
                  )}
                  {newSessionFields.pace && (
                    <Input
                      label="Allure moyenne (min/km)"
                      placeholder="5:30"
                      value={newSession.pace}
                      onChange={(e) =>
                        setNewSession((prev) => ({
                          ...prev,
                          pace: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              )}

              {newSessionFields.power && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Puissance normalisée (NP, W)"
                    type="number"
                    min={0}
                    value={newSession.normalizedPower}
                    onChange={(e) =>
                      setNewSession((prev) => ({
                        ...prev,
                        normalizedPower: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Puissance moyenne (W)"
                    type="number"
                    min={0}
                    value={newSession.avgPower}
                    onChange={(e) =>
                      setNewSession((prev) => ({
                        ...prev,
                        avgPower: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {newSessionFields.hr && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="FC moyenne (bpm)"
                    type="number"
                    min={0}
                    value={newSession.avgHr}
                    onChange={(e) =>
                      setNewSession((prev) => ({
                        ...prev,
                        avgHr: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="FC max séance (bpm)"
                    type="number"
                    min={0}
                    value={newSession.maxHr}
                    onChange={(e) =>
                      setNewSession((prev) => ({
                        ...prev,
                        maxHr: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {/* RPE — ressenti, à renseigner uniquement pour une séance réalisée */}
              {newSessionRealized && (
                <Slider
                  label="RPE — ressenti de l'effort"
                  min={0}
                  max={10}
                  step={1}
                  value={newSession.rpe}
                  valueFormatter={(v) => (v === 0 ? "—" : `${v}/10`)}
                  onChange={(e) =>
                    setNewSession((prev) => ({
                      ...prev,
                      rpe: parseInt(e.target.value, 10),
                    }))
                  }
                />
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-muted mb-2">
              Notes
            </label>
            <textarea
              className="w-full px-4 py-3 bg-dark-100 border border-dark-200 rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
              rows={2}
              placeholder="Sensations, météo, exercices..."
              value={newSession.notes}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSession}
              isLoading={isSavingSession}
              disabled={
                !newSession.title ||
                !newSession.sportId ||
                (!newSession.plannedDate && !newSession.realizedDate) ||
                (newSessionRealized && !newSession.duration)
              }
            >
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
