"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { TrendingUp } from "lucide-react";

interface ChartTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}

function ChartTooltipContent({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }

  const formatValue = (key: string) => {
    const entry = payload.find((p) => p.dataKey === key);
    if (!entry || typeof entry.value !== "number") return "-";
    const prefix =
      key === "tsb" && entry.value > 0 ? "+" : "";
    return `${prefix}${Math.round(entry.value)}`;
  };

  const formattedDate = new Date(label).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-xl bg-dark-100/95 backdrop-blur px-3 py-2 border border-dark-200 shadow-lg">
      <p className="text-[11px] uppercase tracking-wide text-muted mb-2">
        {formattedDate}
      </p>
      <div className="flex gap-4 text-xs">
        <div className="text-secondary">
          <p className="text-muted uppercase">CTL</p>
          <p className="font-semibold">{formatValue("ctl")}</p>
        </div>
        <div className="text-warning">
          <p className="text-muted uppercase">ATL</p>
          <p className="font-semibold">{formatValue("atl")}</p>
        </div>
        <div className="text-accent">
          <p className="text-muted uppercase">TSB</p>
          <p className="font-semibold">{formatValue("tsb")}</p>
        </div>
      </div>
    </div>
  );
}

interface TrainingLoadData {
  date: string;
  atl: number;
  ctl: number;
  tsb: number;
}

interface TrainingLoadChartProps {
  data: TrainingLoadData[];
  currentAtl: number;
  currentCtl: number;
  currentTsb: number;
}

export function TrainingLoadChart({
  data,
  currentAtl,
  currentCtl,
  currentTsb,
}: TrainingLoadChartProps) {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component is mounted before rendering chart (fixes hydration issues)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Filter data based on selected period
  const filteredData = data.slice(-parseInt(period));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const getTrainingStatus = (ratio: number) => {
    if (ratio >= 1.2) {
      return {
        label: "Surcharge",
        color: "text-error",
        barColor: "var(--error)",
        description: "Charge trop haute, risque de blessure.",
      };
    }
    if (ratio >= 0.95) {
      return {
        label: "Productif",
        color: "text-warning",
        barColor: "var(--warning)",
        description: "Charge en hausse contrôlée.",
      };
    }
    return {
      label: "Maintien",
      color: "text-success",
      barColor: "var(--success)",
      description: "Charge stable, focus technique.",
    };
  };

  const getTsbStatus = (tsb: number) => {
    if (tsb > 25) return { label: "Très frais", color: "text-secondary" };
    if (tsb > 5) return { label: "Frais", color: "text-success" };
    if (tsb > -10) return { label: "Optimal", color: "text-accent" };
    if (tsb > -30) return { label: "Fatigué", color: "text-warning" };
    return { label: "Attention", color: "text-error" };
  };

  const tsbStatus = getTsbStatus(currentTsb);
  const hasData = data.length > 0;
  const loadRatio = currentCtl > 0 ? currentAtl / Math.max(currentCtl, 1) : 1;
  const clampedRatio = Math.min(1.5, Math.max(0.5, loadRatio));
  const trainingProgress = ((clampedRatio - 0.5) / 1) * 100;
  const trainingStatus = getTrainingStatus(loadRatio);

  return (
    <Card className="col-span-full lg:col-span-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-accent/20 rounded-xl">
            <TrendingUp className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold">Charge d&apos;entraînement</h3>
            <p className="text-sm text-muted">
              ATL (Fatigue) vs CTL (Forme) vs TSB (Équilibre)
            </p>
          </div>
        </div>

        {hasData && (
          <Tabs
            defaultValue="30"
            onValueChange={(v) => setPeriod(v as "7" | "30" | "90")}
            className="w-full md:w-auto"
          >
            <TabsList className="w-full md:w-auto justify-between">
              <TabsTrigger value="7">7J</TabsTrigger>
              <TabsTrigger value="30">30J</TabsTrigger>
              <TabsTrigger value="90">90J</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-12 w-12 text-muted mb-4 opacity-50" />
          <p className="text-muted mb-2">Aucune donnée d&apos;entraînement</p>
          <p className="text-sm text-muted opacity-75">
            Connectez Strava ou ajoutez des activités pour voir votre charge
            d&apos;entraînement
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-muted uppercase tracking-wide mb-2">
              <span>Statut d&apos;entraînement</span>
              <span>
                ATL/CTL {Math.round(currentAtl)} / {Math.round(currentCtl)}
              </span>
            </div>
            <div className="flex flex-col gap-1 mb-2">
              <span className={`text-sm font-semibold ${trainingStatus.color}`}>
                {trainingStatus.label}
              </span>
              <span className="text-xs text-muted">
                {trainingStatus.description}
              </span>
            </div>
            <div className="h-2 w-full bg-dark-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${trainingProgress}%`,
                  backgroundColor: trainingStatus.barColor,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted uppercase mt-1">
              <span>Maintien</span>
              <span>Productif</span>
              <span>Surcharge</span>
            </div>
          </div>

          {/* Current values */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-dark-100 rounded-xl">
              <p className="text-xs text-muted uppercase tracking-wide mb-1">
                Forme (CTL)
              </p>
              <p className="text-2xl font-bold text-secondary">
                {Math.round(currentCtl)}
              </p>
            </div>
            <div className="p-4 bg-dark-100 rounded-xl">
              <p className="text-xs text-muted uppercase tracking-wide mb-1">
                Fatigue (ATL)
              </p>
              <p className="text-2xl font-bold text-warning">
                {Math.round(currentAtl)}
              </p>
            </div>
            <div className="p-4 bg-dark-100 rounded-xl border-l-2 border-accent">
              <p className="text-xs text-muted uppercase tracking-wide mb-1">
                Équilibre (TSB)
              </p>
              <p className={`text-2xl font-bold ${tsbStatus.color}`}>
                {currentTsb > 0 ? "+" : ""}
                {Math.round(currentTsb)}
              </p>
              <p className={`text-xs mt-1 ${tsbStatus.color}`}>
                {tsbStatus.label}
              </p>
            </div>
          </div>

          <div className="h-64 min-h-[256px] px-1 sm:px-0">
            {isMounted && (
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={filteredData}>
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
                  <YAxis stroke="var(--muted)" fontSize={12} />
                  <Tooltip
                    content={<ChartTooltipContent />}
                    cursor={{ stroke: "var(--dark-300)" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="ctl"
                    name="CTL (Forme)"
                    stroke="var(--secondary)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="atl"
                    name="ATL (Fatigue)"
                    stroke="var(--warning)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="tsb"
                    name="TSB (Équilibre)"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
