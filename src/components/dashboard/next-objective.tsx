"use client";

import { Card, Badge, Progress } from "@/components/ui";
import { Flag, Calendar } from "lucide-react";
import { daysUntil } from "@/lib/utils";

interface NextObjectiveProps {
  name: string;
  date: string;
  priority: "A" | "B" | "C";
  planCompletion?: number;
  planVolume?: {
    completed: number;
    total: number;
  };
  confidenceScore?: number;
  confidenceLabel?: "Haute" | "Moyenne" | "Faible";
}

export function NextObjective({
  name,
  date,
  priority,
  planCompletion = 0,
  planVolume,
  confidenceScore,
  confidenceLabel,
}: NextObjectiveProps) {
  const days = daysUntil(date);
  const formattedDate = new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const priorityColors = {
    A: "bg-accent",
    B: "bg-secondary",
    C: "bg-muted",
  };
  const completionPercent = Math.round(Math.min(1, Math.max(0, planCompletion)) * 100);
  const confidenceBadgeClasses = {
    Haute: "bg-success/20 text-success",
    Moyenne: "bg-warning/20 text-warning",
    Faible: "bg-error/20 text-error",
  };
  const formatVolume = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (minutes <= 0) return "0h";
    if (m === 0) return `${h}h`;
    if (h === 0) return `${m} min`;
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="bg-gradient-to-br from-secondary/20 to-accent/10 border-secondary/30">
      <div className="flex items-center gap-2 mb-3">
        <Flag className="h-4 w-4 text-muted" />
        <span className="text-xs text-muted uppercase tracking-wide">
          Prochain Objectif
        </span>
      </div>

      <h3 className="text-lg font-bold mb-1">{name}</h3>

      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <Calendar className="h-4 w-4" />
        <span>{formattedDate}</span>
        <Badge variant="default" size="sm" className={priorityColors[priority]}>
          Course {priority}
        </Badge>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-accent">{days}</span>
        <span className="text-muted">Jours restants</span>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-muted uppercase mb-1">
            <span>Plan complété</span>
            <span>{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} max={100} />
          {planVolume && planVolume.total > 0 && (
            <p className="text-xs text-muted mt-1">
              {formatVolume(planVolume.completed)} /{" "}
              {formatVolume(planVolume.total)} du volume total prévu
            </p>
          )}
        </div>

        {(confidenceScore !== undefined || confidenceLabel) && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-muted">
                Confiance IA
              </span>
              <Badge
                variant="outline"
                size="sm"
                className={
                  confidenceLabel
                    ? confidenceBadgeClasses[confidenceLabel]
                    : "bg-dark-200 text-muted"
                }
              >
                {confidenceLabel || "En calcul"}{" "}
                {confidenceScore !== undefined ? `• ${confidenceScore}%` : ""}
              </Badge>
            </div>
            <span className="text-xs text-muted">
              Basé sur les séances clés cochées
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
