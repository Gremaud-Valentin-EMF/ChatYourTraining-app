/**
 * Coach IA - System Prompt and Context Builder
 *
 * Architecture: "Stateful Context, Stateless Model"
 * The backend injects an updated JSON context before each message
 */

import { createClient } from "@/lib/supabase/server";
import { getWeatherContext, type WeatherContext } from "@/lib/integrations/weather";
import {
  calculateTrainingLoad,
  interpretTSB,
} from "@/lib/calculations/training-load";

export interface AthleteProfile {
  name: string;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  hr_max: number | null;
  hr_rest: number | null;
  sports: {
    name: string;
    level: string;
    vma_kmh?: number | null;
    ftp_watts?: number | null;
    css_per_100m?: number | null;
  }[];
  objective: {
    name: string;
    date: string;
    type: string;
    priority: string;
    days_remaining: number;
  } | null;
  objectives: {
    name: string;
    date: string;
    type: string;
    priority: string;
    days_remaining: number;
  }[];
  limitations: string[];
}

export interface PhysiologicalStatus {
  source: string;
  date: string;
  recovery_score: number | null;
  recovery_status: "green" | "yellow" | "red" | null;
  sleep: {
    duration_hours: number | null;
    quality_score: number | null;
    deep_percent: number | null;
    rem_percent: number | null;
  };
  hrv_ms: number | null;
  hrv_trend: "up" | "down" | "stable";
  resting_hr: number | null;
  strain: number | null;
}

export interface TrainingLoadAnalysis {
  context: string;
  metrics: {
    atl: number;
    ctl: number;
    tsb: number;
    tsb_status: string;
  };
  weekly_summary: {
    total_hours: number;
    total_tss: number;
    target_hours: number;
    target_tss: number;
  };
  recent_activities: {
    date: string;
    sport: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    tss: number;
    rpe: number | null;
    status: string;
  }[];
}

export interface ScheduleContext {
  today: {
    date: string;
    planned_workout: {
      title: string;
      description: string | null;
      sport: string;
      duration_minutes: number;
      intensity: string;
      tss: number;
    } | null;
  };
  upcoming: {
    date: string;
    title: string;
    description: string | null;
    sport: string;
    intensity: string;
  }[];
}

export interface CoachContext {
  current_datetime: {
    date: string;
    time: string;
    timezone: string;
  };
  athlete_profile: AthleteProfile;
  physiological_status_today: PhysiologicalStatus;
  training_load_analysis: TrainingLoadAnalysis;
  schedule_context: ScheduleContext;
  weather_context: WeatherContext | null;
}

/**
 * System Prompt for the Coach IA
 */
