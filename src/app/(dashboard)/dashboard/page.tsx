"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";
import {
  TrainingLoadChart,
  RecoveryGauge,
  NextObjective,
  TodayWorkout,
  HealthSummary,
  WeekCalendar,
} from "@/components/dashboard";
import { calculateTrainingLoad } from "@/lib/calculations/training-load";

interface TrainingLoadDataPoint {
  date: string;
  atl: number;
  ctl: number;
  tsb: number;
}

interface WeekDayData {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  activities: {
    id: string;
    sport: string;
    title: string;
    status: "planned" | "completed" | "skipped";
  }[];
}

export default function DashboardPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<{
    fullName: string;
    objective: { name: string; date: string; priority: "A" | "B" | "C" } | null;
    todayWorkout: {
      id: string;
      sport: string;
      sportName: string;
      title: string;
      scheduledTime: string;
      plannedDuration: number;
      intensity: string;
      tss: number;
      status: "planned" | "completed" | "skipped" | "in_progress";
    } | null;
    recoveryScore: number | null;
    healthData: {
      hrv?: number;
      restingHr?: number;
      sleepHours?: number;
      sleepQuality?: number;
      strain?: number;
    };
  } | null>(null);
  const [trainingLoadData, setTrainingLoadData] = useState<
    TrainingLoadDataPoint[]
  >([]);
  const [weekData, setWeekData] = useState<WeekDayData[]>([]);
  const [weekStats, setWeekStats] = useState({
    completedMinutes: 0,
    targetMinutes: 0,
    completedTss: 0,
    targetTss: 0,
  });

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

      // Load user profile
      let fullName = "Athlète";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
          .from("users")
          .select("full_name")
          .eq("id", user.id)
          .limit(1);
        fullName = profile?.[0]?.full_name || "Athlète";
      } catch {
        // Ignore error
      }

      // Load next objective
      let objective = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: objData } = await (supabase as any)
          .from("objectives")
          .select("name, event_date, priority")
          .eq("user_id", user.id)
          .gte("event_date", today)
          .order("event_date")
          .limit(1);
        if (objData?.[0]) {
          objective = {
            name: objData[0].name,
            date: objData[0].event_date,
            priority: objData[0].priority as "A" | "B" | "C",
          };
        }
      } catch {
        // No objective found
      }

      // Load sports for mapping
      const sportMap: Record<string, { name: string; nameFr: string }> = {};
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sports } = await (supabase as any)
          .from("sports")
          .select("id, name, name_fr");
        sports?.forEach((s: { id: string; name: string; name_fr: string }) => {
          sportMap[s.id] = { name: s.name, nameFr: s.name_fr };
        });
      } catch {
        // Ignore
      }

      // Load today's workout
      let todayWorkout = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: activities } = await (supabase as any)
          .from("activities")
          .select(
            "id, title, planned_duration_minutes, intensity, tss, status, sport_id"
          )
          .eq("user_id", user.id)
          .eq("scheduled_date", today)
          .limit(1);

        const todayActivity = activities?.[0];
        if (todayActivity) {
          const sport = sportMap[todayActivity.sport_id];
          todayWorkout = {
            id: todayActivity.id,
            sport: sport?.name || "other",
            sportName: sport?.nameFr || "Autre",
            title: todayActivity.title,
            scheduledTime: "18:00",
            plannedDuration: todayActivity.planned_duration_minutes || 60,
            intensity: todayActivity.intensity || "endurance",
            tss: todayActivity.tss || 0,
            status: todayActivity.status as
              | "planned"
              | "completed"
              | "skipped"
              | "in_progress",
          };
        }
      } catch {
        // No activity today
      }

      // Load today's metrics from daily_metrics (WHOOP data)
      let healthData: {
        hrv?: number;
        restingHr?: number;
        sleepHours?: number;
        sleepQuality?: number;
        strain?: number;
      } = {};
      let recoveryScore: number | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: metricsData } = await (supabase as any)
          .from("daily_metrics")
          .select(
            "recovery_score, hrv_ms, resting_hr, sleep_duration_minutes, sleep_score, strain"
          )
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(1);

        const metrics = metricsData?.[0];
        if (metrics) {
          recoveryScore = metrics.recovery_score || null;
          healthData = {
            hrv: metrics.hrv_ms || undefined,
            restingHr: metrics.resting_hr || undefined,
            sleepHours: metrics.sleep_duration_minutes
              ? metrics.sleep_duration_minutes / 60
              : undefined,
            sleepQuality: metrics.sleep_score || undefined,
            strain: metrics.strain || undefined,
          };
        }
      } catch {
        // No metrics
      }

      setUserData({
        fullName,
        objective,
        todayWorkout,
        recoveryScore,
        healthData,
      });

      // Load activities for training load calculation
      const trainingLoadFallbackDays = 180; // ensure at least ~4 months of history
      const fallbackStart = new Date();
      fallbackStart.setDate(
        fallbackStart.getDate() - trainingLoadFallbackDays
      );
      let trainingLoadStartDate =
        fallbackStart.toISOString().split("T")[0] ?? undefined;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: oldestActivity } = await (supabase as any)
          .from("activities")
          .select("scheduled_date")
          .eq("user_id", user.id)
          .order("scheduled_date", { ascending: true })
          .limit(1);

        if (oldestActivity?.[0]?.scheduled_date) {
          trainingLoadStartDate = oldestActivity[0].scheduled_date;
        }
      } catch {
        // fallback start date already defined
      }

      try {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const { data: activities, error: activitiesError } = await (
          supabase as any
        )
          .from("activities")
          .select("scheduled_date, tss, status, title")
          .eq("user_id", user.id)
          .gte("scheduled_date", trainingLoadStartDate)
          .order("scheduled_date");

        console.log("Dashboard - Activities fetched:", {
          count: activities?.length || 0,
          error: activitiesError?.message,
          sample: activities?.slice(0, 3),
        });

        if (activities && activities.length > 0) {
          // Calculate training load from real activities
          const tssData = activities.map(
            (a: { scheduled_date: string; tss: number; status: string }) => ({
              date: a.scheduled_date,
              tss: a.status === "completed" ? a.tss || 0 : 0,
            })
          );
          console.log("Dashboard - TSS data for training load:", {
            totalActivities: tssData.length,
            activitiesWithTSS: tssData.filter((t: { tss: number }) => t.tss > 0)
              .length,
            totalTSS: tssData.reduce(
              (sum: number, t: { tss: number }) => sum + t.tss,
              0
            ),
            sample: tssData.slice(0, 5),
          });
          const loadData = calculateTrainingLoad(tssData);
          console.log("Dashboard - Training load calculated:", {
            dataPoints: loadData.length,
            lastPoint: loadData[loadData.length - 1],
          });
          setTrainingLoadData(loadData);
        } else {
          // No activities - show empty chart
          console.log("Dashboard - No activities found for training load");
          setTrainingLoadData([]);
        }
      } catch (err) {
        console.error("Dashboard - Error loading activities:", err);
        setTrainingLoadData([]);
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Load week activities
      const todayDate = new Date();
      const dayOfWeek = todayDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = monday.toISOString().split("T")[0];
      const weekEnd = sunday.toISOString().split("T")[0];

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: weekActivities } = await (supabase as any)
          .from("activities")
          .select(
            "id, title, scheduled_date, status, sport_id, planned_duration_minutes, tss"
          )
          .eq("user_id", user.id)
          .gte("scheduled_date", weekStart)
          .lte("scheduled_date", weekEnd)
          .order("scheduled_date");

        // Group activities by date
        const activitiesByDate: Record<string, typeof weekActivities> = {};
        weekActivities?.forEach((a: { scheduled_date: string }) => {
          if (!activitiesByDate[a.scheduled_date]) {
            activitiesByDate[a.scheduled_date] = [];
          }
          activitiesByDate[a.scheduled_date].push(a);
        });

        // Build week data
        const week: WeekDayData[] = [];
        let completedMinutes = 0;
        let completedTss = 0;
        let targetMinutes = 0;
        let targetTss = 0;

        for (let i = 0; i < 7; i++) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + i);
          const dateStr = date.toISOString().split("T")[0];
          const dayActivities = activitiesByDate[dateStr] || [];

          week.push({
            date,
            dayName: dayNames[i],
            dayNumber: date.getDate(),
            isToday: dateStr === today,
            activities: dayActivities.map(
              (a: {
                id: string;
                title: string;
                sport_id: string;
                status: string;
              }) => ({
                id: a.id,
                sport: sportMap[a.sport_id]?.name || "other",
                title: a.title,
                // Map "in_progress" to "planned" for display
                status: (a.status === "in_progress" ? "planned" : a.status) as
                  | "planned"
                  | "completed"
                  | "skipped",
              })
            ),
          });

          // Calculate week stats
          dayActivities.forEach(
            (a: {
              status: string;
              planned_duration_minutes?: number;
              tss?: number;
            }) => {
              targetMinutes += a.planned_duration_minutes || 0;
              targetTss += a.tss || 0;
              if (a.status === "completed") {
                completedMinutes += a.planned_duration_minutes || 0;
                completedTss += a.tss || 0;
              }
            }
          );
        }

        setWeekData(week);
        setWeekStats({
          completedMinutes,
          targetMinutes,
          completedTss,
          targetTss,
        });
      } catch {
        // Initialize empty week
        const week: WeekDayData[] = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(monday);
          date.setDate(monday.getDate() + i);
          week.push({
            date,
            dayName: dayNames[i],
            dayNumber: date.getDate(),
            isToday: date.toISOString().split("T")[0] === today,
            activities: [],
          });
        }
        setWeekData(week);
        setWeekStats({
          completedMinutes: 0,
          targetMinutes: 0,
          completedTss: 0,
          targetTss: 0,
        });
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const firstName = userData?.fullName?.split(" ")[0] || "Athlète";
  const latestLoad =
    trainingLoadData.length > 0
      ? trainingLoadData[trainingLoadData.length - 1]
      : { atl: 0, ctl: 0, tsb: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Bonjour, {firstName} 👋</h1>
        <p className="text-muted">
          {userData?.todayWorkout
            ? `Prêt pour votre séance de ${userData.todayWorkout.title} ?`
            : "Jour de repos aujourd'hui. Profitez-en pour récupérer !"}
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Training Load Chart - spans 2 columns */}
        <TrainingLoadChart
          data={trainingLoadData}
          currentAtl={latestLoad.atl}
          currentCtl={latestLoad.ctl}
          currentTsb={latestLoad.tsb}
        />

        {/* Right column - Recovery and Objective */}
        <div className="space-y-6">
          <RecoveryGauge score={userData?.recoveryScore ?? null} />

          {userData?.objective ? (
            <NextObjective
              name={userData.objective.name}
              date={userData.objective.date}
              priority={userData.objective.priority}
            />
          ) : (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-2">Prochain Objectif</h3>
              <p className="text-muted text-sm">
                Aucun objectif défini. Ajoutez un objectif dans votre profil !
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {userData?.todayWorkout ? (
          <TodayWorkout workout={userData.todayWorkout} />
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-2">Séance du Jour</h3>
            <p className="text-muted text-sm">
              Aucune séance prévue aujourd&apos;hui. Profitez de ce jour de
              repos !
            </p>
          </div>
        )}

        <HealthSummary
          hrv={userData?.healthData.hrv}
          restingHr={userData?.healthData.restingHr}
          sleepHours={userData?.healthData.sleepHours}
          sleepQuality={userData?.healthData.sleepQuality}
          strain={userData?.healthData.strain}
        />
      </div>

      {/* Week calendar */}
      <WeekCalendar
        weekData={weekData}
        weeklyHours={{
          completed: weekStats.completedMinutes,
          target: weekStats.targetMinutes,
        }}
        weeklyTss={{
          completed: weekStats.completedTss,
          target: weekStats.targetTss,
        }}
      />
    </div>
  );
}
