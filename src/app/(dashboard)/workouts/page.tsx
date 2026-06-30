"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  Spinner,
  Modal,
  Slider,
  DeleteConfirmationModal,
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
  Plus,
  Download,
  Search,
  Clock,
  MapPin,
  Heart,
  Zap,
  ChevronRight,
  ChevronLeft,
  Filter,
  Trash,
  Plug,
  Gauge,
  X,
} from "lucide-react";
import {
  cn,
  formatDuration,
  getSportColor,
  toLocalDateString,
} from "@/lib/utils";
import { getSportIconComponent } from "@/lib/sport-icons";
import type { IntegrationProvider } from "@/types/database";

interface Activity {
  id: string;
  title: string;
  scheduled_date: string;
  status: "planned" | "completed" | "skipped" | "in_progress";
  actual_duration_minutes: number | null;
  actual_distance_km: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_watts: number | null;
  tss: number | null;
  source: IntegrationProvider;
  intensity: string | null;
  description?: string | null;
  sport: {
    name: string;
    name_fr: string;
    color?: string;
    icon?: string | null;
  };
}

interface SportOption {
  id: string;
  name: string;
  name_fr: string;
}

const sourceColors: Record<IntegrationProvider, string> = {
  strava: "#FC4C02",
  whoop: "#00D46A",
  garmin: "#007CC3",
  manual: "#6b7280",
};

const sourceLabels: Record<IntegrationProvider, string> = {
  strava: "STRAVA",
  whoop: "WHOOP",
  garmin: "GARMIN",
  manual: "MANUEL",
};


type PeriodFilter = "all" | "week" | "month" | "3months";
type ActivityFilters = {
  period: PeriodFilter;
  sport: string;
  source: "all" | IntegrationProvider;
};

