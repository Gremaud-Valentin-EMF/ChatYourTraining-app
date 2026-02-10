"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from "recharts";

type ActivityStreamChartProps = {
  timeStream?: number[] | null;
  heartRateStream?: number[] | null;
  powerStream?: number[] | null;
};

type ChartPoint = {
  time: number;
  timeLabel: string;
  hr?: number | null;
  power?: number | null;
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function ActivityStreamChart({
  timeStream,
  heartRateStream,
  powerStream,
}: ActivityStreamChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const hasHr = Boolean(heartRateStream && heartRateStream.length > 0);
  const hasPower = Boolean(powerStream && powerStream.length > 0);
  const maxLength = Math.max(
    timeStream?.length ?? 0,
    heartRateStream?.length ?? 0,
    powerStream?.length ?? 0
  );

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!maxLength) return [];

    const data: ChartPoint[] = [];
    for (let i = 0; i < maxLength; i += 1) {
      const timeValue =
        timeStream && timeStream[i] !== undefined ? timeStream[i] : i;
      data.push({
        time: timeValue,
        timeLabel: formatTime(timeValue),
        hr: heartRateStream?.[i] ?? null,
        power: powerStream?.[i] ?? null,
      });
    }
    return data;
  }, [maxLength, timeStream, heartRateStream, powerStream]);

  const selectedPoint =
    selectedIndex !== null ? chartData[selectedIndex] : null;

  if (!hasHr && !hasPower) {
    return (
      <div className="rounded-2xl border border-dark-200 bg-dark-100 p-4">
        <p className="text-sm text-muted">
          Aucune donnée seconde par seconde disponible.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dark-200 bg-dark-100 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Courbes d&apos;entraînement
          </p>
          <p className="text-xs text-foreground/60">
            Cliquez sur la courbe pour verrouiller un point précis.
          </p>
        </div>
        <div className="text-xs text-foreground/70">
          {selectedPoint ? (
            <span>
              Sélection : {selectedPoint.timeLabel}
              {selectedPoint.hr !== null && selectedPoint.hr !== undefined
                ? ` • FC ${Math.round(selectedPoint.hr)} bpm`
                : ""}
              {selectedPoint.power !== null && selectedPoint.power !== undefined
                ? ` • P ${Math.round(selectedPoint.power)} W`
                : ""}
            </span>
          ) : (
            <span>Survolez pour lire les valeurs.</span>
          )}
        </div>
      </div>

      <div className="mt-4 h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            onClick={(state) => {
              const index =
                typeof state?.activeTooltipIndex === "number"
                  ? state.activeTooltipIndex
                  : null;
              setSelectedIndex(index);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--dark-200)" />
            <XAxis
              dataKey="time"
              tickFormatter={(value) => formatTime(Number(value))}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "var(--dark-200)" }}
              minTickGap={32}
            />
            {hasHr ? (
              <YAxis
                yAxisId="hr"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={{ stroke: "var(--dark-200)" }}
                width={40}
                domain={["auto", "auto"]}
                tickFormatter={(value) => `${Math.round(value)}`}
              />
            ) : null}
            {hasPower ? (
              <YAxis
                yAxisId="power"
                orientation="right"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={{ stroke: "var(--dark-200)" }}
                width={44}
                domain={["auto", "auto"]}
                tickFormatter={(value) => `${Math.round(value)}`}
              />
            ) : null}
            <Tooltip
              formatter={(value, name) => {
                if (name === "hr") return [`${Math.round(value as number)} bpm`, "FC"];
                if (name === "power")
                  return [`${Math.round(value as number)} W`, "Puissance"];
                return [value as number, name];
              }}
              labelFormatter={(label) =>
                `Temps : ${formatTime(Number(label))}`
              }
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
              }}
            />
            {selectedPoint ? (
              <ReferenceLine
                x={selectedPoint.time}
                stroke="#60a5fa"
                strokeDasharray="4 4"
              />
            ) : null}
            {hasHr ? (
              <Line
                type="monotone"
                dataKey="hr"
                yAxisId="hr"
                stroke="#ef4444"
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}
            {hasPower ? (
              <Line
                type="monotone"
                dataKey="power"
                yAxisId="power"
                stroke="#38bdf8"
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}
            <Brush
              dataKey="time"
              height={24}
              stroke="var(--dark-200)"
              fill="var(--dark-100)"
              travellerWidth={10}
              tickFormatter={(value) => formatTime(Number(value))}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
