import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InsertTables } from "@/types/database";

type PlanSession = {
  title: string;
  sport?: string;
  duration_minutes?: number;
  description?: string;
  intensity?: string;
};

type PlanDay = {
  date: string;
  sessions?: PlanSession[];
};

type PlanWeek = {
  week_index?: number;
  focus?: string;
  days?: PlanDay[];
};

interface TrainingPlan {
  summary?: string;
  weeks: PlanWeek[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plan: TrainingPlan | undefined = body.plan;

    if (!plan || !Array.isArray(plan.weeks) || plan.weeks.length === 0) {
      return NextResponse.json(
        { error: "Plan invalide ou manquant" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load sports for mapping names -> ids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sportsData } = await (supabase as any)
      .from("sports")
      .select("id, name");
    const sportMap: Record<string, string> = {};
    sportsData?.forEach((sport: { id: string; name: string }) => {
      sportMap[sport.name.toLowerCase()] = sport.id;
    });
    const defaultSportId = sportMap["other"];

    const inserts: InsertTables<"activities">[] = [];
    const allowedIntensities = new Set([
      "recovery",
      "endurance",
      "tempo",
      "threshold",
      "vo2max",
      "anaerobic",
    ]);

    for (const week of plan.weeks) {
      if (!week.days) continue;
      for (const day of week.days) {
        if (!day.sessions || !day.sessions.length) continue;
        const date = day.date;
        if (!date) continue;

        for (const session of day.sessions) {
          if (!session.title) continue;
          const sportKey = session.sport?.toLowerCase().trim() || "other";
          const sportId = sportMap[sportKey] || defaultSportId;
          if (!sportId) {
            console.warn("Unknown sport for plan session, skipping", {
              sportKey,
              sessionTitle: session.title,
            });
            continue;
          }
          const rawIntensity = session.intensity?.toLowerCase().trim();
          const intensity =
            rawIntensity && allowedIntensities.has(rawIntensity)
              ? rawIntensity
              : null;

          inserts.push({
            user_id: user.id,
            title: session.title,
            description: session.description || null,
            sport_id: sportId,
            scheduled_date: date,
            status: "planned",
            planned_duration_minutes: session.duration_minutes || null,
            intensity,
            source: "manual",
          });
        }
      }
    }

    if (inserts.length === 0) {
      return NextResponse.json(
        { error: "Le plan ne contient aucune séance exploitable" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("activities").insert(inserts);
    if (error) {
      console.error("Erreur insertion plan:", error);
      return NextResponse.json(
        { error: "Impossible d'enregistrer les séances" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, created: inserts.length });
  } catch (error) {
    console.error("Plan accept error:", error);
    return NextResponse.json(
      { error: "Erreur serveur pendant l'enregistrement du plan" },
      { status: 500 }
    );
  }
}
