"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Progress,
  Spinner,
} from "@/components/ui";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Heart, Moon, Activity, Zap, RefreshCw, Check } from "lucide-react";

interface DailyMetrics {
  date: string;
  recovery_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_duration_minutes: number | null;
  sleep_score: number | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_light_minutes: number | null;
  sleep_awake_minutes: number | null;
  strain: number | null;
  stress_level: number | null;
}

export default function HealthPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState<"7" | "30">("7");
  const [metrics, setMetrics] = useState<DailyMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [physio, setPhysio] = useState<{
    weight_kg: number | null;
    height_cm: number | null;
  } | null>(null);
  const [trendHover, setTrendHover] = useState<DailyMetrics | null>(null);
  const [trendHoverLabel, setTrendHoverLabel] = useState("");
  const [trendSelection, setTrendSelection] = useState<DailyMetrics | null>(
    null
  );
  const [trendSelectionLabel, setTrendSelectionLabel] = useState("");

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const daysAgo = parseInt(period);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { data } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate.toISOString().split("T")[0])
        .order("date");

      if (data) {
        setMetrics(data);
      }

      const { data: physioData } = await supabase
        .from("physiological_data")
        .select("weight_kg, height_cm")
        .eq("user_id", user.id)
        .single();
      if (physioData) {
        setPhysio({
          weight_kg: physioData.weight_kg,
          height_cm: physioData.height_cm,
        });
      }

      // Get last sync time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: integration } = await (supabase as any)
        .from("integrations")
        .select("last_sync_at")
        .eq("user_id", user.id)
        .eq("provider", "whoop")
        .single();

      if (integration?.last_sync_at) {
        setLastSync(new Date(integration.last_sync_at));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const displayMetrics = useMemo(
    () => (metrics.length > 0 ? metrics : []),
    [metrics]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", { weekday: "short" });
  };

  const getRecoveryStatus = (score: number) => {
    if (score >= 67)
      return { label: "Optimal", color: "text-success", bg: "bg-success/20" };
    if (score >= 34)
      return { label: "Modéré", color: "text-warning", bg: "bg-warning/20" };
    return { label: "Faible", color: "text-error", bg: "bg-error/20" };
  };

  const getHRVStatus = (hrv: number, avg: number) => {
    const diff = hrv - avg;
    const percent = (diff / avg) * 100;
    if (percent > 5)
      return {
        label: "Élevé",
        color: "text-success",
        change: `+${percent.toFixed(1)}% vs moy.`,
      };
    if (percent < -5)
      return {
        label: "Bas",
        color: "text-error",
        change: `${percent.toFixed(1)}% vs moy.`,
      };
    return {
      label: "Normal",
      color: "text-accent",
      change: `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% vs moy.`,
    };
  };

  const getStressStatus = (stress: number) => {
    if (stress <= 2) return { label: "Faible", color: "text-success" };
    if (stress <= 3) return { label: "Normal", color: "text-accent" };
    if (stress <= 4)
      return { label: "Légèrement Élevé", color: "text-warning" };
    return { label: "Élevé", color: "text-error" };
  };

  // Calculate averages
  const avgHRV =
    displayMetrics.length > 0
      ? Math.round(
          displayMetrics.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) /
            displayMetrics.length
        )
      : 0;

  // Average resting HR for reference
  void (
    displayMetrics.reduce((sum, m) => sum + (m.resting_hr || 0), 0) /
    displayMetrics.length
  );

  const todayData =
    displayMetrics.length > 0
      ? displayMetrics[displayMetrics.length - 1]
      : null;

  const recoveryStatus = todayData?.recovery_score
    ? getRecoveryStatus(todayData.recovery_score)
    : null;
  const hrvStatus =
    todayData?.hrv_ms !== undefined
      ? getHRVStatus(todayData.hrv_ms || 0, avgHRV || todayData.hrv_ms || 1)
      : null;
  const stressStatus = todayData?.strain
    ? getStressStatus(todayData.strain)
    : null;

  const formatSleepDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m.toString().padStart(2, "0")}m`;
  };

  const formatClockTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}h${m.toString().padStart(2, "0")}`;
  };

  const averageBedtimeMinutes = useMemo(() => {
    if (!displayMetrics.length) return null;
    const WAKE_MINUTES = 7 * 60;
    const samples = displayMetrics
      .map((m) => m.sleep_duration_minutes)
      .filter((value): value is number => typeof value === "number");
    if (!samples.length) return null;
    const total = samples.reduce((sum, duration) => {
      const bedtime = (WAKE_MINUTES - duration + 1440) % 1440;
      return sum + bedtime;
    }, 0);
    return Math.round(total / samples.length);
  }, [displayMetrics]);

  const averageBedtime =
    averageBedtimeMinutes !== null
      ? formatClockTime(averageBedtimeMinutes)
      : null;

  const handleTrendHover = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: any,
    persist = false
  ) => {
    const payload = state?.activePayload as
      | { payload: DailyMetrics }[]
      | undefined;
    if (payload && payload.length > 0) {
      const datum = payload[0].payload;
      const label = formatDate(datum.date);
      if (persist) {
        setTrendSelection(datum);
        setTrendSelectionLabel(label);
      } else {
        setTrendHover(datum);
        setTrendHoverLabel(label);
      }
    }
  };

  const clearTrendHover = () => {
    setTrendHover(null);
    setTrendHoverLabel("");
  };

  const activeTrendPoint =
    trendHover || trendSelection || todayData || null;
  const activeTrendLabel =
    trendHoverLabel ||
    trendSelectionLabel ||
    (activeTrendPoint ? formatDate(activeTrendPoint.date) : "");

  const bmi =
    physio?.weight_kg && physio?.height_cm
      ? physio.weight_kg /
        Math.pow(Number(physio.height_cm) / 100, 2)
      : null;

  const sleepQualityBadge = (() => {
    if (!todayData?.sleep_score) {
      return { label: "En attente", variant: "outline" as const };
    }
    if (todayData.sleep_score >= 80)
      return { label: "Bonne qualité", variant: "success" as const };
    if (todayData.sleep_score >= 65)
      return { label: "Correct", variant: "warning" as const };
    return { label: "À surveiller", variant: "error" as const };
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Aperçu Santé</h1>
          <p className="text-muted">
            Suivi de la récupération, du sommeil et de la charge physiologique.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Tabs
            defaultValue="7"
            onValueChange={(v) => setPeriod(v as "7" | "30")}
          >
            <TabsList>
              <TabsTrigger value="7">7 derniers jours</TabsTrigger>
              <TabsTrigger value="30">30 derniers jours</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Synchro WHOOP
            {lastSync && (
              <span className="text-xs text-muted ml-2">
                il y a {Math.round((Date.now() - lastSync.getTime()) / 60000)}m
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Main metrics cards */}
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Score de récupération</span>
            <Heart className="h-5 w-5 text-success" />
          </div>
          {todayData?.recovery_score ? (
            <>
              <p className="text-4xl font-bold mb-1">
                {todayData.recovery_score}%
              </p>
              {recoveryStatus && (
                <Badge variant="success" size="sm" className={recoveryStatus.bg}>
                  {recoveryStatus.label}
                </Badge>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Connectez WHOOP pour afficher votre récupération.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">VFC (HRV)</span>
            <Activity className="h-5 w-5 text-secondary" />
          </div>
          {todayData?.hrv_ms ? (
            <>
              <p className="text-4xl font-bold mb-1">
                {todayData.hrv_ms}
                <span className="text-lg text-muted"> ms</span>
              </p>
              {hrvStatus && (
                <>
                  <Badge variant="success" size="sm">
                    {hrvStatus.label}
                  </Badge>
                  <p className="text-xs text-muted mt-2">
                    {hrvStatus.change}
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Aucune donnée VFC sur cette période.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Sommeil total</span>
            <Moon className="h-5 w-5 text-secondary" />
          </div>
          {todayData?.sleep_duration_minutes ? (
            <>
              <p className="text-4xl font-bold mb-1">
                {formatSleepDuration(todayData.sleep_duration_minutes)}
              </p>
              <p className="text-xs text-muted">
                Heure moyenne de coucher: {averageBedtime || "--"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Synchronisez vos nuits pour afficher ces données.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Stress quotidien</span>
            <Zap className="h-5 w-5 text-warning" />
          </div>
          {todayData?.strain ? (
            <>
              <p className="text-4xl font-bold mb-1">
                {todayData.strain.toFixed(1)}
              </p>
              {stressStatus && (
                <Badge
                  variant={todayData.strain > 3 ? "warning" : "success"}
                  size="sm"
                >
                  {stressStatus.label}
                </Badge>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Aucune mesure de strain pour aujourd&apos;hui.
            </p>
          )}
        </Card>
      </div>

      {/* Charts and details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trends chart */}
        <Card className="col-span-2">
          <div className="mb-2">
            <h3 className="font-semibold">Tendances physiologiques</h3>
            <div className="flex flex-wrap gap-4 text-xs text-muted mt-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span>Récupération</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span>FC repos</span>
              </div>
            </div>
          </div>

          {!displayMetrics.length ? (
            <div className="py-12 text-center text-sm text-muted">
              Aucune donnée sur cette période.
            </div>
          ) : (
            <>
              {activeTrendPoint && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 text-sm bg-dark-100 rounded-xl p-4">
                  <div>
                    <p className="text-xs text-muted uppercase">Jour</p>
                    <p className="font-semibold">
                      {activeTrendLabel || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase">
                      Récupération
                    </p>
                    <p className="font-semibold text-accent">
                      {activeTrendPoint.recovery_score ?? "--"}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted uppercase">FC repos</p>
                    <p className="font-semibold text-warning">
                      {activeTrendPoint.resting_hr ?? "--"} bpm
                    </p>
                  </div>
                </div>
              )}

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={displayMetrics}
                    onMouseMove={(state) => handleTrendHover(state)}
                    onMouseLeave={() => clearTrendHover()}
                    onClick={(state) => handleTrendHover(state, true)}
                    onTouchEnd={(state) => handleTrendHover(state, true)}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--dark-200)"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      stroke="var(--muted)"
                      fontSize={12}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="var(--muted)"
                      fontSize={12}
                      domain={[0, 100]}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="var(--muted)"
                      fontSize={12}
                      domain={[40, 80]}
                    />
                    <Tooltip wrapperStyle={{ display: "none" }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="recovery_score"
                      name="Récupération %"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--accent)" }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="resting_hr"
                      name="FC Repos"
                      stroke="var(--warning)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>

        {/* Biometry and sleep */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Biométrie</h3>
              <button className="text-sm text-accent hover:underline">
                Mettre à jour
              </button>
            </div>
            {physio ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-dark-100 rounded-xl">
                  <p className="text-xs text-muted uppercase">Poids</p>
                  <p className="text-2xl font-bold">
                    {physio.weight_kg ?? "--"}
                    <span className="text-sm text-muted ml-1">kg</span>
                  </p>
                </div>
                <div className="p-3 bg-dark-100 rounded-xl">
                  <p className="text-xs text-muted uppercase">Taille</p>
                  <p className="text-2xl font-bold">
                    {physio.height_cm ?? "--"}
                    <span className="text-sm text-muted ml-1">cm</span>
                  </p>
                </div>
                <div className="p-3 bg-dark-100 rounded-xl">
                  <p className="text-xs text-muted uppercase">IMC</p>
                  <p className="text-2xl font-bold">
                    {bmi ? bmi.toFixed(1) : "--"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted text-center">
                Ajoutez vos données biométriques pour suivre votre évolution.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Détails sommeil</h3>
              <Badge variant={sleepQualityBadge.variant} size="sm">
                {sleepQualityBadge.label}
              </Badge>
            </div>
            {!todayData?.sleep_duration_minutes ? (
              <p className="text-sm text-muted">
                Aucune nuit synchronisée pour analyser les phases de sommeil.
              </p>
            ) : (
              <div className="space-y-3">
                {[
                  {
                    label: "Sommeil profond",
                    value: todayData.sleep_deep_minutes ?? 0,
                    info: "Récupération musculaire et hormonale.",
                    variant: "default" as const,
                  },
                  {
                    label: "Sommeil paradoxal",
                    value: todayData.sleep_rem_minutes ?? 0,
                    info: "Consolidation de la mémoire.",
                    variant: "success" as const,
                  },
                  {
                    label: "Sommeil léger",
                    value: todayData.sleep_light_minutes ?? 0,
                    info: "Transition et régulation autonome.",
                    variant: "default" as const,
                  },
                  {
                    label: "Éveils",
                    value: todayData.sleep_awake_minutes ?? 0,
                    info: "Éveils nocturnes cumulés.",
                    variant: "error" as const,
                  },
                ].map((phase) => (
                  <div key={phase.label} className="flex flex-col gap-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">{phase.label}</span>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={phase.value}
                          max={todayData.sleep_duration_minutes || 1}
                          className="w-28"
                          variant={phase.variant}
                        />
                        <span className="text-sm font-medium w-16 text-right">
                          {phase.variant === "error"
                            ? `${phase.value}m`
                            : formatSleepDuration(phase.value).replace("m", "")}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted">{phase.info}</p>
                  </div>
                ))}

                <div className="pt-3 mt-3 border-t border-dark-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-success" />
                    <span>Heure moyenne de coucher</span>
                  </div>
                  <p className="text-xs text-muted ml-6 mt-1">
                    {averageBedtime
                      ? `Vous vous couchez vers ${averageBedtime}.`
                      : "Synchronisez vos nuits pour suivre cette habitude."}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
