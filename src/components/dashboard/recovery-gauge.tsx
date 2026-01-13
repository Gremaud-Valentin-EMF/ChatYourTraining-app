"use client";

import { Card } from "@/components/ui";
import { Battery } from "lucide-react";

interface RecoveryGaugeProps {
  score: number | null;
  label?: string;
}

export function RecoveryGauge({ score, label = "PRÊT" }: RecoveryGaugeProps) {
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

  const getStatus = () => {
    if (score >= 67) return "Optimal";
    if (score >= 34) return "Modéré";
    return "Faible";
  };

  return (
    <Card className="flex flex-col items-center justify-center">
      <div className="flex items-center gap-2 mb-4 self-start">
        <Battery className="h-4 w-4 text-muted" />
        <span className="text-sm text-muted uppercase tracking-wide">
          Récupération
        </span>
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
        className="mt-4 text-sm font-medium px-3 py-1 rounded-full"
        style={{
          backgroundColor: `${getColor()}20`,
          color: getColor(),
        }}
      >
        {getStatus()}
      </p>
    </Card>
  );
}
