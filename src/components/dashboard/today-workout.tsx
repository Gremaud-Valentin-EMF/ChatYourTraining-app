"use client";

import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import {
  Activity,
  Clock,
  Zap,
  Gauge,
  Info,
} from "lucide-react";
import { formatDuration, getSportColor } from "@/lib/utils";

interface Workout {
  id: string;
  sport: string;
  sportName: string;
  sportColor?: string;
  title: string;
  plannedDuration: number;
  actualDuration: number | null;
  intensity: string;
  tss: number;
  status: "planned" | "completed" | "skipped" | "in_progress";
}

interface TodayWorkoutProps {
  workouts: Workout[];
}

export function TodayWorkout({ workouts }: TodayWorkoutProps) {
  if (!workouts || workouts.length === 0) {
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

  const renderWorkout = (workout: Workout) => {
    const sportColor = workout.sportColor || getSportColor(workout.sport);
    const isCompleted = workout.status === "completed";
    const durationLabel = isCompleted ? "Durée réalisée" : "Durée prévue";
    const durationValue = formatDuration(
      isCompleted && workout.actualDuration
        ? workout.actualDuration
        : workout.plannedDuration
    );

    return (
      <Card
        key={workout.id}
        className="border-2"
        style={{
          borderColor: `${sportColor}30`,
          background: `linear-gradient(135deg, ${sportColor}15 0%, ${sportColor}05 100%)`
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Sport icon/color */}
          <div
            className="h-20 w-20 rounded-xl flex items-center justify-center flex-shrink-0 self-start"
            style={{ backgroundColor: `${sportColor}20` }}
          >
            <Activity className="h-8 w-8" style={{ color: sportColor }} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Time and status */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-muted">Aujourd&apos;hui</span>
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
            <div className="flex flex-col gap-2 text-sm">
              <div
                className="flex items-center justify-between rounded-xl bg-dark-100/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-dark-100 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs text-muted uppercase">{durationLabel}</span>
                </div>
                <span className="font-medium text-right">{durationValue}</span>
              </div>
              <div
                className="flex items-center justify-between rounded-xl bg-dark-100/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-dark-100 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs text-muted uppercase">Charge</span>
                </div>
                <span className="font-medium text-right">{workout.tss} TSS</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-dark-100/40 px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-dark-100 flex items-center justify-center">
                    <Gauge className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs text-muted uppercase">Intensité</span>
                </div>
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
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-dark-200">
          <Link href={`/workouts/${workout.id}`} className="flex-1">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              leftIcon={<Info className="h-4 w-4" />}
            >
              Détail
            </Button>
          </Link>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      {workouts.slice(0, 4).map(renderWorkout)}
      {workouts.length > 4 && (
        <p className="text-xs text-muted text-center">
          +{workouts.length - 4} entraînement{workouts.length - 4 > 1 ? "s" : ""} supplémentaire{workouts.length - 4 > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