export default function WorkoutsPage() {
  const supabase = createClient();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const getDefaultSessionState = () => ({
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
    description: "",
  });

  const [sports, setSports] = useState<SportOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [newSession, setNewSession] = useState(getDefaultSessionState);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Filters
  const [filters, setFilters] = useState<ActivityFilters>({
    period: "all",
    sport: "all",
    source: "all",
  });

  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const applyFilterChanges = (changes: Partial<ActivityFilters>) => {
    setFilters((prev) => ({ ...prev, ...changes }));
    setCurrentPage(1);
  };

  const sportOptions = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((activity) => {
      const name = activity.sport?.name;
      if (!name) return;
      if (!map.has(name)) {
        map.set(name, activity.sport.name_fr || name);
      }
    });

    const sorted = Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "fr")
    );

    return [
      { value: "all", label: "Tous sports" },
      ...sorted.map(([value, label]) => ({ value, label })),
    ];
  }, [activities]);

  const sourceOptions = useMemo(() => {
    const uniqueSources = new Set<IntegrationProvider>();
    activities.forEach((activity) => {
      uniqueSources.add(activity.source);
    });

    const sortedSources = Array.from(uniqueSources).sort((a, b) =>
      sourceLabels[a].localeCompare(sourceLabels[b], "fr")
    );

    return [
      { value: "all", label: "Toutes sources" },
      ...sortedSources.map((source) => ({
        value: source,
        label: sourceLabels[source],
      })),
    ];
  }, [activities]);


  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters, searchQuery]);

  useEffect(() => {
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("activities")
        .select(
          `
          id,
          title,
          description,
          scheduled_date,
          status,
          actual_duration_minutes,
          actual_distance_km,
          elevation_gain_m,
          avg_hr,
          max_hr,
          avg_power_watts,
          tss,
          source,
          intensity,
          sports (name, name_fr, color, icon)
        `,
          { count: "exact" }
        )
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("scheduled_date", { ascending: false });

      // Apply filters
      if (filters.period !== "all") {
        const now = new Date();
        let startDate: Date;

        switch (filters.period) {
          case "week":
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case "month":
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case "3months":
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
          default:
            startDate = new Date(0);
        }

        query = query.gte(
          "scheduled_date",
          startDate.toISOString().split("T")[0]
        );
      }

      if (filters.sport !== "all") {
        query = query.eq("sports.name", filters.sport);
      }

      if (filters.source !== "all") {
        query = query.eq("source", filters.source);
      }

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch) {
        const searchValue = `%${trimmedSearch}%`;
        query = query.or(
          `title.ilike.${searchValue},description.ilike.${searchValue},intensity.ilike.${searchValue}`
        );
      }

      // Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count } = await query;

      if (data) {
        setActivities(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.map((a: any) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            sport_id: a.sport_id,
            scheduled_date: a.scheduled_date,
            completed_date: a.completed_date,
            status: a.status,
            planned_duration_minutes: a.planned_duration_minutes,
            actual_duration_minutes: a.actual_duration_minutes,
            planned_distance_km: a.planned_distance_km,
            actual_distance_km: a.actual_distance_km,
            elevation_gain_m: a.elevation_gain_m,
            intensity: a.intensity,
            rpe: a.rpe,
            tss: a.tss,
            avg_hr: a.avg_hr,
            max_hr: a.max_hr,
            avg_power_watts: a.avg_power_watts,
            source: a.source,
            sport: {
              name: a.sports?.name || "other",
              name_fr: a.sports?.name_fr || "Autre",
              color: a.sports?.color,
              icon: a.sports?.icon,
            },
          }))
        );
      }

      if (count !== null) {
        setTotalCount(count);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadSports = async () => {
    try {
      const { data, error } = await supabase
        .from("sports")
        .select("id, name, name_fr")
        .order("name_fr");

      if (error) {
        throw error;
      }

      setSports(data ?? []);
    } catch (error) {
      console.error("Error loading sports:", error);
    }
  };

  const refreshActivitiesFromFirstPage = async () => {
    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    await loadActivities();
  };

  const handleOpenModal = () => {
    setNewSession(getDefaultSessionState());
    setIsModalOpen(true);
  };

  const handleCreateSession = async () => {
    const { status, scheduledDate, completedDate } = deriveActivityStatus({
      plannedDate: newSession.plannedDate,
      realizedDate: newSession.realizedDate,
      todayStr: toLocalDateString(new Date()),
    });
    const realized = status === "completed";
    if (!newSession.title || !newSession.sportId || !scheduledDate) return;
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
        description: newSession.description || null,
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
      setNewSession(getDefaultSessionState());
      await refreshActivitiesFromFirstPage();
    } catch (error) {
      console.error("Error creating session:", error);
    } finally {
      setIsSavingSession(false);
    }
  };

  const openDeleteModal = (activity: Activity) =>
    setDeleteTarget({ id: activity.id, title: activity.title });

  const closeDeleteModal = () => setDeleteTarget(null);

  const handleDeleteActivity = async () => {
    const activityId = deleteTarget?.id;
    if (!activityId) return;
    setDeletingActivityId(activityId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("activities")
        .delete()
        .eq("id", activityId)
        .eq("user_id", user.id);

      await refreshActivitiesFromFirstPage();
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting activity:", error);
    } finally {
      setDeletingActivityId(null);
    }
  };

  const handleExportCSV = () => {
    // Create CSV content
    const headers = [
      "Date",
      "Sport",
      "Titre",
      "Durée",
      "Distance",
      "D+",
      "FC Moy",
      "FC Max",
      "TSS",
      "Source",
    ];
    const rows = activities.map((a) => [
      a.scheduled_date,
      a.sport.name_fr,
      a.title,
      a.actual_duration_minutes
        ? formatDuration(a.actual_duration_minutes)
        : "",
      a.actual_distance_km?.toFixed(1) || "",
      a.elevation_gain_m || "",
      a.avg_hr || "",
      a.max_hr || "",
      a.tss || "",
      sourceLabels[a.source],
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entrainements_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date
      .toLocaleDateString("fr-FR", { month: "short" })
      .toUpperCase();
    const time = date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const weather = "Matin"; // Could be derived from time

    return { day, month, time, weather };
  };

  const clearFilters = () => {
    setFilters({
      period: "all",
      sport: "all",
      source: "all",
    });
    setCurrentPage(1);
  };

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== "all"
  ).length;

  const visiblePageCount = Math.min(3, totalPages);
  const paginationStart =
    totalPages <= visiblePageCount
      ? 1
      : Math.max(
          1,
          Math.min(currentPage - 1, totalPages - visiblePageCount + 1)
        );
  const paginationPages = Array.from(
    { length: visiblePageCount },
    (_, index) => paginationStart + index
  );
  const paginationEnd =
    paginationPages[paginationPages.length - 1] || paginationStart;
  const showStartEllipsis = paginationStart > 1;
  const showEndEllipsis = paginationEnd < totalPages;

  const newSessionSlug =
    sports.find((s) => s.id === newSession.sportId)?.name ?? "";
  const newSessionFields = newSessionSlug
    ? getSportFields(newSessionSlug)
    : null;
  const newSessionStatus = deriveActivityStatus({
    plannedDate: newSession.plannedDate,
    realizedDate: newSession.realizedDate,
    todayStr: toLocalDateString(new Date()),
  }).status;
  const newSessionRealized = newSessionStatus === "completed";
  const mvpSportOptions = sports
    .filter((s) => isMvpSport(s.name))
    .map((s) => ({ value: s.id, label: s.name_fr || s.name }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Liste des Entraînements</h1>
          <p className="text-muted">
            Analysez vos performances, surveillez votre charge
            d&apos;entraînement et exportez vos données brutes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-end">
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            className="w-full sm:w-auto"
            onClick={handleOpenModal}
          >
            Ajouter manuel
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
            className="w-full sm:w-auto"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Search + the 3 filters share one column, so the filters span the search width */}
        <div className="flex-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Rechercher un titre, une description ou un objectif"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              key: "period",
              options: [
                { value: "all", label: "Toutes périodes" },
                { value: "week", label: "7 derniers jours" },
                { value: "month", label: "Ce mois" },
                { value: "3months", label: "3 derniers mois" },
              ],
              value: filters.period,
              onChange: (value: string) =>
                applyFilterChanges({
                  period: value as PeriodFilter,
                }),
            },
            {
              key: "sport",
              options: sportOptions,
              value: filters.sport,
              onChange: (value: string) =>
                applyFilterChanges({ sport: value }),
            },
            {
              key: "source",
              options: sourceOptions,
              value: filters.source,
              onChange: (value: string) =>
                applyFilterChanges({
                  source: value as "all" | IntegrationProvider,
                }),
            },
          ].map((config) => (
            <Select
              key={config.key}
              options={config.options}
              value={config.value}
              onChange={config.onChange}
              className="w-full"
              hideChevron
            />
          ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(activeFiltersCount > 0 && "text-accent")}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filtres
            {/* Always reserve the badge + clear space so the button keeps a
                constant width regardless of filter state. */}
            <span
              className={cn(
                "ml-2 inline-flex items-center gap-2",
                activeFiltersCount === 0 && "invisible pointer-events-none"
              )}
            >
              <Badge variant="success" size="sm">
                {activeFiltersCount}
              </Badge>
              <span
                role="button"
                tabIndex={activeFiltersCount > 0 ? 0 : -1}
                aria-label="Effacer les filtres"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFilters();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    clearFilters();
                  }
                }}
                className="inline-flex items-center justify-center rounded-md p-0.5 text-muted hover:text-foreground hover:bg-dark-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </span>
          </Button>
        </div>
      </div>

      {/* Activities List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-4">Aucune activité trouvée</p>
          <p className="text-sm text-muted mb-6">
            Connectez Strava ou Whoop pour importer automatiquement vos
            séances.
          </p>
          <Link href="/integrations">
            <Button variant="secondary" leftIcon={<Plug className="h-4 w-4" />}>
              Connecter une application
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile list */}
          <div className="space-y-4 lg:hidden">
            {activities.map((activity) => {
              const dateInfo = formatDate(activity.scheduled_date);
              const sportColor =
                activity.sport.color ?? getSportColor(activity.sport.name);
              const SportIcon = getSportIconComponent(
                activity.sport.icon ?? undefined
              );
              const fields = getSportFields(activity.sport.name);
              const showPower =
                fields.power && activity.avg_power_watts != null;
              const showDistance = !showPower && fields.distance;

              return (
                <Link
                  key={activity.id}
                  href={`/workouts/${activity.id}`}
                  className="block"
                >
                  <Card className="space-y-4 hover:border-accent transition-colors">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted uppercase">
                            {dateInfo.month} {dateInfo.day} • {dateInfo.time}
                          </p>
                          <h3 className="font-semibold">{activity.title}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <SportIcon className="h-4 w-4 text-accent" />
                            <p className="text-xs text-muted">
                              {activity.sport.name_fr}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: sourceColors[activity.source],
                            color: sourceColors[activity.source],
                          }}
                        >
                          {sourceLabels[activity.source]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: sportColor }}
                        />
                        <span className="text-muted">{dateInfo.weather}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted" />
                        <span>
                          {activity.actual_duration_minutes
                            ? formatDuration(activity.actual_duration_minutes)
                            : "--"}
                        </span>
                      </div>
                      {showPower ? (
                        <div className="flex items-center gap-1.5">
                          <Gauge className="h-4 w-4 text-muted" />
                          <span>
                            {Math.round(activity.avg_power_watts as number)}
                            <span className="text-muted"> W</span>
                          </span>
                        </div>
                      ) : showDistance ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-muted" />
                          <span>
                            {activity.actual_distance_km?.toFixed(1) || "--"} km
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-error" />
                        <span>
                          {activity.avg_hr || "--"}
                          <span className="text-muted">
                            /{activity.max_hr || "--"} bpm
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-muted" />
                        <span>
                          {activity.tss ?? "--"}
                          <span className="text-muted"> TSS</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label="Supprimer la séance"
                        isLoading={deletingActivityId === activity.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openDeleteModal(activity);
                        }}
                        leftIcon={<Trash className="h-4 w-4 text-muted" />}
                      />
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card padding="none" className="hidden lg:block">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-dark-200 text-xs text-muted uppercase tracking-wide">
              <div className="col-span-4">Date / Sport / Titre</div>
              <div className="col-span-4">Métriques clés</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-dark-200">
              {activities.map((activity) => {
                const dateInfo = formatDate(activity.scheduled_date);
                const sportColor =
                  activity.sport.color ?? getSportColor(activity.sport.name);
                const SportIcon = getSportIconComponent(
                  activity.sport.icon ?? undefined
                );
                const fields = getSportFields(activity.sport.name);
                const showPower =
                  fields.power && activity.avg_power_watts != null;
                const showDistance = !showPower && fields.distance;

                return (
                  <Link
                    key={activity.id}
                    href={`/workouts/${activity.id}`}
                    className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-dark-100 transition-colors items-center"
                  >
                    <div className="col-span-4 flex items-center gap-4">
                      <div
                        className="h-14 w-14 rounded-xl flex flex-col items-center justify-center text-white"
                        style={{ backgroundColor: sportColor }}
                      >
                        <span className="text-xs uppercase">
                          {dateInfo.month}
                        </span>
                        <span className="text-xl font-bold">
                          {dateInfo.day}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <SportIcon className="h-4 w-4 text-accent" />
                          <h3 className="font-medium">{activity.title}</h3>
                        </div>
                        <p className="text-sm text-muted">
                          {dateInfo.weather} • {activity.sport.name_fr}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-4 flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted" />
                        <span>
                          {activity.actual_duration_minutes
                            ? formatDuration(activity.actual_duration_minutes)
                            : "--"}
                        </span>
                      </div>
                      {showPower ? (
                        <div className="flex items-center gap-1.5">
                          <Gauge className="h-4 w-4 text-muted" />
                          <span>
                            {Math.round(activity.avg_power_watts as number)}
                            <span className="text-muted"> W</span>
                          </span>
                        </div>
                      ) : showDistance ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-muted" />
                          <span>
                            {activity.actual_distance_km?.toFixed(1) || "--"} km
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-error" />
                        <span>
                          {activity.avg_hr || "--"}
                          <span className="text-muted">
                            /{activity.max_hr || "--"} bpm
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-muted" />
                        <span>
                          {activity.tss ?? "--"}
                          <span className="text-muted"> TSS</span>
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: sourceColors[activity.source],
                          color: sourceColors[activity.source],
                        }}
                      >
                        {sourceLabels[activity.source]}
                      </Badge>
                    </div>

                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label="Supprimer la séance"
                        isLoading={deletingActivityId === activity.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openDeleteModal(activity);
                        }}
                        leftIcon={<Trash className="h-4 w-4 text-muted" />}
                      />
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {totalPages > 1 && !isLoading && activities.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-4 border border-dark-200 rounded-2xl lg:border-0 lg:border-t lg:rounded-none lg:mt-4">
          <Button
            variant="ghost"
            size="icon"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            leftIcon={<ChevronLeft className="h-4 w-4" />}
          />

          <>
            {showStartEllipsis && <span className="text-muted">...</span>}
            {paginationPages.map((pageNum) => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "primary" : "ghost"}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </Button>
            ))}
            {showEndEllipsis && (
              <>
                <span className="text-muted">...</span>
                <Button
                  key={`page-end-${totalPages}`}
                  variant={currentPage === totalPages ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                >
                  {totalPages}
                </Button>
              </>
            )}
          </>

          <Button
            variant="ghost"
            size="icon"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            leftIcon={<ChevronRight className="h-4 w-4" />}
          />
        </div>
      )}

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
            placeholder="Séance tempo, renouvellement, sortie longue..."
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
              className="w-full max-w-full"
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
              className="w-full max-w-full"
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

          <textarea
            className="w-full px-3 py-2 bg-dark-100 border border-dark-200 rounded-xl text-sm resize-none focus:border-accent focus:outline-none"
            rows={3}
            placeholder="Description de la séance (optionnel)..."
            value={newSession.description}
            onChange={(e) => setNewSession(prev => ({ ...prev, description: e.target.value }))}
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
      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteActivity}
        isLoading={Boolean(deletingActivityId)}
        description={
          deleteTarget
            ? `Supprimer la séance "${deleteTarget.title}" est irrémédiable.`
            : undefined
        }
      />
    </div>
  );
}
