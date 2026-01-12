"use client";

import { useState, useEffect } from "react";
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
import {
  Heart,
  Moon,
  Activity,
  Zap,
  RefreshCw,
  Scale,
  Check,
} from "lucide-react";

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

  // Get latest metrics for reference
  void metrics[metrics.length - 1];

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

  // Generate demo data if no real data
  const displayMetrics =
    metrics.length > 0 ? metrics : generateDemoMetrics(parseInt(period));

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
  const avgHRV = Math.round(
    displayMetrics.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) /
      displayMetrics.length
  );

  // Average resting HR for reference
  void (
    displayMetrics.reduce((sum, m) => sum + (m.resting_hr || 0), 0) /
    displayMetrics.length
  );

  const todayData = displayMetrics[displayMetrics.length - 1] || {
    recovery_score: 82,
    hrv_ms: 65,
    sleep_duration_minutes: 462,
    sleep_score: 85,
    strain: 2.4,
    resting_hr: 52,
    sleep_deep_minutes: 112,
    sleep_rem_minutes: 135,
    sleep_light_minutes: 190,
    sleep_awake_minutes: 25,
  };

  const recoveryStatus = getRecoveryStatus(todayData.recovery_score || 0);
  const hrvStatus = getHRVStatus(todayData.hrv_ms || 0, avgHRV);
  const stressStatus = getStressStatus(todayData.strain || 0);

  // Sleep hours calculated for reference
  void (todayData.sleep_duration_minutes
    ? todayData.sleep_duration_minutes / 60
    : 7.7);
  const formatSleepDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m.toString().padStart(2, "0")}m`;
  };

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
      <div className="grid grid-cols-4 gap-4">
        {/* Recovery Score */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Score de Récupération</span>
            <Heart className="h-5 w-5 text-success" />
          </div>
          <p className="text-4xl font-bold mb-1">
            {todayData.recovery_score || 82}%
          </p>
          <Badge variant="success" size="sm" className={recoveryStatus.bg}>
            {recoveryStatus.label}
          </Badge>
          <p className="text-xs text-muted mt-2">+12% vs moy.</p>

          {/* Background decoration */}
          <div
            className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full opacity-10"
            style={{ backgroundColor: "var(--success)" }}
          />
        </Card>

        {/* HRV */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">VFC (HRV)</span>
            <Activity className="h-5 w-5 text-secondary" />
          </div>
          <p className="text-4xl font-bold mb-1">
            {todayData.hrv_ms || 65}{" "}
            <span className="text-lg text-muted">ms</span>
          </p>
          <Badge variant="success" size="sm">
            {hrvStatus.label}
          </Badge>
          <p className="text-xs text-muted mt-2">{hrvStatus.change}</p>
        </Card>

        {/* Sleep */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Sommeil Total</span>
            <Moon className="h-5 w-5 text-secondary" />
          </div>
          <p className="text-4xl font-bold mb-1">
            {formatSleepDuration(todayData.sleep_duration_minutes || 462)}
          </p>
          <div className="flex gap-1 mt-2">
            <div
              className="h-1 w-8 bg-secondary rounded-full"
              title="Profond"
            />
            <div
              className="h-1 w-12 bg-accent rounded-full"
              title="Paradoxal"
            />
            <div className="h-1 w-16 bg-dark-300 rounded-full" title="Léger" />
          </div>
          <p className="text-xs text-muted mt-2">
            Profond{" "}
            {Math.round(
              ((todayData.sleep_deep_minutes || 112) /
                (todayData.sleep_duration_minutes || 462)) *
                100
            )}
            % • Paradoxal{" "}
            {Math.round(
              ((todayData.sleep_rem_minutes || 135) /
                (todayData.sleep_duration_minutes || 462)) *
                100
            )}
            %
          </p>
        </Card>

        {/* Stress/Strain */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Stress Quotidien</span>
            <Zap className="h-5 w-5 text-warning" />
          </div>
          <p className="text-4xl font-bold mb-1">
            {(todayData.strain || 2.4).toFixed(1)}
          </p>
          <Badge
            variant={
              todayData.strain && todayData.strain > 3 ? "warning" : "success"
            }
            size="sm"
          >
            {stressStatus.label}
          </Badge>
          <p className="text-xs text-muted mt-2">-0.3 vs moy.</p>
        </Card>
      </div>

      {/* Charts and details */}
      <div className="grid grid-cols-3 gap-6">
        {/* Trends chart */}
        <Card className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Tendances Physiologiques</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-accent" />
                <span>Récupération</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-warning" />
                <span>Repos (RHR)</span>
              </div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dark-200)" />
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--dark-50)",
                    border: "1px solid var(--dark-200)",
                    borderRadius: "12px",
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="recovery_score"
                  name="Récupération %"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--accent)" }}
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
        </Card>

        {/* Biometry */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Biométrie</h3>
              <button className="text-sm text-accent hover:underline">
                Modifier
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-dark-100 rounded-xl flex items-center justify-center">
                <Scale className="h-8 w-8 text-muted" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted">Poids</p>
                    <p className="text-2xl font-bold">
                      72.5 <span className="text-sm text-muted">kg</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted">Masse Grasse</p>
                    <p className="text-2xl font-bold">
                      12.4 <span className="text-sm text-muted">%</span>
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted mt-2">
                  Dernière pesée: Hier matin
                </p>
              </div>
            </div>
          </Card>

          {/* Sleep details */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Détails Sommeil</h3>
              <Badge variant="success" size="sm">
                Bonne qualité
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Profond</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={todayData.sleep_deep_minutes || 112}
                    max={todayData.sleep_duration_minutes || 462}
                    className="w-24"
                    variant="default"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {formatSleepDuration(
                      todayData.sleep_deep_minutes || 112
                    ).replace("m", "")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Paradoxal</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={todayData.sleep_rem_minutes || 135}
                    max={todayData.sleep_duration_minutes || 462}
                    className="w-24"
                    variant="success"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {formatSleepDuration(
                      todayData.sleep_rem_minutes || 135
                    ).replace("m", "")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Léger</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={todayData.sleep_light_minutes || 190}
                    max={todayData.sleep_duration_minutes || 462}
                    className="w-24"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {formatSleepDuration(
                      todayData.sleep_light_minutes || 190
                    ).replace("m", "")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Éveillé</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={todayData.sleep_awake_minutes || 25}
                    max={todayData.sleep_duration_minutes || 462}
                    className="w-24"
                    variant="error"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {todayData.sleep_awake_minutes || 25}m
                  </span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-dark-200">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-success" />
                  <span>Cohérence du coucher</span>
                </div>
                <p className="text-xs text-muted ml-6 mt-1">
                  Vous vous êtes couché à 22:45 (+/- 15min de votre habitude).
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Generate demo data
function generateDemoMetrics(days: number): DailyMetrics[] {
  const metrics: DailyMetrics[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    metrics.push({
      date: date.toISOString().split("T")[0],
      recovery_score: Math.round(60 + Math.random() * 35),
      hrv_ms: Math.round(50 + Math.random() * 30),
      resting_hr: Math.round(48 + Math.random() * 12),
      sleep_duration_minutes: Math.round(360 + Math.random() * 180),
      sleep_score: Math.round(60 + Math.random() * 35),
      sleep_deep_minutes: Math.round(60 + Math.random() * 80),
      sleep_rem_minutes: Math.round(80 + Math.random() * 80),
      sleep_light_minutes: Math.round(150 + Math.random() * 80),
      sleep_awake_minutes: Math.round(10 + Math.random() * 30),
      strain: parseFloat((1 + Math.random() * 4).toFixed(1)),
      stress_level: Math.round(1 + Math.random() * 4),
    });
  }

  return metrics;
}
