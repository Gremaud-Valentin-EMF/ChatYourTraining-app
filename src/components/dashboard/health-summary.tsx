"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Heart, Moon, Activity, ArrowRight } from "lucide-react";

interface HealthSummaryProps {
  hrv?: number;
  restingHr?: number;
  sleepHours?: number;
  sleepQuality?: number;
  strain?: number;
}

export function HealthSummary({
  hrv,
  restingHr,
  sleepHours,
  sleepQuality,
  strain,
}: HealthSummaryProps) {
  const formatSleep = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
  };

  const getStatus = (
    value: number | undefined,
    good: number,
    warning: number,
    reverse = false
  ) => {
    if (value === undefined)
      return { label: "Pas de données", text: "text-muted", dot: "bg-dark-300" };
    if (reverse) {
      if (value <= good)
        return { label: "Optimal", text: "text-success", dot: "bg-success" };
      if (value <= warning)
        return { label: "Correct", text: "text-warning", dot: "bg-warning" };
      return { label: "Élevé", text: "text-error", dot: "bg-error" };
    }
    if (value >= good)
      return { label: "Optimal", text: "text-success", dot: "bg-success" };
    if (value >= warning)
      return { label: "Correct", text: "text-warning", dot: "bg-warning" };
    return { label: "Bas", text: "text-error", dot: "bg-error" };
  };

  const hasData = hrv !== undefined || restingHr !== undefined || sleepHours !== undefined;
  const metricCards = [
    {
      id: "hrv",
      label: "VFC (HRV)",
      value: hrv !== undefined ? `${hrv} ms` : "--",
      status: getStatus(hrv, 55, 35),
    },
    {
      id: "resting-hr",
      label: "FC au repos",
      value: restingHr !== undefined ? `${restingHr} bpm` : "--",
      status: getStatus(restingHr, 52, 60, true),
    },
    {
      id: "sleep",
      label: "Sommeil",
      value:
        sleepHours !== undefined
          ? formatSleep(sleepHours)
          : sleepQuality !== undefined
          ? `${sleepQuality}%`
          : "--",
      status: getStatus(sleepQuality, 75, 60),
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
              className="flex items-center justify-between rounded-xl bg-dark-100 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {metric.id === "hrv" && (
                  <Activity className="h-4 w-4 text-accent" />
                )}
                {metric.id === "resting-hr" && (
                  <Heart className="h-4 w-4 text-error" />
                )}
                {metric.id === "sleep" && (
                  <Moon className="h-4 w-4 text-secondary" />
                )}
                <div>
                  <p className="text-xs text-muted uppercase">
                    {metric.label}
                  </p>
                  <p className="font-semibold">{metric.value}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${metric.status.text}`}>
                  {metric.status.label}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${metric.status.dot}`}
                />
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
