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
  DeleteConfirmationModal,
} from "@/components/ui";
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

const intensityLabels: Record<string, string> = {
  recovery: "Récupération",
  endurance: "Endurance",
  tempo: "Tempo",
  threshold: "Seuil",
  vo2max: "VO2Max",
  anaerobic: "Anaérobie",
};

const intensityOrder = [
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
];

const formatIntensityLabel = (value: string) => {
  const normalized = value.replace(/_/g, " ");
  const label = intensityLabels[value];
  if (label) {
    return label;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const manualIntensityOptions = intensityOrder.map((value) => ({
  value,
  label: formatIntensityLabel(value),
}));

type PeriodFilter = "all" | "week" | "month" | "3months";
type ActivityFilters = {
  period: PeriodFilter;
  sport: string;
  source: "all" | IntegrationProvider;
  intensity: string;
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
    date: toLocalDateString(new Date()),
    duration: "",
    distance: "",
    intensity: "endurance",
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
    intensity: "all",
  });

  const pageSize = 10;
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

  const intensityOptions = useMemo(() => {
    const intensities = Array.from(
      new Set(
        activities
          .map((activity) => activity.intensity)
          .filter(Boolean) as string[]
      )
    );

    const sortedIntensities = intensities.sort((a, b) => {
      const aIndex = intensityOrder.indexOf(a);
      const bIndex = intensityOrder.indexOf(b);
      if (aIndex === bIndex) {
        return a.localeCompare(b, "fr");
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    });

    return [
      { value: "all", label: "Toutes intensités" },
      ...sortedIntensities.map((value) => ({
        value,
        label: formatIntensityLabel(value),
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

      if (filters.intensity !== "all") {
        query = query.eq("intensity", filters.intensity);
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
      intensity: "all",
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
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
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
          <div className="flex flex-wrap gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(activeFiltersCount > 0 && "text-accent")}
            >
              <Filter className="h-4 w-4 mr-1" />
              Filtres
              {activeFiltersCount > 0 && (
                <Badge variant="success" size="sm" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Réinitialiser
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            {
              key: "intensity",
              options: intensityOptions,
              value: filters.intensity,
              onChange: (value: string) =>
                applyFilterChanges({ intensity: value }),
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

      {/* Activities List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-4">Aucune activité trouvée</p>
          <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />}>
            Ajouter une nouvelle séance
          </Button>
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
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-muted" />
                        <span>
                          {activity.actual_distance_km?.toFixed(1) || "--"} km
                        </span>
                      </div>
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
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-muted" />
                        <span>
                          {activity.actual_distance_km?.toFixed(1) || "--"} km
                        </span>
                      </div>
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
        title="Ajouter une séance"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              className="w-full"
              value={newSession.date}
              onChange={(e) =>
                setNewSession((prev) => ({ ...prev, date: e.target.value }))
              }
            />
            <Select
              label="Sport"
              value={newSession.sportId}
              onChange={(value) =>
                setNewSession((prev) => ({ ...prev, sportId: value }))
              }
              placeholder="Choisissez un sport"
              options={sports.map((sport) => ({
                value: sport.id,
                label: sport.name_fr || sport.name,
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
            onChange={(value) =>
              setNewSession((prev) => ({ ...prev, intensity: value }))
            }
            options={manualIntensityOptions}
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