export const SYSTEM_PROMPT = `Tu es un coach d'entraînement expert pour athlètes d'endurance. Tu as accès aux données en temps réel de l'athlète (profil, récupération, charge d'entraînement, planning).

## Personnalité et style
- Expert en sciences du sport, méthodique et encourageant
- Tu vouvoies l'athlète et utilises un ton professionnel mais bienveillant
- Tu justifies toujours tes conseils par les données ("Preuve par la donnée")
- Tu utilises le **gras** pour les points clés
- Tu es concis et actionnable

## Règles d'analyse de la fatigue (IMPORTANT)
Les indicateurs de récupération (Whoop, HRV, etc.) sont des **signaux**, pas des interdictions absolues.

### Si Récupération Rouge (<34%) :
1. Vérifiez le type de séance prévue
2. Si séance intense → Demandez le ressenti subjectif avant de recommander d'annuler
3. Si récupération active/légère → Peut être maintenue, validez avec l'athlète
4. Cherchez toujours la **cause** (mauvais sommeil, maladie, stress externe)

### Si Récupération Jaune (34-66%) :
- Séances d'endurance OK
- Séances intenses : proposez une adaptation (réduire durée ou intensité)
- Surveillez la tendance sur plusieurs jours

### Si Récupération Verte (>66%) :
- Toutes séances OK
- C'est le moment idéal pour les séances clés de qualité

## Analyse de la charge d'entraînement
- Comparez le RPE déclaré vs le type de séance (RPE 8/10 sur un footing = **anomalie à investiguer**)
- Séances manquées : ne culpabilisez pas l'athlète, mais alertez si récurrent (>2 séances/semaine)
- TSB très négatif (<-20) : recommandez un allègement proactif

## Règles de santé et sécurité
- **JAMAIS** de diagnostic médical — restez toujours dans le rôle coach
- **Symptômes bénins** (toux légère, fatigue passagère, courbatures après séance, petit mal de tête) → conseils pratiques : repos, hydratation, sommeil. Pas de prise de panique, pas de "consultez un médecin" systématique
- **Symptômes potentiellement sérieux** (douleur aiguë persistante, fièvre, douleur thoracique, essoufflement inhabituel, signes de surentraînement sévère comme resting HR qui monte depuis des jours + TSB très négatif + insomnie) → alors et seulement alors recommandez une consultation
- Si l'athlète mentionne un symptôme, évaluez d'abord si cela semble grave avant de réagir. Le bon sens avant la prudence excessive

## Suggestions d'adaptation du planning
- Quand vous proposez une adaptation (repos, changement de séance, annulation), formulez-la comme une **proposition explicite** : "Je vous propose de..." ou "On pourrait adapter comme ceci : ..."
- Restez encourageant : une adaptation n'est pas un échec, c'est de la stratégie

## Réponse aux questions de faisabilité de séance (IMPORTANT)
Quand l'athlète demande s'il peut faire sa séance du jour, comment doser l'intensité,
ou s'il est en forme (ex. « Est-ce que je peux faire ma séance d'aujourd'hui ? ») :
1. **Cite explicitement les deux indicateurs chiffrés** issus du contexte :
   - le **TSB** (valeur signée, ex. "TSB de -25") avec son statut (\`tsb_status\`) ;
   - le **score de récupération** (ex. "récupération à 28 %") avec son code couleur (vert/jaune/rouge).
   Ne réponds jamais à ce type de question sans avoir nommé ces deux valeurs.
2. Croise ces deux signaux avec la séance prévue (\`schedule_context.today.planned_workout\`).
3. **Si une adaptation est nécessaire**, propose une alternative **concrète et chiffrée**,
   en justifiant par la physiologie (fatigue accumulée, récupération insuffisante).
   Exprime l'intensité cible dans l'unité du sport (voir ci-dessous) :
   p. ex. remplacer un seuil par de l'endurance « à ~65 % de la FTP, soit ~170 W » pour un cycliste.
4. Si TSB et récupération sont bons, confirme que la séance peut être réalisée telle quelle.

## Vocabulaire spécifique au sport (IMPORTANT)
Adapte systématiquement ton vocabulaire et tes unités au sport concerné par la question
(données dans \`athlete_profile.sports\`). Couvre les 8 sports de l'application :
- **Vélo & VTT** : raisonne en **watts** et en **% de la FTP** (\`ftp_watts\`), zones de puissance. En VTT, tiens compte du **dénivelé** et du **terrain technique**.
- **Course à pied** : raisonne en **allure (min/km)** et en **% de la VMA** (\`vma_kmh\`), zones d'allure / FC.
- **Marche & Randonnée** : pas de seuil de puissance. Raisonne en **durée**, **dénivelé (D+)**, **effort perçu (RPE)** et **zones de FC**. Allure indicative en min/km si pertinent.
- **Ski de fond** : sport d'endurance — raisonne en **durée**, **FC / zones**, **effort perçu**, et distingue les techniques (classique / skating) si utile.
- **Ski alpin** : raisonne en **nombre de descentes / volume**, **effort perçu** et sollicitation musculaire (quadriceps), plutôt qu'en allure.
- **Musculation / Renforcement** : raisonne en **séries × répétitions**, **charge (% du 1RM)**, **RPE / RIR (reps en réserve)**, **tempo** et **temps de récupération** entre séries.
- Si le sport ne possède **pas de seuil chiffré** dans le contexte (pas de FTP/VMA/CSS), n'invente jamais de watts/allure : appuie-toi sur l'**effort perçu (RPE)**, la **FC** et la **durée**.
- Quand un seuil existe et que tu calcules une cible (ex. endurance à 65 % FTP), donne la **valeur absolue** (W, allure) en plus du pourcentage.

## Format de réponse
- Utilisez des listes à puces pour les recommandations
- Commencez par l'essentiel (bottom line up front)
- Terminez par une question ou suggestion d'action concrète

## Contexte athlète
Le contexte JSON ci-dessous contient les données actuelles de l'athlète. Base toutes tes analyses sur ces données réelles.

## Données manquantes / sources non connectées (IMPORTANT)
Certains champs du contexte peuvent être **null** ou absents quand une source n'est pas connectée (ex. Whoop non lié → \`recovery_score\`/\`recovery_status\` à null, \`sleep\` et \`hrv_ms\` nuls ; pas d'objectif → \`objective\` null ; charge indisponible → \`tsb_status\` = "Données manquantes").
- **N'invente jamais** une valeur manquante (ne suppose pas une récupération, un TSB ou un sommeil).
- Signale brièvement la donnée indisponible ("Je n'ai pas tes données de récupération aujourd'hui") et **appuie-toi sur le reste du contexte et sur le ressenti subjectif** de l'athlète.
- Continue à donner un conseil utile malgré l'absence de données : ne bloque pas, adapte-toi.

## Conditions météo et entraînement

Si le contexte JSON contient "weather_context", utilise-le pour adapter tes conseils :

### Compatibilité sport / météo
- **Vélo** : déconseillé si vent > 50 km/h, pluie > 5mm/h, neige, verglas (< 2°C + humidité), visibilité < 1 km
- **Course** : plus tolérant. Déconseillé si vent > 60 km/h, orage violent, temp < -15°C ou > 38°C
- **Natation ext.** : déconseillée en cas d'orage ou températures très basses
- **Alerte sévère** : toutes activités → intérieur

### Alternatives indoor
- Vélo → Home trainer / vélo d'intérieur
- Course → Tapis / renforcement musculaire
- Natation ext. → Piscine couverte / renforcement
- Ne supprime JAMAIS la séance : propose une alternative de même durée et intensité

### Conditions au sol
- "Neige au sol" même sans nouvelle chute → déconseille vélo route, prudence course
- "Sol mouillé/boueux" → prudence trail, OK route

### Dans les plans
- Consulte les prévisions pour chaque jour et choisis le sport en conséquence
- Mentionne brièvement la météo dans la description si elle influence le choix
- Pas de paragraphe météo complet, juste une mention contextuelle naturelle

### Alerte proactive
Si la météo du jour rend la séance prévue déconseillable, signale-le IMMÉDIATEMENT avec une alternative concrète.
`;

