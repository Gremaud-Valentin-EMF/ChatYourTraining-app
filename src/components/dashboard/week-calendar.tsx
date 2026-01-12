"use client";

import { Card, Progress } from "@/components/ui";
import { Calendar, Clock, Zap } from "lucide-react";
import { getSportColor } from "@/lib/utils";

interface WeekActivity {
  id: string;
  sport: string;
  title: string;
  status: "planned" | "completed" | "skipped";
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

  return (
    <Card className="col-span-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-accent" />
          <h3 className="font-semibold">Calendrier de la semaine</h3>
        </div>

        <div className="flex items-center gap-6 text-sm">
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
            <span>TSS:</span>
            <span className="font-bold">{weeklyTss.completed}</span>
            <span className="text-muted">/ {weeklyTss.target}</span>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Volume horaire</span>
            <span>
              {Math.round((weeklyHours.completed / weeklyHours.target) * 100)}%
            </span>
          </div>
          <Progress
            value={weeklyHours.completed}
            max={weeklyHours.target}
            variant="default"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Charge TSS</span>
            <span>
              {Math.round((weeklyTss.completed / weeklyTss.target) * 100)}%
            </span>
          </div>
          <Progress
            value={weeklyTss.completed}
            max={weeklyTss.target}
            variant="warning"
          />
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
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
              {day.activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`px-2 py-1 rounded text-xs font-medium truncate ${
                    activity.status === "completed"
                      ? "bg-success/20 text-success"
                      : activity.status === "skipped"
                      ? "bg-error/20 text-error line-through"
                      : ""
                  }`}
                  style={
                    activity.status === "planned"
                      ? {
                          backgroundColor: `${getSportColor(activity.sport)}20`,
                          color: getSportColor(activity.sport),
                        }
                      : undefined
                  }
                >
                  {activity.title.length > 8
                    ? `${activity.title.substring(0, 8)}...`
                    : activity.title}
                </div>
              ))}
              {day.activities.length === 0 && (
                <div className="px-2 py-1 rounded text-xs text-muted bg-dark-200">
                  Repos
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
