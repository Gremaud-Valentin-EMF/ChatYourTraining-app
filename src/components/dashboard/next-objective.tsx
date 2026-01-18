"use client";

import { Card, Badge, Progress } from "@/components/ui";
import { Flag, Calendar, TrendingUp } from "lucide-react";
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
  planCompletion,
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
    A: "bg-accent text-white",
    B: "bg-secondary text-white",
    C: "bg-muted text-foreground",
  };

  const completionPercent = Math.round((planCompletion || 0) * 100);

  const confidenceBadgeClasses = {
    Haute: "bg-success/20 text-success border-success/30",
    Moyenne: "bg-warning/20 text-warning border-warning/30",
    Faible: "bg-error/20 text-error border-error/30",
  };

  const formatVolume = (minutes: number) => {
    return Math.round(minutes / 60) + "h";
  };

  return (
    <Card padding="sm" className="bg-gradient-to-br from-secondary/10 to-accent/5 border-secondary/20">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-accent" />
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted">
            Prochain Objectif
          </h3>
        </div>
        <Badge className={priorityColors[priority]}>Priorité {priority}</Badge>
      </div>

      <div className="mb-4">
        <h4 className="text-xl font-bold mb-1">{name}</h4>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Calendar className="h-4 w-4" />
          <span>{formattedDate}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="p-2 bg-dark-100/50 rounded-xl backdrop-blur-sm">
          <span className="text-3xl font-bold text-accent">{days}</span>
        </div>
        <p className="text-sm text-muted">Jours avant<br/>l&apos;événement</p>
      </div>

      {/* Plan Insights Section */}
      {planCompletion !== undefined && (
        <div className="pt-4 border-t border-dark-200/50">
          <div className="flex justify-between items-center mb-3">
            <h5 className="text-sm font-medium flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-secondary" />
              Préparation
            </h5>
            {confidenceLabel && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded border ${confidenceBadgeClasses[confidenceLabel]}`}
              >
                Confiance {confidenceLabel}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted">Avancement du plan</span>
                <span className="font-medium">{completionPercent}%</span>
              </div>
              <Progress value={completionPercent} max={100} size="sm" />
            </div>

            {planVolume && planVolume.total > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-dark-100/50 p-2 rounded backdrop-blur-sm">
                  <span className="text-muted block mb-0.5">Réalisé</span>
                  <span className="font-medium">
                    {formatVolume(planVolume.completed)}
                  </span>
                </div>
                <div className="bg-dark-100/50 p-2 rounded backdrop-blur-sm">
                  <span className="text-muted block mb-0.5">Prévu</span>
                  <span className="font-medium">
                    {formatVolume(planVolume.total)}
                  </span>
                </div>
              </div>
            )}

            {confidenceScore !== undefined && (
              <div className="text-xs text-muted mt-1 text-center">
                Score de préparation: <span className="text-foreground font-medium">{confidenceScore}/100</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
