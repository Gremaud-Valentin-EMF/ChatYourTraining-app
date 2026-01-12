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

  const getTsbStatus = (tsb: number) => {
    if (tsb > 25) return { label: "Très frais", color: "text-secondary" };
    if (tsb > 5) return { label: "Frais", color: "text-success" };
    if (tsb > -10) return { label: "Optimal", color: "text-accent" };
    if (tsb > -30) return { label: "Fatigué", color: "text-warning" };
    return { label: "Attention", color: "text-error" };
  };

  const tsbStatus = getTsbStatus(currentTsb);
  const hasData = data.length > 0;

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

          {/* Chart */}
          <div
            className="h-64 min-h-[256px]"
            style={{ width: "100%", height: 256 }}
          >
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
                    contentStyle={{
                      backgroundColor: "var(--dark-50)",
                      border: "1px solid var(--dark-200)",
                      borderRadius: "12px",
                    }}
                    labelFormatter={formatDate}
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