export const PLAN_GENERATION_PROMPT = `### MODE PLANIFICATION
Tu dois générer un plan d'entraînement personnalisé à partir du contexte JSON fourni. Respecte strictement ce format de réponse JSON (aucun texte avant/après) :
{
  "summary": "phrase brève expliquant le plan et ses objectifs principaux",
  "weeks": [
    {
      "week_index": 1,
      "focus": "objectif principal de la semaine",
      "days": [
        {
          "date": "YYYY-MM-DD",
          "sessions": [
            {
              "title": "nom de séance court et descriptif",
              "sport": "running|cycling|swimming|strength|triathlon|other",
              "duration_minutes": 75,
              "description": "détails de la séance (structure, intensités, objectifs)",
              "intensity": "recovery|endurance|tempo|threshold|vo2max|strength"
            }
          ]
        }
      ]
    }
  ]
}

Règles :
- Construis le plan semaine par semaine, chaque jour peut contenir plusieurs séances.
- Utilise les données de l'utilisateur (objectif, niveau, fatigue, disponibilités) pour adapter volumes et intensités.
- Ne supprime jamais les séances existantes : ajoute simplement de nouvelles propositions.
- Prévois au moins 2 jours légers/récupération par semaine.
- Les durées sont en minutes entières.
- Préfère des séances réalistes (pas plus de 2 séances intenses consécutives).
- Si "weather_context" est présent dans le contexte, choisis les sports en fonction de la météo de chaque jour.
  Si conditions défavorables → propose alternative intérieure.
- Ajoute un champ optionnel "weather_note" par session si la météo influence le choix :
  { "weather_note": "Pluie prévue l'après-midi, séance matinale recommandée" }
`;

/**
 * Build the context JSON from database
 */
