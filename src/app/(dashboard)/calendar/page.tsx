"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { cn, getSportColor, formatDuration } from "@/lib/utils";

interface Activity {
  id: string;
  title: string;
  sport_id: string;
  sport_name: string;
  sport_name_fr: string;
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
  mood: number | null;
  fatigue_level: number | null;
  notes: string | null;
}

type ViewMode = "week" | "month";

export default function CalendarPage() {
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
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    title: "",
    sportId: "",
    date: "",
    duration: "",
    distance: "",
    intensity: "endurance",
  });
  const [fatigueValue, setFatigueValue] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [isSavingMetrics, setIsSavingMetrics] = useState(false);

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
      sessions: activities.length,
      completedSessions: activities.filter((a) => a.status === "completed")
        .length,
    };

    activities.forEach((activity) => {
      base.plannedDuration += activity.planned_duration_minutes || 0;
      base.actualDuration += activity.actual_duration_minutes || 0;
      base.plannedDistance += activity.planned_distance_km || 0;
      base.actualDistance += activity.actual_distance_km || 0;
      base.plannedTss += activity.tss || 0;
      base.actualTss +=
        activity.status === "completed" ? activity.tss || 0 : 0;
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
        stats.sessions += 1;
        if (activity.status === "completed") {
          stats.completedSessions += 1;
        }
        stats.plannedMinutes += activity.planned_duration_minutes || 0;
        stats.actualMinutes += activity.actual_duration_minutes || 0;
        stats.plannedDistance += activity.planned_distance_km || 0;
        stats.actualDistance += activity.actual_distance_km || 0;
        stats.plannedTss += activity.tss || 0;
        stats.actualTss +=
          activity.status === "completed" ? activity.tss || 0 : 0;
      }
    });

    return stats;
  }, [activities, weekRange]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(weekRange.start);
      date.setDate(weekRange.start.getDate() + index);
      const dateStr = date.toISOString().split("T")[0];
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
    loadSports();
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

      const startDate = new Date(year, month, 1).toISOString().split("T")[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

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
          sports (name, name_fr)
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
          }))
        );
      }
    } finally {
      setIsLoading(false);
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

  const loadDayDetails = async (date: Date) => {
    const now = new Date();
    if (date > now) {
      setDailyMetrics(null);
      setFatigueValue(null);
      setNotesValue("");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const dateStr = date.toISOString().split("T")[0];

    const { data } = await supabase
      .from("daily_metrics")
      .select("sleep_duration_minutes, mood, fatigue_level, notes")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .single();

    setDailyMetrics(data);
    setFatigueValue(data?.fatigue_level || null);
    setNotesValue(data?.notes || "");
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const handleSaveJournal = async () => {
    if (!selectedDate || selectedDate > today) return;
    const fatigueChanged =
      fatigueValue !== null &&
      fatigueValue !== (dailyMetrics?.fatigue_level || null);
    const notesChanged =
      notesValue !== (dailyMetrics?.notes || "");
    if (!fatigueChanged && !notesChanged) return;

    setIsSavingMetrics(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const dateStr = selectedDate.toISOString().split("T")[0];
      await supabase.from("daily_metrics").upsert({
        user_id: user.id,
        date: dateStr,
        fatigue_level:
          fatigueValue !== null ? fatigueValue : dailyMetrics?.fatigue_level,
        notes: notesValue || null,
      });
      await loadDayDetails(selectedDate);
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

  const isCurrentDay = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const handleCreateSession = async () => {
    if (!newSession.title || !newSession.sportId || !newSession.date) return;
    setIsSavingSession(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("activities").insert({
        user_id: user.id,
        title: newSession.title,
        sport_id: newSession.sportId,
        scheduled_date: newSession.date,
        planned_duration_minutes: newSession.duration
          ? parseInt(newSession.duration, 10)
          : null,
        planned_distance_km: newSession.distance
          ? parseFloat(newSession.distance)
          : null,
        intensity: newSession.intensity,
        status: "planned",
      });

      setIsModalOpen(false);
      setNewSession({
        title: "",
        sportId: "",
        date: "",
        duration: "",
        distance: "",
        intensity: "endurance",
      });
      await loadActivities();
      if (
        selectedDate &&
        selectedDate.toISOString().split("T")[0] === newSession.date
      ) {
        await loadDayDetails(selectedDate);
      }
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleOpenModal = () => {
    const baseDate = selectedDate || currentDate;
    setNewSession((session) => ({
      ...session,
      date: baseDate.toISOString().split("T")[0],
    }));
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

  const selectedDateActivities = selectedDate
    ? getActivitiesForDate(selectedDate.getDate())
    : [];
  const isFutureSelection =
    selectedDate !== null && selectedDate.getTime() > today.getTime();
  const sleepMinutes = !isFutureSelection
    ? dailyMetrics?.sleep_duration_minutes
    : null;
  const sleepScore = !isFutureSelection ? dailyMetrics?.sleep_score : null;
  const resolvedFatigue =
    fatigueValue ?? dailyMetrics?.fatigue_level ?? null;
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
            <h1 className="text-3xl font-bold">{monthNames[month]}</h1>
            <h2 className="text-3xl font-bold text-muted">{year}</h2>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth(1)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
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
            {isLoading && <Spinner size="sm" />}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card padding="sm" className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-xs text-muted uppercase">
                  Durée planifiée (mois)
                </p>
                <p className="text-xl font-bold">
                  {formatHoursFromMinutes(monthStats.plannedDuration)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">Réalisé</p>
              <p className="text-sm font-semibold">
                {formatHoursFromMinutes(monthStats.actualDuration)}
              </p>
            </div>
          </Card>

          <Card padding="sm" className="flex items-center justify-between gap-3">
            <div className={cn("flex items-center gap-2")}>
              <Activity className="h-5 w-5 text-accent" />
              <div>
                <p className="text-xs text-muted uppercase">
                  Distance prévue (mois)
                </p>
                <p className="text-xl font-bold">
                  {monthStats.plannedDistance.toFixed(1)}
                  <span className="text-sm text-muted ml-1">km</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">Complétée</p>
              <p className="text-sm font-semibold">
                {monthStats.actualDistance.toFixed(1)} km
              </p>
            </div>
          </Card>

          <Card padding="sm" className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              <div>
                <p className="text-xs text-muted uppercase">Charge TSS</p>
                <p className="text-xl font-bold">{monthStats.actualTss}</p>
              </div>
            </div>
            <Badge variant="outline" size="sm">
              Objectif {monthStats.plannedTss}
            </Badge>
          </Card>

          <Card padding="sm" className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted uppercase">Séances</p>
              <p className="text-xl font-bold">{monthStats.completedSessions}</p>
            </div>
            <p className="text-sm text-muted">
              sur {monthStats.sessions} prévues
            </p>
          </Card>
        </div>

        {/* Calendar View */}
        {viewMode === "month" ? (
          <Card>
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 gap-px border-b border-dark-200 mb-2">
                  {dayNames.map((day) => (
                    <div
                      key={day}
                      className="p-3 text-center text-sm text-muted font-medium"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px">
                  {Array.from({ length: startingDay }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="min-h-[100px] p-2 bg-dark-100/50"
                    />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayActivities = getActivitiesForDate(day);
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
                          "min-h-[100px] p-2 cursor-pointer transition-colors border",
                          isCurrentDay(day)
                            ? "border-accent bg-accent/5"
                            : isSelected
                            ? "border-secondary bg-secondary/5"
                            : "border-transparent hover:bg-dark-100"
                        )}
                      >
                        <div
                          className={cn(
                            "text-sm font-medium mb-2",
                            isCurrentDay(day) && "text-accent"
                          )}
                        >
                          {day}
                          {isCurrentDay(day) && (
                            <span className="ml-1 h-1.5 w-1.5 bg-accent rounded-full inline-block" />
                          )}
                        </div>

                        <div className="space-y-1">
                          {dayActivities.slice(0, 3).map((activity) => (
                            <div
                              key={activity.id}
                              className={cn(
                                "px-2 py-1 rounded text-xs font-medium truncate",
                                activity.status === "completed"
                                  ? "bg-success/20 text-success"
                                  : activity.status === "skipped"
                                  ? "bg-error/20 text-error"
                                  : ""
                              )}
                              style={
                                activity.status === "planned"
                                  ? {
                                      backgroundColor: `${getSportColor(
                                        activity.sport_name
                                      )}20`,
                                      color: getSportColor(activity.sport_name),
                                    }
                                  : undefined
                              }
                            >
                              {activity.title.length > 10
                                ? `${activity.title.substring(0, 10)}...`
                                : activity.title}
                            </div>
                          ))}
                          {dayActivities.length > 3 && (
                            <div className="text-xs text-muted">
                              +{dayActivities.length - 3} autres
                            </div>
                          )}
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
            <div className="flex flex-wrap gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-muted uppercase">
                  Durée planifiée
                </p>
                <p className="font-semibold">
                  {formatHoursFromMinutes(weeklyStats.plannedMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">
                  Durée réalisée
                </p>
                <p className="font-semibold">
                  {formatHoursFromMinutes(weeklyStats.actualMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Charge TSS</p>
                <p className="font-semibold">
                  {weeklyStats.actualTss}/{weeklyStats.plannedTss}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Séances</p>
                <p className="font-semibold">
                  {weeklyStats.completedSessions}/{weeklyStats.sessions}
                </p>
              </div>
            </div>

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
                    key={day.date.toISOString()}
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
                      <div>
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
                          <div
                            key={activity.id}
                            className="px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${getSportColor(
                                activity.sport_name
                              )}20`,
                              color: getSportColor(activity.sport_name),
                            }}
                          >
                            {activity.title}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-muted">
                          Aucune séance planifiée
                        </span>
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
                  <Card key={activity.id} variant="interactive" padding="sm">
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
                            ? formatDuration(activity.planned_duration_minutes)
                            : "--:--"}{" "}
                          h
                        </p>
                        <p>
                          {activity.planned_distance_km?.toFixed(1) || "--"} km
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">RÉALISÉ</p>
                        <p className="font-bold">
                          {activity.actual_duration_minutes
                            ? formatDuration(activity.actual_duration_minutes)
                            : "--:--"}
                        </p>
                        <p>{activity.actual_distance_km?.toFixed(1) || "--"}</p>
                      </div>
                    </div>

                    {activity.status === "planned" && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full mt-3"
                      >
                        Saisir
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
                  <span className="text-xs text-muted uppercase">Sommeil</span>
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
                {sleepScore ? (
                  <Progress
                    value={sleepScore}
                    max={100}
                    size="sm"
                    className="mt-2"
                  />
                ) : (
                  <p className="text-xs text-muted mt-2">
                    {isFutureSelection
                      ? "Les données apparaîtront après la nuit."
                      : "Aucune donnée WHOOP pour ce jour."}
                  </p>
                )}
              </div>

              {/* Fatigue */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted">Fatigue ressentie</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      fatigueStatus.color
                    )}
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
                <div className="flex justify-between text-xs text-muted mt-1">
                  <span>FRAIS</span>
                  <span>ÉPUISÉ</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Notes */}
        {selectedDate && (
          <Card>
            <h4 className="font-medium flex items-center gap-2 mb-4">
              <NotebookPen className="h-4 w-4 text-muted" />
              Notes
            </h4>
            <textarea
              className="w-full h-24 bg-dark-100 rounded-xl p-3 text-sm resize-none border border-dark-200 focus:border-accent focus:outline-none"
              placeholder="Commentaire sur la séance, sensation particulière..."
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
        title="Planifier une séance"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={newSession.date}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, date: e.target.value }))
              }
            />
            <Select
              label="Sport"
              value={newSession.sportId}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, sportId: e.target.value }))
              }
              placeholder="Choisissez un sport"
              options={sports.map((sport) => ({
                value: sport.id,
                label: sport.name_fr,
              }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Durée (minutes)"
              type="number"
              min={0}
              value={newSession.duration}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, duration: e.target.value }))
              }
            />
            <Input
              label="Distance (km)"
              type="number"
              min={0}
              step="0.1"
              value={newSession.distance}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, distance: e.target.value }))
              }
            />
          </div>
          <Select
            label="Intensité"
            value={newSession.intensity}
            onChange={(e) =>
              setNewSession((prev) => ({ ...prev, intensity: e.target.value }))
            }
            options={[
              { value: "recovery", label: "Récupération" },
              { value: "endurance", label: "Endurance" },
              { value: "tempo", label: "Tempo" },
              { value: "threshold", label: "Seuil" },
              { value: "vo2max", label: "VO2max" },
              { value: "anaerobic", label: "Anaérobie" },
            ]}
          />

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSession}
              isLoading={isSavingSession}
              disabled={
                !newSession.title || !newSession.date || !newSession.sportId
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
