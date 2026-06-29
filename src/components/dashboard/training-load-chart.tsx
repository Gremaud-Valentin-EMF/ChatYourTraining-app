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
import { interpretTSB } from "@/lib/calculations/training-load";

// US-13 gating thresholds (number of distinct days with a completed activity).
const MIN_DAYS_FOR_METRICS = 7; // < 7 → "données insuffisantes"
const MIN_DAYS_FOR_GRAPH = 14; // > 14 → show the 60-day line chart
const GRAPH_WINDOW_DAYS = 60;

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
    const prefix = key === "tsb" && entry.value > 0 ? "+" : "";
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
        <div className="text-error">
          <p className="text-muted uppercase">ATL</p>
          <p className="font-semibold">{formatValue("atl")}</p>
        </div>
        <div className="text-warning">
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
  /** Distinct days with a completed activity — gates the display (US-13). */
  activityDays: number;
}

export function TrainingLoadChart({
  data,
  currentAtl,
  currentCtl,
  currentTsb,
  activityDays,
}: TrainingLoadChartProps) {
  const [period, setPeriod] = useState<"7" | "30" | "60">(
    String(GRAPH_WINDOW_DAYS) as "60"
  );
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

  // US-13: TSB status comes from the shared interpretTSB (same thresholds as the AI coach).
  const tsbStatus = interpretTSB(currentTsb);
  const showMetrics = activityDays >= MIN_DAYS_FOR_METRICS;
  const showGraph = activityDays > MIN_DAYS_FOR_GRAPH && data.length > 0;

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

        {showGraph && (
          <Tabs
            defaultValue={String(GRAPH_WINDOW_DAYS)}
            onValueChange={(v) => setPeriod(v as "7" | "30" | "60")}
            className="w-full md:w-auto"
          >
            <TabsList className="w-full md:w-auto justify-between">
              <TabsTrigger value="7">7J</TabsTrigger>
              <TabsTrigger value="30">30J</TabsTrigger>
              <TabsTrigger value="60">60J</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {!showMetrics ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-12 w-12 text-muted mb-4 opacity-50" />
          <p className="text-muted mb-2">
            Données insuffisantes — les calculs gagnent en précision après 14
            jours d&apos;entraînement
          </p>
          <p className="text-sm text-muted opacity-75">
            Connectez Strava ou ajoutez des activités pour suivre votre charge
            d&apos;entraînement
          </p>
        </div>
      ) : (
        <>
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
              <p className="text-2xl font-bold text-error">
                {Math.round(currentAtl)}
              </p>
            </div>
            <div className="p-4 bg-dark-100 rounded-xl  ">
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

          {showGraph && (
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
                    stroke="var(--error)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="tsb"
                    name="TSB (Équilibre)"
                    stroke="var(--warning)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          )}
        </>
      )}
    </Card>
  );
}
