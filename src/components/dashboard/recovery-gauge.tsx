"use client";

import { Card } from "@/components/ui";
import { Battery, AlertTriangle, CheckCircle2, Info, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface RecoveryGaugeProps {
  score: number | null;
  average?: number | null;
  deltaPercent?: number | null;
  label?: string;
}

const getReadinessStatus = (
  deltaPercent: number | null
): {
  label: string;
  description: string;
  color: string;
  Icon: LucideIcon;
} => {
  if (deltaPercent === null) {
    return {
      label: "Pas assez de données",
      description: "Connectez une source pour suivre la tendance.",
      color: "text-muted-foreground",
      Icon: Info,
    };
  }
  if (deltaPercent <= -12) {
    return {
      label: "Alerte",
      description: "Sous la moyenne, privilégie la récup.",
      color: "text-error",
      Icon: AlertTriangle,
    };
  }
  if (deltaPercent <= -5) {
    return {
      label: "Surveiller",
      description: "Légèrement en dessous, allège la séance.",
      color: "text-warning",
      Icon: AlertTriangle,
    };
  }
  if (deltaPercent < 4) {
    return {
      label: "Bon jour",
      description: "Dans la moyenne, charge nominale.",
      color: "text-success",
      Icon: TrendingUp,
    };
  }
  return {
    label: "Boost",
    description: "Au-dessus de la moyenne, séance qualitative OK.",
    color: "text-success",
    Icon: CheckCircle2,
  };
};

export function RecoveryGauge({
  score,
  average,
  deltaPercent,
  label = "PRÊT",
}: RecoveryGaugeProps) {
  // Handle no data case
  if (score === null) {
    return (
      <Card className="flex flex-col items-center justify-center">
        <div className="flex items-center gap-2 mb-4 self-start">
          <Battery className="h-4 w-4 text-muted" />
          <span className="text-sm text-muted uppercase tracking-wide">
            Récupération
          </span>
        </div>
        <div className="text-center py-8">
          <p className="text-muted text-sm">Aucune donnée de récupération</p>
          <p className="text-muted text-xs mt-1">
            Connectez WHOOP pour voir vos données
          </p>
        </div>
      </Card>
    );
  }

  // Calculate the arc for the gauge
  const radius = 60;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  // Only show 270 degrees (3/4 of circle)
  const arcLength = circumference * 0.75;
  const progress = (score / 100) * arcLength;
  const dashOffset = arcLength - progress;

  // Determine color based on score
  const getColor = () => {
    if (score >= 67) return "var(--success)";
    if (score >= 34) return "var(--warning)";
    return "var(--error)";
  };

  const status = getReadinessStatus(
    typeof deltaPercent === "number"
      ? Number(deltaPercent.toFixed(1))
      : null
  );
  const averageDisplay =
    average !== null && average !== undefined ? Math.round(average) : null;
  const deltaText =
    deltaPercent !== null && deltaPercent !== undefined
      ? `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`
      : null;

  return (
    <Card className="flex flex-col items-center justify-center">
      <div className="flex items-center justify-between gap-2 mb-4 w-full">
        <Battery className="h-4 w-4 text-muted" />
        <span className="text-sm text-muted uppercase tracking-wide flex-1 text-left">
          Récupération
        </span>
        {averageDisplay !== null && (
          <span className="text-xs text-muted">
            Moy. 7j {averageDisplay}%
          </span>
        )}
      </div>

      <div className="relative">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="transform rotate-[135deg]"
        >
          {/* Background arc */}
          <circle
            stroke="var(--dark-200)"
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Progress arc */}
          <circle
            stroke={getColor()}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            style={{
              transition: "stroke-dashoffset 0.5s ease",
              filter: `drop-shadow(0 0 8px ${getColor()})`,
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color: getColor() }}>
            {score}%
          </span>
          <span className="text-xs text-muted uppercase">{label}</span>
        </div>
      </div>

      <p
        className={`mt-4 text-sm font-semibold flex items-center gap-1 ${status.color}`}
      >
        <status.Icon className="h-4 w-4" />
        {status.label}
      </p>
      <p className="text-xs text-muted mt-1 text-center">
        {averageDisplay !== null && deltaText
          ? `${deltaText} vs moyenne ( ${averageDisplay}% )`
          : "Historique insuffisant"}
      </p>
      <p
        className="mt-2 text-xs font-medium px-3 py-1 rounded-full text-center"
        style={{
          backgroundColor: `${getColor()}12`,
          color: getColor(),
        }}
      >
        {status.description}
      </p>
    </Card>
  );
}
