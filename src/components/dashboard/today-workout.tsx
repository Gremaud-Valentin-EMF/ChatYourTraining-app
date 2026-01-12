"use client";

import Link from "next/link";
import { Card, Badge, Button } from "@/components/ui";
import { Activity, Clock, Zap, Info, Check, X } from "lucide-react";
import { formatDuration, getSportColor } from "@/lib/utils";

interface TodayWorkoutProps {
  workout: {
    id: string;
    sport: string;
    sportName: string;
    title: string;
    scheduledTime?: string;
    plannedDuration: number;
    intensity: string;
    tss: number;
    status: "planned" | "completed" | "skipped" | "in_progress";
  } | null;
}

export function TodayWorkout({ workout }: TodayWorkoutProps) {
  if (!workout) {
    return (
      <Card className="flex items-center justify-center h-full min-h-[200px] text-center">
        <div>
          <div className="h-12 w-12 mx-auto bg-dark-100 rounded-full flex items-center justify-center mb-3">
            <Activity className="h-6 w-6 text-muted" />
          </div>
          <p className="text-muted mb-2">Pas d&apos;entraînement prévu</p>
          <Link href="/calendar">
            <Button variant="ghost" size="sm">
              Planifier une séance
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const sportColor = getSportColor(workout.sport);

  const statusConfig = {
    planned: { label: "À faire", color: "bg-secondary" },
    completed: { label: "Terminé", color: "bg-success" },
    skipped: { label: "Annulé", color: "bg-error" },
    in_progress: { label: "En cours", color: "bg-accent animate-pulse" },
  };

  const intensityLabels: Record<string, string> = {
    recovery: "Récupération",
    endurance: "Endurance",
    tempo: "Tempo",
    threshold: "Seuil",
    vo2max: "VO2max",
    anaerobic: "Anaérobie",
  };

  return (
    <Card className="h-full">
      <div className="flex items-start gap-4">
        {/* Sport icon/color */}
        <div
          className="h-20 w-20 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${sportColor}20` }}
        >
          <Activity className="h-8 w-8" style={{ color: sportColor }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Time and status */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted">
              Aujourd&apos;hui{" "}
              {workout.scheduledTime && `• ${workout.scheduledTime}`}
            </span>
            <div
              className={`h-2 w-2 rounded-full ${
                statusConfig[workout.status].color
              }`}
            />
          </div>

          {/* Title */}
          <h3 className="font-semibold text-lg mb-2 truncate">
            {workout.title}
          </h3>

          {/* Metrics */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted" />
              <span className="font-medium">
                {formatDuration(workout.plannedDuration)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Intensité</span>
              <Badge
                variant={
                  workout.intensity === "recovery"
                    ? "success"
                    : workout.intensity === "threshold" ||
                      workout.intensity === "vo2max"
                    ? "error"
                    : "warning"
                }
                size="sm"
              >
                {intensityLabels[workout.intensity] || workout.intensity}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-warning" />
              <span className="font-medium">{workout.tss}</span>
              <span className="text-muted text-xs">TSS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-dark-200">
        <Link href={`/workouts/${workout.id}`} className="flex-1">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            leftIcon={<Info className="h-4 w-4" />}
          >
            Détails de l&apos;entraînement
          </Button>
        </Link>

        {workout.status === "planned" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="text-success hover:bg-success/20"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-error hover:bg-error/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
