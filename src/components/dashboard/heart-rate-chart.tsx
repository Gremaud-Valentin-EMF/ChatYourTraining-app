"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface HeartRateChartProps {
  heartrateData: number[];
  timeData: number[]; // seconds from start
  avgHr?: number;
  maxHr?: number;
  normalizedHr?: number;
  hrZones?: {
    z1: number; // Recovery < z1
    z2: number; // Endurance z1-z2
    z3: number; // Tempo z2-z3
    z4: number; // Threshold z3-z4
    z5: number; // VO2max > z4
  };
}

interface ChartDataPoint {
  time: number; // seconds
  timeFormatted: string;
  hr: number;
  zone: number;
}

// Format seconds to MM:SS or HH:MM:SS
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Determine HR zone (1-5) based on HR value and zones
function getZone(hr: number, zones?: HeartRateChartProps["hrZones"]): number {
  if (!zones) return 2; // Default to zone 2

  if (hr < zones.z1) return 1;
  if (hr < zones.z2) return 2;
  if (hr < zones.z3) return 3;
  if (hr < zones.z4) return 4;
  return 5;
}

// Zone colors
const zoneColors: Record<number, string> = {
  1: "#60a5fa", // Blue - Recovery
  2: "#22c55e", // Green - Endurance
  3: "#eab308", // Yellow - Tempo
  4: "#f97316", // Orange - Threshold
  5: "#ef4444", // Red - VO2max
};

const zoneLabels: Record<number, string> = {
  1: "Récupération",
  2: "Endurance",
  3: "Tempo",
  4: "Seuil",
  5: "VO2max",
};

export function HeartRateChart({
  heartrateData,
  timeData,
  avgHr,
  maxHr,
  normalizedHr,
  hrZones,
}: HeartRateChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Downsample data for performance (max ~500 points)
  const chartData = useMemo(() => {
    if (!heartrateData || !timeData || heartrateData.length === 0) return [];

    const maxPoints = 500;
    const step = Math.max(1, Math.floor(heartrateData.length / maxPoints));

    const data: ChartDataPoint[] = [];
    for (let i = 0; i < heartrateData.length; i += step) {
      data.push({
        time: timeData[i],
        timeFormatted: formatTime(timeData[i]),
        hr: heartrateData[i],
        zone: getZone(heartrateData[i], hrZones),
      });
    }

    return data;
  }, [heartrateData, timeData, hrZones]);

  // Calculate min/max for Y axis
  const { minHr, maxHrValue } = useMemo(() => {
    if (chartData.length === 0) return { minHr: 60, maxHrValue: 200 };

    const hrs = chartData.map((d) => d.hr);
    const min = Math.min(...hrs);
    const max = Math.max(...hrs);

    return {
      minHr: Math.max(40, min - 10),
      maxHrValue: Math.min(220, max + 10),
    };
  }, [chartData]);

  // Calculate time in each zone
  const zoneStats = useMemo(() => {
    if (chartData.length < 2) return null;

    const zoneTimes: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalTime = 0;

    for (let i = 1; i < chartData.length; i++) {
      const duration = chartData[i].time - chartData[i - 1].time;
      zoneTimes[chartData[i].zone] += duration;
      totalTime += duration;
    }

    return Object.entries(zoneTimes).map(([zone, time]) => ({
      zone: parseInt(zone),
      time,
      percentage: totalTime > 0 ? Math.round((time / totalTime) * 100) : 0,
    }));
  }, [chartData]);

  if (!isMounted || chartData.length === 0) {
    return (
      <div className="bg-surface rounded-xl p-4 border border-border">
        <p className="text-muted text-center py-8">
          Aucune donnée de fréquence cardiaque disponible
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Fréquence cardiaque</h3>
        <div className="flex gap-4 text-sm">
          {avgHr && (
            <div>
              <span className="text-muted">Moy:</span>{" "}
              <span className="text-foreground font-medium">{avgHr} bpm</span>
            </div>
          )}
          {normalizedHr && (
            <div>
              <span className="text-muted">NHR:</span>{" "}
              <span className="text-primary font-medium">
                {normalizedHr} bpm
              </span>
            </div>
          )}
          {maxHr && (
            <div>
              <span className="text-muted">Max:</span>{" "}
              <span className="text-foreground font-medium">{maxHr} bpm</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timeFormatted"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minHr, maxHrValue]}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => `${value}`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
              }}
              formatter={(value) => [`${value} bpm`, "FC"]}
              labelFormatter={(label) => `Temps: ${label}`}
            />
            {/* Reference lines for zones if provided */}
            {hrZones && (
              <>
                <ReferenceLine
                  y={hrZones.z2}
                  stroke="#22c55e"
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
                <ReferenceLine
                  y={hrZones.z4}
                  stroke="#f97316"
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
              </>
            )}
            {/* Average HR line */}
            {avgHr && (
              <ReferenceLine
                y={avgHr}
                stroke="#3b82f6"
                strokeDasharray="5 5"
                label={{
                  value: "Moy",
                  position: "right",
                  fill: "#3b82f6",
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="hr"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#hrGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Zone distribution */}
      {zoneStats && (
        <div className="mt-4">
          <p className="text-sm text-muted mb-2">Temps par zone</p>
          <div className="flex gap-1 h-4 rounded overflow-hidden">
            {zoneStats.map(({ zone, percentage }) =>
              percentage > 0 ? (
                <div
                  key={zone}
                  className="transition-all"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: zoneColors[zone],
                  }}
                  title={`${zoneLabels[zone]}: ${percentage}%`}
                />
              ) : null
            )}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted">
            {zoneStats.map(({ zone, percentage }) => (
              <div key={zone} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: zoneColors[zone] }}
                />
                <span>
                  Z{zone}: {percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
