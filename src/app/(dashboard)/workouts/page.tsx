"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Button, Badge, Input, Select, Spinner } from "@/components/ui";
import {
  Plus,
  Download,
  Search,
  Clock,
  MapPin,
  Mountain,
  Heart,
  Zap,
  ChevronRight,
  ChevronLeft,
  Filter,
} from "lucide-react";
import { cn, formatDuration, getSportColor } from "@/lib/utils";
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
  sport: {
    name: string;
    name_fr: string;
  };
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

  // Filters
  const [filters, setFilters] = useState<ActivityFilters>({
    period: "all",
    sport: "all",
    source: "all",
    intensity: "all",
  });

  const pageSize = 10;
  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters]);

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
          sports (name, name_fr)
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

      if (filters.source !== "all") {
        query = query.eq("source", filters.source);
      }

      if (filters.intensity !== "all") {
        query = query.eq("intensity", filters.intensity);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Liste des Entraînements</h1>
            <Badge variant="info">{totalCount} Sessions</Badge>
          </div>
          <p className="text-muted">
            Analysez vos performances, surveillez votre charge
            d&apos;entraînement et exportez vos données brutes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
            Ajouter manuel
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Rechercher une session, un sport..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          options={[
            { value: "all", label: "Toutes périodes" },
            { value: "week", label: "7 derniers jours" },
            { value: "month", label: "Ce mois" },
            { value: "3months", label: "3 derniers mois" },
          ]}
          value={filters.period}
          onChange={(e) =>
            setFilters({
              ...filters,
              period: e.target.value as PeriodFilter,
            })
          }
          className="w-40"
        />

        <Select
          options={[
            { value: "all", label: "Tous sports" },
            { value: "running", label: "Course" },
            { value: "cycling", label: "Vélo" },
            { value: "swimming", label: "Natation" },
            { value: "strength", label: "Renforcement" },
          ]}
          value={filters.sport}
          onChange={(e) => setFilters({ ...filters, sport: e.target.value })}
          className="w-36"
        />

        <Select
          options={[
            { value: "all", label: "Toutes sources" },
            { value: "strava", label: "Strava" },
            { value: "garmin", label: "Garmin" },
            { value: "whoop", label: "WHOOP" },
            { value: "manual", label: "Manuel" },
          ]}
          value={filters.source}
          onChange={(e) =>
            setFilters({
              ...filters,
              source: e.target.value as "all" | IntegrationProvider,
            })
          }
          className="w-40"
        />

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

      {/* Activities List */}
      <Card padding="none">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-dark-200 text-xs text-muted uppercase tracking-wide">
          <div className="col-span-4">Date / Sport / Titre</div>
          <div className="col-span-4">Métriques clés</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted mb-4">Aucune activité trouvée</p>
            <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />}>
              Ajouter votre première séance
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-dark-200">
            {activities.map((activity) => {
              const dateInfo = formatDate(activity.scheduled_date);
              const sportColor = getSportColor(activity.sport.name);

              return (
                <div
                  key={activity.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-dark-100 transition-colors items-center"
                >
                  {/* Date & Title */}
                  <div className="col-span-4 flex items-center gap-4">
                    <div
                      className="h-14 w-14 rounded-xl flex flex-col items-center justify-center text-white"
                      style={{ backgroundColor: sportColor }}
                    >
                      <span className="text-xs uppercase">
                        {dateInfo.month}
                      </span>
                      <span className="text-xl font-bold">{dateInfo.day}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: sportColor }}
                        />
                        <h3 className="font-medium">{activity.title}</h3>
                      </div>
                      <p className="text-sm text-muted">
                        {dateInfo.weather} • {activity.sport.name_fr}
                      </p>
                    </div>
                  </div>

                  {/* Metrics */}
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
                      <Mountain className="h-4 w-4 text-muted" />
                      <span>{activity.elevation_gain_m || "--"}m</span>
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
                    <Badge
                      variant={
                        activity.tss && activity.tss > 100 ? "error" : "warning"
                      }
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      {activity.tss || "--"} TSS
                    </Badge>
                  </div>

                  {/* Source */}
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

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm">
                      {"{}"} JSON
                    </Button>
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-4 border-t border-dark-200">
            <Button
              variant="ghost"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "primary" : "ghost"}
                  size="icon"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}

            {totalPages > 5 && currentPage < totalPages - 2 && (
              <>
                <span className="text-muted">...</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentPage(totalPages)}
                >
                  {totalPages}
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
