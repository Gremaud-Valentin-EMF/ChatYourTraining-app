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

interface WeekActivity {
  id: string;
  sport: string;
  title: string;
  status: "planned" | "completed" | "skipped";
  intensity?: string | null;
}

interface WeekDayData {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  activities: WeekActivity[];
}

interface RecoveryContext {
  score: number | null;
  average7d: number | null;
  deltaPercent: number | null;
}

interface HealthContext {
  hrv?: number;
  hrvBaseline?: number;
  hrvDeltaPct?: number;
  restingHr?: number;
  restingHrTrend?: number;
  sleepHours?: number;
  sleepDebtHours?: number;
  sleepTrendHours?: number;
  strain?: number;
}

interface ObjectiveInsights {
  completion: number;
  completedMinutes: number;
  totalMinutes: number;
  confidenceScore: number;
  confidenceLabel: "Haute" | "Moyenne" | "Faible";
}

interface DailyMetric {
  date: string;
  recovery_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  sleep_duration_minutes?: number | null;
  sleep_score?: number | null;
  strain?: number | null;
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
      plannedDuration: number;
      intensity: string;
      tss: number;
      status: "planned" | "completed" | "skipped" | "in_progress";
    } | null;
    recovery: RecoveryContext;
    healthData: HealthContext;
    objectiveInsights?: ObjectiveInsights;
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
      let objectiveInsights: ObjectiveInsights | undefined;
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
      if (objective) {
        try {
          const objectiveDate = new Date(objective.date);
          const planStart = new Date(objectiveDate);
          planStart.setDate(planStart.getDate() - 70);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: planActivities } = await (supabase as any)
            .from("activities")
            .select(
              "scheduled_date, planned_duration_minutes, actual_duration_minutes, status, intensity"
            )
            .eq("user_id", user.id)
            .gte("scheduled_date", planStart.toISOString().split("T")[0])
            .lte("scheduled_date", objective.date);

          if (planActivities && planActivities.length > 0) {
            let totalMinutes = 0;
            let completedMinutes = 0;
            let keySessions = 0;
            let completedKeySessions = 0;
            const todayDate = new Date();

            planActivities.forEach(
              (activity: {
                scheduled_date: string;
                planned_duration_minutes: number | null;
                actual_duration_minutes: number | null;
                status: string;
                intensity: string | null;
              }) => {
                const plannedMinutes =
                  activity.planned_duration_minutes ??
                  activity.actual_duration_minutes ??
                  0;
                totalMinutes += plannedMinutes;

                const scheduledDate = new Date(activity.scheduled_date);
                if (
                  activity.status === "completed" &&
                  scheduledDate <= todayDate
                ) {
                  completedMinutes +=
                    activity.actual_duration_minutes ?? plannedMinutes;
                }

                if (
                  activity.intensity &&
                  ["tempo", "threshold", "vo2max", "anaerobic"].includes(
                    activity.intensity
                  )
                ) {
                  keySessions += 1;
                  if (activity.status === "completed") {
                    completedKeySessions += 1;
                  }
                }
              }
            );

            const completionRatio =
              totalMinutes > 0
                ? Math.min(1, completedMinutes / totalMinutes)
                : 0;
            const confidenceRaw =
              keySessions > 0
                ? completedKeySessions / keySessions
                : completionRatio;
            const confidenceScore = Math.round(confidenceRaw * 100);

            let confidenceLabel: "Haute" | "Moyenne" | "Faible" = "Moyenne";
            if (confidenceScore >= 75) confidenceLabel = "Haute";
            else if (confidenceScore < 50) confidenceLabel = "Faible";

            objectiveInsights = {
              completion: completionRatio,
              completedMinutes,
              totalMinutes,
              confidenceScore,
              confidenceLabel,
            };
          }
        } catch {
          // Unable to compute plan insights, leave undefined
        }
        if (!objectiveInsights) {
          const objectiveDate = new Date(objective.date);
          const planStart = new Date(objectiveDate);
          planStart.setDate(planStart.getDate() - 70);
          const totalDays = Math.max(
            1,
            Math.round(
              (objectiveDate.getTime() - planStart.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          );
          const elapsedDays = Math.min(
            totalDays,
            Math.max(
              0,
              Math.round(
                (new Date().getTime() - planStart.getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            )
          );
          const completionRatio = Math.min(1, elapsedDays / totalDays);
          const confidenceScore = Math.round(completionRatio * 100);
          let confidenceLabel: "Haute" | "Moyenne" | "Faible" = "Moyenne";
          if (confidenceScore >= 75) confidenceLabel = "Haute";
          else if (confidenceScore < 50) confidenceLabel = "Faible";

          objectiveInsights = {
            completion: completionRatio,
            completedMinutes: 0,
            totalMinutes: 0,
            confidenceScore,
            confidenceLabel,
          };
        }
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

      // Load recovery + health metrics history
      let healthData: HealthContext = {};
      let recovery: RecoveryContext = {
        score: null,
        average7d: null,
        deltaPercent: null,
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: metricsData } = await (supabase as any)
          .from("daily_metrics")
          .select(
            "date, recovery_score, hrv_ms, resting_hr, sleep_duration_minutes, sleep_score, strain"
          )
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(7);

        const metrics: DailyMetric[] = metricsData
          ? (metricsData as DailyMetric[])
          : [];
        const latestMetrics = metrics[0];
        if (latestMetrics) {
          const averageRecoveryValues = metrics
            .map((m) => m.recovery_score)
            .filter((v): v is number => typeof v === "number");
          const averageRecovery =
            averageRecoveryValues.length > 0
              ? averageRecoveryValues.reduce((sum, value) => sum + value, 0) /
                averageRecoveryValues.length
              : null;

          const hrvValues = metrics
            .map((m) => m.hrv_ms)
            .filter((v): v is number => typeof v === "number");
          const hrvBaseline =
            hrvValues.length > 0
              ? hrvValues.reduce((sum, value) => sum + value, 0) /
                hrvValues.length
              : undefined;

          const hrvDeltaPct =
            latestMetrics.hrv_ms && hrvBaseline
              ? ((latestMetrics.hrv_ms - hrvBaseline) / hrvBaseline) * 100
              : undefined;

          const restingHrTrend =
            latestMetrics.resting_hr !== null &&
            latestMetrics.resting_hr !== undefined &&
            metrics[1]?.resting_hr !== undefined &&
            metrics[1]?.resting_hr !== null
              ? latestMetrics.resting_hr - metrics[1].resting_hr
              : undefined;

          const latestSleepMinutes =
            typeof latestMetrics.sleep_duration_minutes === "number"
              ? latestMetrics.sleep_duration_minutes
              : null;

          const sleepHours =
            latestSleepMinutes !== null ? latestSleepMinutes / 60 : undefined;

          const sleepTrendHours =
            latestSleepMinutes !== null &&
            typeof metrics[1]?.sleep_duration_minutes === "number"
              ? (latestSleepMinutes - metrics[1].sleep_duration_minutes) / 60
              : undefined;

          const debtSample = metrics.slice(1, 4);
          const sleepDebtMinutes = debtSample.reduce((sum, metric) => {
            if (
              metric.sleep_duration_minutes !== null &&
              metric.sleep_duration_minutes !== undefined
            ) {
              return sum + metric.sleep_duration_minutes;
            }
            return sum;
          }, 0);
          const expectedMinutes = debtSample.length * 8 * 60;
          const sleepDebtHours =
            debtSample.length > 0
              ? Math.max(0, (expectedMinutes - sleepDebtMinutes) / 60)
              : undefined;

          const latestRecoveryScore =
            typeof latestMetrics.recovery_score === "number"
              ? latestMetrics.recovery_score
              : null;

          recovery = {
            score: latestRecoveryScore,
            average7d: averageRecovery,
            deltaPercent:
              averageRecovery && latestRecoveryScore !== null
                ? ((latestRecoveryScore - averageRecovery) / averageRecovery) *
                  100
                : null,
          };

          healthData = {
            hrv: latestMetrics.hrv_ms || undefined,
            hrvBaseline,
            hrvDeltaPct,
            restingHr: latestMetrics.resting_hr || undefined,
            restingHrTrend,
            sleepHours,
            sleepDebtHours,
            sleepTrendHours,
            strain: latestMetrics.strain || undefined,
          };
        }
      } catch {
        // No metrics available
      }

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
            "id, title, scheduled_date, status, sport_id, planned_duration_minutes, tss, intensity"
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
                intensity: string | null;
              }) => ({
                id: a.id,
                sport: sportMap[a.sport_id]?.name || "other",
                title: a.title,
                // Map "in_progress" to "planned" for display
                status: (a.status === "in_progress" ? "planned" : a.status) as
                  | "planned"
                  | "completed"
                  | "skipped",
                intensity: a.intensity,
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

      setUserData({
        fullName,
        objective,
        todayWorkout,
        recovery,
        healthData,
        objectiveInsights,
      });
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
          <RecoveryGauge
            score={userData?.recovery?.score ?? null}
            average={userData?.recovery?.average7d ?? null}
            deltaPercent={userData?.recovery?.deltaPercent ?? null}
          />

          {userData?.objective ? (
            <NextObjective
              name={userData.objective.name}
              date={userData.objective.date}
              priority={userData.objective.priority}
              planCompletion={userData.objectiveInsights?.completion}
              planVolume={{
                completed: userData.objectiveInsights?.completedMinutes ?? 0,
                total: userData.objectiveInsights?.totalMinutes ?? 0,
              }}
              confidenceScore={userData.objectiveInsights?.confidenceScore}
              confidenceLabel={userData.objectiveInsights?.confidenceLabel}
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
          hrvBaseline={userData?.healthData.hrvBaseline}
          hrvDeltaPct={userData?.healthData.hrvDeltaPct}
          restingHr={userData?.healthData.restingHr}
          restingHrTrend={userData?.healthData.restingHrTrend}
          sleepHours={userData?.healthData.sleepHours}
          sleepDebtHours={userData?.healthData.sleepDebtHours}
          sleepTrendHours={userData?.healthData.sleepTrendHours}
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
