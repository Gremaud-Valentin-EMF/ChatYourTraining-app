"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge, Button, Spinner } from "@/components/ui";
import {
  Clock,
  MapPin,
  Mountain,
  Heart,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { formatDuration, getSportColor } from "@/lib/utils";

interface ActivityDetail {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
  sport_name: string;
  sport_label: string;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  planned_distance_km: number | null;
  actual_distance_km: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  tss: number | null;
  intensity: string | null;
  source: string;
}

export default function WorkoutDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const loadActivity = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("activities")
      .select(
        `
        id,
        title,
        scheduled_date,
        status,
        planned_duration_minutes,
        actual_duration_minutes,
        planned_distance_km,
        actual_distance_km,
        elevation_gain_m,
        avg_hr,
        max_hr,
        tss,
        intensity,
        source,
        sports (name, name_fr)
      `
      )
      .eq("id", params.id)
      .single();

    if (data) {
      setActivity({
        id: data.id,
        title: data.title,
        scheduled_date: data.scheduled_date,
        status: data.status,
        sport_name: data.sports?.name || "other",
        sport_label: data.sports?.name_fr || "Autre",
        planned_duration_minutes: data.planned_duration_minutes,
        actual_duration_minutes: data.actual_duration_minutes,
        planned_distance_km: data.planned_distance_km,
        actual_distance_km: data.actual_distance_km,
        elevation_gain_m: data.elevation_gain_m,
        avg_hr: data.avg_hr,
        max_hr: data.max_hr,
        tss: data.tss,
        intensity: data.intensity,
        source: data.source,
      });
    } else {
      setActivity(null);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
        <Card className="p-6 text-center text-muted">
          Impossible de trouver cette séance.
        </Card>
      </div>
    );
  }

  const sportColor = getSportColor(activity.sport_name);
  const date = new Date(activity.scheduled_date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <Link
        href="/workouts"
        className="inline-flex items-center text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour à la liste
      </Link>

      <Card>
        <div className="flex flex-col gap-2 border-b border-dark-200 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: sportColor }}
            >
              {activity.sport_label[0]}
            </div>
            <div>
              <p className="text-xs text-muted uppercase">{date}</p>
              <h1 className="text-2xl font-bold">{activity.title}</h1>
            </div>
            <Badge className="ml-auto" variant="outline">
              {activity.source.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-muted">{activity.sport_label}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted" />
            <div>
              <p className="text-xs text-muted uppercase">Durée prévue / réelle</p>
              <p className="font-semibold">
                {activity.planned_duration_minutes
                  ? formatDuration(activity.planned_duration_minutes)
                  : "--"}{" "}
                •{" "}
                {activity.actual_duration_minutes
                  ? formatDuration(activity.actual_duration_minutes)
                  : "--"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted" />
            <div>
              <p className="text-xs text-muted uppercase">Distance</p>
              <p className="font-semibold">
                {activity.actual_distance_km?.toFixed(1) ??
                  activity.planned_distance_km?.toFixed(1) ??
                  "--"}{" "}
                km
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Mountain className="h-5 w-5 text-muted" />
            <div>
              <p className="text-xs text-muted uppercase">Dénivelé</p>
              <p className="font-semibold">
                {activity.elevation_gain_m ?? "--"} m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-error" />
            <div>
              <p className="text-xs text-muted uppercase">Fréquence cardiaque</p>
              <p className="font-semibold">
                {activity.avg_hr || "--"}
                <span className="text-muted">
                  /{activity.max_hr || "--"} bpm
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-dark-200 pt-4">
          <Badge
            variant={
              activity.tss && activity.tss > 100 ? "error" : "warning"
            }
          >
            <Zap className="h-4 w-4 mr-1" />
            {activity.tss || "--"} TSS
          </Badge>
          {activity.intensity && (
            <span className="text-sm text-muted uppercase">
              Intensité: {activity.intensity}
            </span>
          )}
        </div>

      </Card>
    </div>
  );
}
