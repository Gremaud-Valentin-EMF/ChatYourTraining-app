"use client";

import { Card, Progress } from "@/components/ui";
import { Calendar, Clock, Zap } from "lucide-react";
import { getSportColor } from "@/lib/utils";

interface WeekActivity {
  id: string;
  sport: string;
  title: string;
  status: "planned" | "completed" | "skipped";
  intensity?: string | null;
}

interface WeekDay {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  activities: WeekActivity[];
}

interface WeekCalendarProps {
  weekData: WeekDay[];
  weeklyHours: {
    completed: number;
    target: number;
  };
  weeklyTss: {
    completed: number;
    target: number;
  };
}

export function WeekCalendar({
  weekData,
  weeklyHours,
  weeklyTss,
}: WeekCalendarProps) {
  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}m`;
  };
  const getPercent = (value: number, target: number) =>
    target > 0 ? Math.round((value / target) * 100) : 0;
  const intensityMap: Record<
    string,
    {
      zone: string;
      label: string;
    }
  > = {
    recovery: { zone: "Z1", label: "Récup" },
    endurance: { zone: "Z2", label: "Endurance" },
    tempo: { zone: "Z3", label: "Tempo" },
    threshold: { zone: "Z4", label: "Seuil" },
    vo2max: { zone: "Z5", label: "VO2" },
    anaerobic: { zone: "Z6", label: "Anaérobie" },
  };

  const getIntensityInfo = (intensity?: string | null) => {
    if (!intensity) return null;
    return intensityMap[intensity] || null;
  };

  return (
    <Card className="col-span-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-accent" />
          <h3 className="font-semibold">Calendrier de la semaine</h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted" />
            <span>Heures:</span>
            <span className="font-bold">
              {formatHours(weeklyHours.completed)}
            </span>
            <span className="text-muted">
              / {formatHours(weeklyHours.target)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            <span>
              TSS{" "}
              <span title="TSS = Stress de ton entraînement">(semaine)</span>:
            </span>
            <span className="font-bold">{weeklyTss.completed}</span>
            <span className="text-muted">/ {weeklyTss.target}</span>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Volume horaire</span>
            <span>
              {getPercent(weeklyHours.completed, weeklyHours.target)}%
            </span>
          </div>
          <Progress
            value={weeklyHours.completed}
            max={Math.max(weeklyHours.target, 1)}
            variant="default"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Charge TSS</span>
            <span>
              {getPercent(weeklyTss.completed, weeklyTss.target)}%
            </span>
          </div>
          <Progress
            value={weeklyTss.completed}
            max={Math.max(weeklyTss.target, 1)}
            variant="warning"
          />
        </div>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-7 min-w-[560px] gap-2">
          {weekData.map((day) => (
            <div
              key={day.date.toISOString()}
              className={`p-3 rounded-xl border ${
                day.isToday
                  ? "border-accent bg-accent/5"
                  : "border-dark-200 bg-dark-100"
              }`}
            >
              <div className="text-center mb-2">
                <p className="text-xs text-muted uppercase">{day.dayName}</p>
                <p
                  className={`text-lg font-bold ${
                    day.isToday ? "text-accent" : ""
                  }`}
                >
                  {day.dayNumber}
                </p>
                {day.isToday && (
                  <div className="h-1 w-1 mx-auto mt-1 bg-accent rounded-full" />
                )}
              </div>

              <div className="space-y-1.5">
                {day.activities.map((activity) => {
                  const intensityInfo = getIntensityInfo(activity.intensity);
                  return (
                    <div
                      key={activity.id}
                      className="px-2 py-1.5 rounded-lg border border-dark-200 bg-dark-50 text-xs font-medium"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: getSportColor(activity.sport),
                            }}
                          />
                          <span className="truncate">{activity.title}</span>
                        </div>
                        <span
                          className={`text-[10px] uppercase ${
                            activity.status === "completed"
                              ? "text-success"
                              : activity.status === "skipped"
                              ? "text-error"
                              : "text-muted"
                          }`}
                        >
                          {activity.status === "completed"
                            ? "Fait"
                            : activity.status === "skipped"
                            ? "Annulé"
                            : "Planifié"}
                        </span>
                      </div>
                      {intensityInfo && (
                        <div className="mt-1 text-[10px] text-muted flex items-center gap-1">
                          <span className="font-semibold">
                            {intensityInfo.zone}
                          </span>
                          <span>{intensityInfo.label}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {day.activities.length === 0 && (
                  <div className="px-2 py-1 rounded text-xs text-muted bg-dark-200">
                    Repos
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
