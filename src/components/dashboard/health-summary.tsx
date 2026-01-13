"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Heart, Moon, Activity, ArrowRight } from "lucide-react";

interface HealthSummaryProps {
  hrv?: number;
  hrvBaseline?: number;
  hrvDeltaPct?: number;
  restingHr?: number;
  restingHrTrend?: number;
  sleepHours?: number;
  sleepDebtHours?: number;
  sleepTrendHours?: number;
  strain?: number;
}

export function HealthSummary({
  hrv,
  hrvBaseline,
  hrvDeltaPct,
  restingHr,
  restingHrTrend,
  sleepHours,
  sleepDebtHours,
  sleepTrendHours,
  strain,
}: HealthSummaryProps) {
  const formatSleep = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
  };

  const buildTrendIndicator = (
    delta?: number,
    reverse = false,
    threshold = 1
  ) => {
    if (delta === undefined) {
      return { symbol: "➡️", className: "text-muted" };
    }
    if (Math.abs(delta) < threshold) {
      return { symbol: "➡️", className: "text-muted" };
    }
    const isPositive = delta > 0;
    const isPositiveGood = reverse ? !isPositive : isPositive;
    return {
      symbol: isPositive ? "↗️" : "↘️",
      className: isPositiveGood ? "text-success" : "text-error",
    };
  };

  const getHrvStatus = () => {
    if (hrvDeltaPct === undefined)
      return { label: "Baseline inconnue", text: "text-muted" };
    if (hrvDeltaPct <= -15)
      return { label: "Fatigue ⚠️", text: "text-error" };
    if (hrvDeltaPct <= -5)
      return { label: "Surveillance", text: "text-warning" };
    return { label: "Stable 🟢", text: "text-success" };
  };

  const getRestingStatus = () => {
    if (restingHrTrend === undefined)
      return { label: "Stable", text: "text-muted" };
    if (restingHrTrend >= 2)
      return { label: "Stress élevé", text: "text-warning" };
    if (restingHrTrend <= -2)
      return { label: "Récupération", text: "text-success" };
    return { label: "Stable", text: "text-muted" };
  };

  const getSleepStatus = () => {
    if (sleepDebtHours === undefined)
      return { label: "Dette inconnue", text: "text-muted" };
    if (sleepDebtHours < 0.5)
      return { label: "Recharge 🟢", text: "text-success" };
    if (sleepDebtHours < 1.5)
      return { label: "Récup en cours", text: "text-warning" };
    return { label: "Dette élevée ⚠️", text: "text-error" };
  };

  const hasData =
    hrv !== undefined || restingHr !== undefined || sleepHours !== undefined;
  const metricCards = [
    {
      id: "hrv",
      label: "VFC (HRV)",
      value: hrv !== undefined ? `${Math.round(hrv)} ms` : "--",
      secondary:
        hrvBaseline !== undefined
          ? `Baseline 7j ${Math.round(hrvBaseline)} ms`
          : undefined,
      status: getHrvStatus(),
      trend: buildTrendIndicator(hrvDeltaPct, false, 2),
    },
    {
      id: "resting-hr",
      label: "FC au repos",
      value: restingHr !== undefined ? `${Math.round(restingHr)} bpm` : "--",
      secondary:
        restingHrTrend !== undefined
          ? `${restingHrTrend > 0 ? "+" : ""}${Math.round(
              restingHrTrend
            )} bpm vs hier`
          : undefined,
      status: getRestingStatus(),
      trend: buildTrendIndicator(restingHrTrend, true, 1),
    },
    {
      id: "sleep",
      label: "Sommeil",
      value: sleepHours !== undefined ? formatSleep(sleepHours) : "--",
      secondary:
        sleepDebtHours !== undefined
          ? `Dette: ${formatSleep(Math.max(0, sleepDebtHours))}`
          : undefined,
      status: getSleepStatus(),
      trend: buildTrendIndicator(sleepTrendHours, false, 0.25),
    },
  ];

  return (
    <Card className="h-full">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="h-5 w-5 text-accent" />
        <h3 className="font-semibold">Données de santé</h3>
      </div>

      {!hasData ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted mb-3">
            Consultez vos métriques détaillées de sommeil, VRC et stress.
          </p>
          <Link href="/integrations">
            <Button variant="secondary" size="sm">
              Connecter WHOOP
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {metricCards.map((metric) => (
            <div
              key={metric.id}
              className="flex items-start justify-between rounded-xl bg-dark-100 px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-dark-200 flex items-center justify-center">
                  {metric.id === "hrv" && (
                    <Activity className="h-4 w-4 text-accent" />
                  )}
                  {metric.id === "resting-hr" && (
                    <Heart className="h-4 w-4 text-error" />
                  )}
                  {metric.id === "sleep" && (
                    <Moon className="h-4 w-4 text-secondary" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted uppercase">
                    {metric.label}
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="font-semibold flex items-center gap-1">
                      {metric.value}
                      <span className={`text-base ${metric.trend.className}`}>
                        {metric.trend.symbol}
                      </span>
                    </span>
                    {metric.secondary && (
                      <span className="text-[11px] text-muted">
                        {metric.secondary}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className={`text-xs font-semibold ${metric.status.text}`}>
                {metric.status.label}
              </div>
            </div>
          ))}

          {strain !== undefined && (
            <div className="flex items-center justify-between pt-3 border-t border-dark-200">
              <span className="text-sm text-muted">Strain du jour</span>
              <span className="font-bold text-warning">
                {strain.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}

      <Link
        href="/health"
        className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-dark-200 text-sm text-accent hover:text-accent-400 transition-colors"
      >
        Aller à la page Santé
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