export async function buildCoachContext(userId: string, clientTimezone?: string): Promise<CoachContext> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Fetch all required data in parallel
  const [
    profileResult,
    physioResult,
    sportsResult,
    objectiveResult,
    allObjectivesResult,
    metricsResult,
    activitiesResult,
    loadResult,
    todayWorkoutResult,
    upcomingResult,
  ]: any[] = await Promise.all([
    (supabase as any).from("users").select("*").eq("id", userId).single(),
    (supabase as any)
      .from("physiological_data")
      .select("*")
      .eq("user_id", userId)
      .single(),
    (supabase as any)
      .from("user_sports")
      .select("*, sports(*)")
      .eq("user_id", userId),
    (supabase as any)
      .from("objectives")
      .select("*")
      .eq("user_id", userId)
      .eq("priority", "A")
      .eq("status", "active")
      .gte("event_date", today)
      .order("event_date")
      .limit(1)
      .single(),
    (supabase as any)
      .from("objectives")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .gte("event_date", today)
      .order("event_date"),
    (supabase as any)
      .from("daily_metrics")
      .select("*")
      .eq("user_id", userId)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase as any)
      .from("activities")
      .select("*, sports(name, name_fr)")
      .eq("user_id", userId)
      .gte(
        "scheduled_date",
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]
      )
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: false })
      .limit(5),
    (supabase as any)
      .from("activities")
      .select("scheduled_date, tss, status")
      .eq("user_id", userId)
      .gte(
        "scheduled_date",
        new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]
      )
      .order("scheduled_date"),
    (supabase as any)
      .from("activities")
      .select("*, sports(name, name_fr)")
      .eq("user_id", userId)
      .eq("scheduled_date", today)
      .eq("status", "planned")
      .limit(1)
      .single(),
    (supabase as any)
      .from("activities")
      .select("*, sports(name, name_fr)")
      .eq("user_id", userId)
      .gt("scheduled_date", today)
      .eq("status", "planned")
      .order("scheduled_date")
      .limit(3),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const profile = profileResult.data;
  const physio = physioResult.data;
  const sports = sportsResult.data || [];
  const objective = objectiveResult.data;
  const allObjectives = allObjectivesResult.data || [];
  const metrics = metricsResult.data;
  const activities = activitiesResult.data || [];
  const allActivitiesForLoad = loadResult.data || [];
  const todayWorkout = todayWorkoutResult.data;
  const upcoming = upcomingResult.data || [];

  // Fetch weather if location available
  let weatherContext: WeatherContext | null = null;
  if (profile?.latitude && profile?.longitude) {
    try {
      weatherContext = await getWeatherContext(supabase, profile.latitude, profile.longitude);
    } catch (e) {
      console.error("Weather fetch failed, continuing without:", e);
      weatherContext = null;
    }
  }

  // Live CTL/ATL/TSB calculation (same as dashboard)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tssData = allActivitiesForLoad.map((a: any) => ({
    date: a.scheduled_date,
    tss: a.status === "completed" ? a.tss || 0 : 0,
  }));
  const loadData = calculateTrainingLoad(tssData);
  const latestLoad = loadData.length > 0 ? loadData[loadData.length - 1] : null;

  const atlValue = latestLoad?.atl ?? 0;
  const ctlValue = latestLoad?.ctl ?? 0;
  const hasTsb = latestLoad !== null;
  const tsbValue = latestLoad?.tsb ?? 0;
  const loadContext = hasTsb
    ? tsbValue < -20
      ? "Bloc de charge - fatigue accumulée"
      : tsbValue > 15
      ? "Phase de repos - bonne fraîcheur"
      : "Entraînement normal"
    : "Données de charge indisponibles";
  // US-13: single source of truth for the TSB status label (shared with the dashboard).
  const tsbStatus = hasTsb ? interpretTSB(tsbValue).label : "Données manquantes";

  // Calculate age from birth date
  let age: number | null = null;
  if (physio?.birth_date) {
    const birthDate = new Date(physio.birth_date);
    const ageDiff = Date.now() - birthDate.getTime();
    age = Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
  }

  // Calculate days remaining for objective
  let daysRemaining = 0;
  if (objective?.event_date) {
    const eventDate = new Date(objective.event_date);
    const todayDate = new Date(today);
    daysRemaining = Math.ceil(
      (eventDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)
    );
  }

  // Get recovery status — use actual last available value, no invented fallback.
  // US-30 AC2: when the source is not connected (no score), the status is null
  // too — we never fabricate a "yellow" so the coach can flag the gap.
  const recoveryScore: number | null = metrics?.recovery_score ?? null;
  const recoveryStatus: "green" | "yellow" | "red" | null =
    recoveryScore === null
      ? null
      : recoveryScore >= 67
      ? "green"
      : recoveryScore >= 34
      ? "yellow"
      : "red";

  // Get current datetime with timezone
  const now = new Date();
  const timezone = clientTimezone || 'Europe/Paris';
  const timeString = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });

  // Build context
  const context: CoachContext = {
    current_datetime: {
      date: today,
      time: timeString,
      timezone,
    },
    athlete_profile: {
      name: profile?.full_name || "Athlète",
      age,
      weight_kg: physio?.weight_kg || null,
      height_cm: physio?.height_cm || null,
      hr_max: physio?.hr_max || null,
      hr_rest: physio?.hr_rest || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sports: sports.map((s: any) => ({
        name: s.sports?.name || "other",
        level: s.level || "intermediate",
        vma_kmh: s.vma_kmh,
        ftp_watts: s.ftp_watts,
        css_per_100m: s.css_per_100m,
      })),
      objective: objective
        ? {
            name: objective.name,
            date: objective.event_date,
            type: objective.event_type,
            priority: objective.priority,
            days_remaining: daysRemaining,
          }
        : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      objectives: allObjectives.map((obj: any) => {
        const eventDate = new Date(obj.event_date);
        const todayDate = new Date(today);
        const days = Math.ceil(
          (eventDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        return {
          name: obj.name,
          date: obj.event_date,
          type: obj.event_type,
          priority: obj.priority,
          days_remaining: days,
        };
      }),
      limitations: [],
    },
    physiological_status_today: {
      source: metrics?.source || "unknown",
      date: today,
      recovery_score: recoveryScore,
      recovery_status: recoveryStatus,
      sleep: {
        duration_hours: metrics?.sleep_duration_minutes
          ? metrics.sleep_duration_minutes / 60
          : null,
        quality_score: metrics?.sleep_score || null,
        deep_percent:
          metrics?.sleep_deep_minutes && metrics?.sleep_duration_minutes
            ? Math.round(
                (metrics.sleep_deep_minutes / metrics.sleep_duration_minutes) *
                  100
              )
            : null,
        rem_percent:
          metrics?.sleep_rem_minutes && metrics?.sleep_duration_minutes
            ? Math.round(
                (metrics.sleep_rem_minutes / metrics.sleep_duration_minutes) *
                  100
              )
            : null,
      },
      hrv_ms: metrics?.hrv_ms || null,
      hrv_trend: "stable",
      resting_hr: metrics?.resting_hr || null,
      strain: metrics?.strain || null,
    },
    training_load_analysis: {
      context: loadContext,
      metrics: {
        atl: atlValue,
        ctl: ctlValue,
        tsb: tsbValue,
        tsb_status: tsbStatus,
      },
      /* eslint-disable @typescript-eslint/no-explicit-any */
      weekly_summary: {
        total_hours:
          activities.reduce(
            (sum: number, a: any) => sum + (a.actual_duration_minutes || 0),
            0
          ) / 60,
        total_tss: activities.reduce(
          (sum: number, a: any) => sum + (a.tss || 0),
          0
        ),
        target_hours: 10,
        target_tss: 500,
      },
      recent_activities: activities.map((a: any) => ({
        date: a.scheduled_date,
        sport: a.sports?.name || "other",
        title: a.title,
        description: a.description || null,
        duration_minutes:
          a.actual_duration_minutes || a.planned_duration_minutes || 0,
        tss: a.tss || 0,
        rpe: a.rpe,
        status: a.status,
      })),
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
    schedule_context: {
      today: {
        date: today,
        planned_workout: todayWorkout
          ? {
              title: todayWorkout.title,
              description: todayWorkout.description || null,
              sport: (todayWorkout.sports as { name: string })?.name || "other",
              duration_minutes: todayWorkout.planned_duration_minutes || 60,
              intensity: todayWorkout.intensity || "endurance",
              tss: todayWorkout.tss || 50,
            }
          : null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upcoming: upcoming.map((a: any) => ({
        date: a.scheduled_date,
        title: a.title,
        description: a.description || null,
        sport: a.sports?.name || "other",
        intensity: a.intensity || "endurance",
      })),
    },
    weather_context: weatherContext,
  };

  return context;
}

/**
 * Format context for the AI prompt
 */
export function formatContextForPrompt(context: CoachContext): string {
  return `\n\n---\n## CONTEXTE ATHLÈTE (données temps réel)\n\`\`\`json\n${JSON.stringify(
    context,
    null,
    2
  )}\n\`\`\``;
}

/**
 * Check for proactive alerts based on context
 */
export function checkProactiveAlerts(context: CoachContext): string[] {
  const alerts: string[] = [];

  // Recovery alert
  if (context.physiological_status_today.recovery_status === "red") {
    const todayWorkout = context.schedule_context.today.planned_workout;
    if (
      todayWorkout &&
      ["threshold", "vo2max", "anaerobic"].includes(todayWorkout.intensity)
    ) {
      alerts.push(
        `⚠️ **Alerte Récupération**: Votre récupération est faible (${context.physiological_status_today.recovery_score}%) et vous avez une séance intense prévue (${todayWorkout.title}). Souhaitez-vous qu'on adapte ?`
      );
    }
  }

  // TSB alert
  if (context.training_load_analysis.metrics.tsb < -25) {
    alerts.push(
      `⚠️ **Alerte Charge**: Votre TSB est très bas (${context.training_load_analysis.metrics.tsb}). Vous accumulez de la fatigue. On devrait prévoir un allègement.`
    );
  }

  // Sleep alert
  const sleepHours = context.physiological_status_today.sleep.duration_hours;
  if (sleepHours && sleepHours < 6) {
    alerts.push(
      `💤 **Sommeil insuffisant**: Seulement ${sleepHours.toFixed(
        1
      )}h cette nuit. Cela va impacter votre récupération et votre performance.`
    );
  }

  // Objective countdown
  if (context.athlete_profile.objective) {
    const days = context.athlete_profile.objective.days_remaining;
    if (days === 14 || days === 7 || days === 3) {
      alerts.push(
        `🎯 **${context.athlete_profile.objective.name}**: J-${days} ! Nous entrons dans la phase finale de préparation.`
      );
    }
  }

  // Weather alerts
  if (context.weather_context) {
    const weather = context.weather_context;
    const todayWorkout = context.schedule_context.today.planned_workout;

    // OWM severe/extreme alerts
    for (const alert of weather.alerts) {
      if (alert.severity === "severe" || alert.severity === "extreme") {
        alerts.push(
          `🚨 **Alerte Météo ${alert.severity === "extreme" ? "Extrême" : "Sévère"}** : ${alert.event} — ${alert.description}`
        );
      }
    }

    if (todayWorkout) {
      const sport = todayWorkout.sport.toLowerCase();
      const isOutdoorCycling = sport.includes("cycl") || sport.includes("vélo") || sport === "cycling";
      const isOutdoorRunning = sport.includes("run") || sport.includes("course") || sport === "running";
      const isOutdoorSwimming = sport.includes("swim") || sport.includes("nata");

      // Get today's feasibility
      const todayForecast = weather.forecast.find(
        (f) => f.date === context.current_datetime.date
      );
      const feasibility = todayForecast?.outdoor_feasibility;

      if (feasibility) {
        const sportFeasibility =
          isOutdoorCycling ? feasibility.cycling :
          isOutdoorRunning ? feasibility.running :
          isOutdoorSwimming ? feasibility.swimming_outdoor :
          null;

        if (sportFeasibility === "deconseille") {
          alerts.push(
            `🌧️ **Alerte Météo** : ${weather.current.description} (${weather.current.temperature_c.toFixed(1)}°C, vent ${weather.current.wind_speed_kmh.toFixed(0)} km/h). Votre séance **${todayWorkout.title}** est déconseillée en extérieur. Envisagez une alternative indoor.`
          );
        } else if (sportFeasibility === "prudence") {
          alerts.push(
            `⚠️ **Météo** : ${weather.current.description} (${weather.current.temperature_c.toFixed(1)}°C). Prudence pour votre séance **${todayWorkout.title}** en extérieur.`
          );
        }
      }

      // Ground conditions
      if (weather.ground_conditions.ground_assessment.includes("Neige") && isOutdoorCycling) {
        alerts.push(
          `❄️ **Conditions au sol** : ${weather.ground_conditions.ground_assessment}. Le vélo route est fortement déconseillé.`
        );
      }
    }
  }

  return alerts;
}
