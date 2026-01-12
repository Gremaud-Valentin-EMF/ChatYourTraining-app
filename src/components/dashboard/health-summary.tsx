"use client";

import Link from "next/link";
import { Card, Button, Progress } from "@/components/ui";
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

  const hasData = hrv || restingHr || sleepHours;

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
        <div className="space-y-4">
          {/* HRV */}
          {hrv && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted">VFC (HRV)</p>
                  <p className="font-semibold">
                    {hrv} <span className="text-xs text-muted">ms</span>
                  </p>
                </div>
              </div>
              <span
                className={`text-xs ${
                  hrv > 50
                    ? "text-success"
                    : hrv > 30
                    ? "text-warning"
                    : "text-error"
                }`}
              >
                {hrv > 50 ? "Bon" : hrv > 30 ? "Modéré" : "Faible"}
              </span>
            </div>
          )}

          {/* Resting HR */}
          {restingHr && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-error/20 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-error" />
                </div>
                <div>
                  <p className="text-xs text-muted">FC Repos</p>
                  <p className="font-semibold">
                    {restingHr} <span className="text-xs text-muted">bpm</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sleep */}
          {sleepHours && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-secondary/20 flex items-center justify-center">
                  <Moon className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <p className="text-xs text-muted">Sommeil</p>
                  <p className="font-semibold">{formatSleep(sleepHours)}</p>
                </div>
              </div>
              {sleepQuality && (
                <div className="w-20">
                  <Progress
                    value={sleepQuality}
                    max={100}
                    size="sm"
                    variant={
                      sleepQuality > 70
                        ? "success"
                        : sleepQuality > 50
                        ? "warning"
                        : "error"
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Strain */}
          {strain !== undefined && (
            <div className="flex items-center justify-between pt-2 border-t border-dark-200">
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
