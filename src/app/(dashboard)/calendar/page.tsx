"use client";

import { useState, useEffect } from "react";
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
} from "@/components/ui";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  Activity,
  Moon,
  Smile,
  Frown,
  Meh,
  Edit2,
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
  intensity: string | null;
  rpe: number | null;
}

interface DailyMetrics {
  sleep_duration_minutes: number | null;
  mood: number | null;
  fatigue_level: number | null;
  notes: string | null;
}

type ViewMode = "week" | "month";

export default function CalendarPage() {
  const supabase = createClient();
  const [, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics | null>(null);
  const [, setIsLoading] = useState(true);

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

  // Calculate week stats
  const weeklyStats = {
    volume: 54,
    volumeChange: 12,
    duration: { hours: 5, minutes: 30 },
    durationChange: 5,
    tss: 420,
    tssTarget: 450,
    form: 98,
  };

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

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

  const loadDayDetails = async (date: Date) => {
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
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const getActivitiesForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    return activities.filter((a) => a.scheduled_date === dateStr);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
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

  return (
    <div className="flex gap-6">
      {/* Main Calendar */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
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

          <div className="flex items-center gap-4">
            <Tabs
              defaultValue="month"
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              <TabsList>
                <TabsTrigger value="week">Semaine</TabsTrigger>
                <TabsTrigger value="month">Mois</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button leftIcon={<Plus className="h-4 w-4" />}>Séance</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card padding="sm" className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-accent" />
            <div>
              <p className="text-xs text-muted">Volume hebdo</p>
              <p className="text-xl font-bold">
                {weeklyStats.volume}
                <span className="text-sm font-normal text-muted ml-1">km</span>
              </p>
            </div>
            <Badge variant="success" size="sm">
              +{weeklyStats.volumeChange}%
            </Badge>
          </Card>

          <Card padding="sm" className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-secondary" />
            <div>
              <p className="text-xs text-muted">Durée totale</p>
              <p className="text-xl font-bold">
                {weeklyStats.duration.hours}h
                {weeklyStats.duration.minutes.toString().padStart(2, "0")}
              </p>
            </div>
            <Badge variant="success" size="sm">
              +{weeklyStats.durationChange}%
            </Badge>
          </Card>

          <Card padding="sm" className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-warning" />
            <div>
              <p className="text-xs text-muted">Charge (TSS)</p>
              <p className="text-xl font-bold">{weeklyStats.tss}</p>
            </div>
            <span className="text-xs text-accent">
              Cible: {weeklyStats.tssTarget}
            </span>
          </Card>

          <Card padding="sm" className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-success" />
            <div>
              <p className="text-xs text-muted">Forme</p>
              <p className="text-xl font-bold">{weeklyStats.form}%</p>
            </div>
            <Badge variant="outline" size="sm">
              Stable
            </Badge>
          </Card>
        </div>

        {/* Calendar Grid */}
        <Card>
          {/* Day headers */}
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

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-px">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: startingDay }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[100px] p-2 bg-dark-100/50"
              />
            ))}

            {/* Days of the month */}
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
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={cn(
                    "min-h-[100px] p-2 cursor-pointer transition-colors border",
                    isToday(day)
                      ? "border-accent bg-accent/5"
                      : isSelected
                      ? "border-secondary bg-secondary/5"
                      : "border-transparent hover:bg-dark-100"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium mb-2",
                      isToday(day) && "text-accent"
                    )}
                  >
                    {day}
                    {isToday(day) && (
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
        </Card>
      </div>

      {/* Right Panel - Day Details */}
      {selectedDate && (
        <div className="w-80 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-accent uppercase">
                  Aujourd&apos;hui
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
                <Button variant="ghost" size="sm">
                  <Edit2 className="h-3 w-3 mr-1" />
                  Modifier
                </Button>
              </div>

              {selectedDateActivities.length === 0 ? (
                <div className="text-center py-6 text-muted text-sm">
                  <p>Pas d&apos;entraînement prévu</p>
                  <Button variant="ghost" size="sm" className="mt-2">
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

          {/* Journal du jour */}
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
                  {dailyMetrics?.sleep_duration_minutes
                    ? `${Math.floor(
                        dailyMetrics.sleep_duration_minutes / 60
                      )}h${(dailyMetrics.sleep_duration_minutes % 60)
                        .toString()
                        .padStart(2, "0")}`
                    : "7h15"}
                </p>
                <Progress value={75} max={100} size="sm" className="mt-2" />
              </div>

              {/* Mood */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted uppercase">Humeur</span>
                  <Smile className="h-4 w-4 text-muted" />
                </div>
                <div className="flex gap-2">
                  {[Frown, Meh, Smile].map((Icon, i) => (
                    <button
                      key={i}
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center transition-all",
                        dailyMetrics?.mood === i + 1
                          ? "bg-accent text-dark"
                          : "bg-dark-100 text-muted hover:bg-dark-200"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Fatigue */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted">Fatigue ressentie</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      (dailyMetrics?.fatigue_level || 7) > 7
                        ? "text-error"
                        : (dailyMetrics?.fatigue_level || 7) > 4
                        ? "text-warning"
                        : "text-success"
                    )}
                  >
                    Élevée ({dailyMetrics?.fatigue_level || 7}/10)
                  </span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  value={dailyMetrics?.fatigue_level || 7}
                  showValue={false}
                />
                <div className="flex justify-between text-xs text-muted mt-1">
                  <span>FRAIS</span>
                  <span>ÉPUISÉ</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Notes */}
          <Card>
            <h4 className="font-medium flex items-center gap-2 mb-4">
              <Edit2 className="h-4 w-4 text-muted" />
              Notes
            </h4>
            <textarea
              className="w-full h-24 bg-dark-100 rounded-xl p-3 text-sm resize-none border border-dark-200 focus:border-accent focus:outline-none"
              placeholder="Commentaire sur la séance, sensation particulière..."
              defaultValue={dailyMetrics?.notes || ""}
            />
            <Button variant="ghost" size="sm" className="mt-2 w-full">
              Sauvegarder
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
