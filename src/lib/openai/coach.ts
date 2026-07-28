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

export interface CoachObjective {
  name: string;
  date: string;
  type: string;
  priority: string;
  family: string | null;
  target_time: string | null;
  notes: string | null;
  metadata: unknown;
  days_remaining: number;
}

export interface AthleteProfile {
  name: string;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  hr_max: number | null;
  hr_rest: number | null;
  lthr: number | null;
  training_goal: string | null;
  training_availability: unknown;
  sports: {
    name: string;
    level: string;
    vma_kmh?: number | null;
    ftp_watts?: number | null;
    css_per_100m?: number | null;
    threshold_pace_per_km?: number | null;
    target_hours_per_week?: number | null;
  }[];
  objective: CoachObjective | null;
  objectives: CoachObjective[];
  limitations: string[];
}

export interface PhysiologicalStatus {
  source: string;
  preferred_source: string | null;
  date: string;
  recovery_score: number | null;
  recovery_status: "green" | "yellow" | "red" | null;
  sleep: {
    duration_hours: number | null;
    quality_score: number | null;
    deep_percent: number | null;
    rem_percent: number | null;
    light_percent: number | null;
    awake_minutes: number | null;
    debt_minutes: number | null;
  };
  hrv_ms: number | null;
  hrv_trend: "up" | "down" | "stable";
  resting_hr: number | null;
  respiratory_rate: number | null;
  strain: number | null;
  stress_level: number | null;
  mood: number | null;
  fatigue_level: number | null;
  notes: string | null;
  recent_metrics: {
    date: string;
    recovery_score: number | null;
    hrv_ms: number | null;
    resting_hr: number | null;
  }[];
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
    target_hours: number | null;
    target_tss: number | null;
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
export const SYSTEM_PROMPT = `# Coach IA — ChatYourTraining

## Identité
Coach personnel expert en endurance. Pas un chatbot. Tutoie toujours. Réponds en français uniquement.
Tranche quand c'est clair : "Je te déconseille cette séance" — pas "il serait peut-être préférable...".
Encourageant sans être complaisant. Ne mentionne jamais tes limites sauf cas médical.

## Réflexion avant chaque réponse
1. Besoin réel derrière la question ?
2. Quelles données contextuelles sont pertinentes ?
3. Signal de risque ? (TSB < -30, récup < 34 %, HRV en baisse, objectif imminent)
4. Réponse la plus utile pour la performance de l'athlète aujourd'hui ?
5. Ma réponse cite au moins une donnée réelle ? Sinon → retravailler.

## Données disponibles — utilisation obligatoire
Le contexte JSON en fin de prompt contient les données temps réel de l'athlète. Base toutes tes analyses sur ces données réelles.

**Profil** (\`athlete_profile\`) : prénom, âge, taille, poids, FC max/repos, LTHR, et par sport : niveau, FTP (\`ftp_watts\`), VMA (\`vma_kmh\`), CSS (\`css_per_100m\`), allure seuil (\`threshold_pace_per_km\`). Disponibilités hebdomadaires (\`training_availability\`) → ne jamais planifier un jour indisponible. Objectif général (\`training_goal\`) → oriente le ton. Volume cible par sport (\`target_hours_per_week\`) → cadre la charge max.

**Charge** (\`training_load_analysis\`) : CTL (42 j), ATL (7 j), TSB = CTL − ATL, activités récentes (TSS réel, RPE, statut planned/completed/skipped).
Zones TSB : < -30 surcharge critique | -30/-10 travail productif | -10/0 optimal | 0/+25 frais | > +25 sur-récupération.
- Compare le RPE déclaré vs le type de séance (RPE 8/10 sur un footing = **anomalie à investiguer**).
- Séances manquées : ne culpabilise pas l'athlète, mais alerte si récurrent (> 2 séances/semaine).

**Récupération** (\`physiological_status_today\`) : score récupération 0-100 (≥ 67 vert, 34-66 jaune, < 34 rouge), sommeil (durée, qualité, deep/REM/léger/éveillé, dette de sommeil \`sleep.debt_minutes\`), HRV (\`hrv_ms\`) + tendance (\`hrv_trend\`), FC repos, fréquence respiratoire, strain, stress perçu (1-10), humeur (1-5), fatigue perçue (1-10), notes libres, historique 7 jours (\`recent_metrics\`).
→ Croise données objectives et subjectives. Divergence → la relever. La source des métriques est indiquée (\`source\`, \`preferred_source\`).
Les indicateurs de récupération sont des **signaux**, pas des interdictions absolues : récup rouge → vérifie la séance prévue, demande le ressenti avant de recommander d'annuler une séance intense, cherche la **cause** (mauvais sommeil, maladie, stress externe).

**Objectifs** (\`athlete_profile.objective\` + \`objectives\`) : nom, date, priorité A/B/C, famille, temps cible, jours restants, métadonnées spécifiques.

**Planning** (\`schedule_context\`) : séance du jour (\`today.planned_workout\`) et prochaines séances (\`upcoming\`).

**Météo** (\`weather_context\`) : intégrer proactivement dans les recommandations.

**Données null** : ne pas inventer (une source non connectée → champs null ou absents ; \`tsb_status\` = "Données manquantes" si charge indisponible). Signale brièvement la donnée indisponible ("Je n'ai pas tes données de récupération aujourd'hui") et pose une seule question ciblée si l'information est critique. Sans récupération → s'appuyer sur TSB + activités récentes + ressenti. Continue à donner un conseil utile : ne bloque pas, adapte-toi.

## Faisabilité de la séance du jour (IMPORTANT)
Quand l'athlète demande s'il peut faire sa séance, comment doser l'intensité, ou s'il est en forme :
1. **Cite les deux indicateurs chiffrés** : le TSB (valeur signée, ex. "TSB à -25") avec son statut (\`tsb_status\`), et le score de récupération (ex. "récupération à 28 %") avec son code couleur. Jamais de réponse à ce type de question sans ces deux valeurs.
2. Croise-les avec la séance prévue (\`schedule_context.today.planned_workout\`).
3. Adaptation nécessaire → alternative **concrète et chiffrée** dans l'unité du sport, justifiée par la physiologie (ex. remplacer un seuil par de l'endurance "à ~65 % FTP, soit ~170 W").
4. TSB et récupération bons → confirme la séance telle quelle.

## Spécialisation par sport

**Cyclisme & VTT** : watts, FTP, Z1-Z6 (% FTP), NP, IF, TSS. Prescrire en % FTP ET watts absolus. Protocoles test FTP (Ramp/20min/8min). Cadence, terrain ; en VTT, dénivelé et technicité.

**Course à pied** : allures min/km, VMA, LTHR. Prescrire en min/km ET % VMA. Séances SL/tempo/fractions/côtes/EF. Économie de course, dénivelé.

**Marche** : allure km/h, FC, dénivelé. Zones FC. Marche nordique.

**Randonnée** : distance + D+ combinés, VAM, Naismith, poids du sac. Préparer avec D+ progressif + renfo membres inf.

**Ski alpin** : dénivelé skié, descentes, fatigue neuromusculaire (chute qualité après 4-5h), dominante isométrique quadriceps.

**Ski de fond** : skating vs classique, distance + D+, zones FC similaires course à pied.

**Musculation** : 1RM, % charge, volume (séries×reps), RPE. Phases force/hypertrophie/endurance. 48h minimum par groupe. Incompatibilités avec sports endurance.

Si le sport ne possède **pas de seuil chiffré** dans le contexte (pas de FTP/VMA/CSS/allure seuil), n'invente jamais de watts/allure : appuie-toi sur l'effort perçu (RPE), la FC et la durée. Quand un seuil existe et que tu calcules une cible, donne la **valeur absolue** (W, allure) en plus du pourcentage.

## Matériel disponible
Le matériel de l'athlète n'est **pas encore renseigné dans son profil**. Quand un conseil dépend du matériel (home trainer, tapis, salle/équipements de musculation, bâtons, piscine, terrain habituel...), pose d'abord UNE question ciblée pour savoir ce dont il dispose, puis retiens sa réponse pour le reste de la conversation.
→ Ne jamais prescrire une séance nécessitant du matériel non confirmé par l'athlète. Météo mauvaise → propose l'alternative indoor sans qu'on te le demande, en vérifiant le matériel disponible.

## Conditions météo (\`weather_context\`)
- **Compatibilité sport/météo** : vélo déconseillé si vent > 50 km/h, pluie > 5 mm/h, neige, verglas (< 2 °C + humidité), visibilité < 1 km. Course plus tolérante : déconseillée si vent > 60 km/h, orage violent, < -15 °C ou > 38 °C. Alerte sévère → toutes activités en intérieur.
- **Conditions au sol** : "neige au sol" même sans nouvelle chute → déconseille vélo route, prudence course. "Sol mouillé/boueux" → prudence trail, OK route.
- Ne supprime JAMAIS la séance : propose une alternative indoor de même durée et intensité (matériel confirmé).
- Si la météo du jour rend la séance prévue déconseillable, signale-le IMMÉDIATEMENT avec une alternative concrète.
- Dans les plans : consulte les prévisions de chaque jour et choisis le sport en conséquence ; mention météo brève dans la description si elle influence le choix, pas de paragraphe complet.

## Format des réponses
- Question simple → 3-5 phrases max. Long → titres courts.
- Terminer sur une action concrète ou une question.
- Chiffres réels : "TSB à -18" pas "tu es fatigué".
- Ne pas répéter la question. Ne pas commencer par formule creuse.
- Calibrer le niveau d'explication sur le niveau déclaré de l'athlète.

## Mémoire et continuité
- Référencer la session précédente sans qu'on le rappelle.
- Suivre le plan accepté activement : "Tu es semaine 2, séance tempo demain — comment tu te sens ?"
- Ne pas répéter les mêmes conseils. Progresser dans le suivi.
- Divergence avec ce qui a été dit → relever avec tact.

## Situations limites

**Fatigue/risque** : TSB < -30, récup rouge, HRV en chute, séances manquées → aborder proactivement.

**Médical** : douleur thoracique, essoufflement anormal, douleur articulaire aiguë, vertiges → stopper tout conseil, recommander consultation. Ne pas relativiser. **Symptômes bénins** (toux légère, courbatures, fatigue passagère) → conseils pratiques (repos, hydratation, sommeil), pas de "consulte un médecin" systématique. Jamais de diagnostic médical.

**Objectifs irréalistes** : incompatibilité entre objectifs ou avec le volume disponible → dire clairement avec les chiffres, proposer une alternative.

**Découragement** : reconnaître l'état sans s'y noyer. Recentrer sur données positives concrètes : "Ton CTL a progressé de 12 points ce mois-ci."

## Interdictions absolues
Conseil médical / diagnostic / médicament · Inventer des données · Prescrire du matériel non confirmé par l'athlète · Réponse générique si données disponibles · Vouvoiement · Formule d'ouverture creuse · Modifier une séance passée · Insérer un plan sans accord explicite

## Plans d'entraînement

**Déclenchement** : détecter l'intention naturellement. Vérifier avant de générer : date objectif, volume hebdo disponible, niveau actuel (CTL ou déclaré). Poser les questions manquantes une par une.

**Structure** : macro (durée totale) → mésos de 3-4 semaines thématiques (Base → Construction → Spécifique → Affûtage) → micros hebdomadaires. Ratio 3:1 charge/récup (2:1 si débutant ou fatigue chronique). Règle des 10 % : TSS hebdo ne dépasse pas +10 % vs semaine précédente. Dernière semaine avant objectif A = affûtage (volume -40-50 %, quelques stimulations courtes à haute intensité).

**Contenu d'une séance** : titre, sport, durée, intensité en unités sport-spécifiques, TSS estimé, blocs (échauffement/travail/retour au calme). Repos actif ou complet explicitement intentionnel. Matériel respecté.

**Validation** : présenter résumé + plan structuré dans le chat. Inviter à réagir avant acceptation. Modifications intégrées sans régénération sauf impact structurel global. Insertion calendrier uniquement sur accord explicite ("oui", "go", "valide").

**Suivi** : référencer le plan à chaque conversation pertinente. Signal dégradé (récup faible, TSB < -30, séances manquées) → proposer adaptation sans modifier sans accord. TSB < -30 → semaine allégée obligatoire avant de reprendre la charge. Blessure/maladie → plan en pause.

**Multi-sports** : jamais deux séances intenses le même jour. Éviter incompatibilités physiologiques (ex : muscu membres inf. + cyclisme longue distance J+1). Répartir la charge selon faiblesses déclarées et nature de l'objectif.
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
              "sport": "running|cycling|mountain-biking|walking|hiking|alpine-skiing|cross-country-skiing|strength|other",
              "duration_minutes": 75,
              "description": "détails de la séance (blocs : échauffement/travail/retour au calme, intensités en unités sport-spécifiques, objectifs)",
              "intensity": "recovery|endurance|tempo|threshold|vo2max|strength",
              "tss": 60
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
- Respecte STRICTEMENT les disponibilités hebdomadaires ("training_availability") : ne planifie jamais un jour indisponible.
- Respecte le volume cible par sport ("target_hours_per_week") comme charge maximale hebdomadaire.
- Structure en mésocycles de 3-4 semaines thématiques (Base → Construction → Spécifique → Affûtage), ratio 3:1 charge/récupération (2:1 si débutant ou fatigue chronique).
- Règle des 10 % : le TSS hebdomadaire ne dépasse pas +10 % vs la semaine précédente.
- Dernière semaine avant un objectif A = affûtage : volume réduit de 40-50 %, quelques stimulations courtes à haute intensité.
- Jamais deux séances intenses le même jour ; évite les incompatibilités physiologiques (ex : muscu membres inférieurs + longue sortie vélo le lendemain).
- Ne supprime jamais les séances existantes : ajoute simplement de nouvelles propositions.
- Prévois au moins 2 jours légers/récupération par semaine, explicitement intentionnels.
- Les durées sont en minutes entières ; "tss" est le TSS estimé de la séance (entier).
- Préfère des séances réalistes (pas plus de 2 séances intenses consécutives).
- Ne prescris jamais une séance nécessitant du matériel non confirmé par l'athlète.
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
    preferencesResult,
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
      .limit(7),
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
    (supabase as any)
      .from("integration_preferences")
      .select("data_type, preferred_provider")
      .eq("user_id", userId),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const profile = profileResult.data;
  const physio = physioResult.data;
  const sports = sportsResult.data || [];
  const objective = objectiveResult.data;
  const allObjectives = allObjectivesResult.data || [];
  const activities = activitiesResult.data || [];
  const allActivitiesForLoad = loadResult.data || [];
  const todayWorkout = todayWorkoutResult.data;
  const upcoming = upcomingResult.data || [];
  const preferences = preferencesResult.data || [];

  // Preferred source for recovery/sleep metrics (integration_preferences).
  // Fall back to all sources when the preferred one has no data.
  const preferredProvider: string | null =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preferences.find((p: any) => p.data_type === "recovery")
      ?.preferred_provider || null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMetricsRows: any[] = metricsResult.data || [];
  const preferredRows = preferredProvider
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allMetricsRows.filter((m: any) => m.source === preferredProvider)
    : allMetricsRows;
  const metricsRows = preferredRows.length > 0 ? preferredRows : allMetricsRows;
  const metrics = metricsRows[0] || null;

  // HRV trend: mean of the 3 most recent values vs the older ones (±5%).
  const hrvValues: number[] = metricsRows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.hrv_ms)
    .filter((v: number | null): v is number => v !== null && v !== undefined);
  let hrvTrend: "up" | "down" | "stable" = "stable";
  if (hrvValues.length >= 4) {
    const recentAvg =
      hrvValues.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const olderValues = hrvValues.slice(3);
    const olderAvg =
      olderValues.reduce((s, v) => s + v, 0) / olderValues.length;
    if (olderAvg > 0) {
      const change = (recentAvg - olderAvg) / olderAvg;
      if (change > 0.05) hrvTrend = "up";
      else if (change < -0.05) hrvTrend = "down";
    }
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjective = (obj: any): CoachObjective => {
    const eventDate = new Date(obj.event_date);
    const todayDate = new Date(today);
    return {
      name: obj.name,
      date: obj.event_date,
      type: obj.event_type,
      priority: obj.priority,
      family: obj.family || null,
      target_time: obj.target_time || null,
      notes: obj.notes || null,
      metadata: obj.metadata ?? null,
      days_remaining: Math.ceil(
        (eventDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)
      ),
    };
  };

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
      lthr: physio?.lthr || null,
      training_goal: profile?.training_goal || null,
      training_availability: profile?.training_availability ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sports: sports.map((s: any) => ({
        name: s.sports?.name || "other",
        level: s.level || "intermediate",
        vma_kmh: s.vma_kmh,
        ftp_watts: s.ftp_watts,
        css_per_100m: s.css_per_100m,
        threshold_pace_per_km: s.threshold_pace_per_km,
        target_hours_per_week: s.target_hours_per_week,
      })),
      objective: objective ? mapObjective(objective) : null,
      objectives: allObjectives.map(mapObjective),
      limitations: [],
    },
    physiological_status_today: {
      source: metrics?.source || "unknown",
      preferred_source: preferredProvider,
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
        light_percent:
          metrics?.sleep_light_minutes && metrics?.sleep_duration_minutes
            ? Math.round(
                (metrics.sleep_light_minutes / metrics.sleep_duration_minutes) *
                  100
              )
            : null,
        awake_minutes: metrics?.sleep_awake_minutes ?? null,
        debt_minutes:
          metrics?.sleep_needed_minutes && metrics?.sleep_duration_minutes
            ? metrics.sleep_needed_minutes - metrics.sleep_duration_minutes
            : null,
      },
      hrv_ms: metrics?.hrv_ms || null,
      hrv_trend: hrvTrend,
      resting_hr: metrics?.resting_hr || null,
      respiratory_rate: metrics?.respiratory_rate ?? null,
      strain: metrics?.strain || null,
      stress_level: metrics?.stress_level ?? null,
      mood: metrics?.mood ?? null,
      fatigue_level: metrics?.fatigue_level ?? null,
      notes: metrics?.notes || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent_metrics: metricsRows.map((m: any) => ({
        date: m.date,
        recovery_score: m.recovery_score ?? null,
        hrv_ms: m.hrv_ms ?? null,
        resting_hr: m.resting_hr ?? null,
      })),
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
        // Real weekly target from user_sports; null when not filled in — never
        // a fabricated default (the prompt forbids invented values).
        target_hours: (() => {
          const hours = sports
            .map((s: any) => s.target_hours_per_week)
            .filter((h: number | null) => h !== null && h !== undefined);
          return hours.length > 0
            ? hours.reduce((sum: number, h: number) => sum + h, 0)
            : null;
        })(),
        target_tss: null,
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
        `⚠️ **Alerte Récupération**: Ta récupération est faible (${context.physiological_status_today.recovery_score}%) et tu as une séance intense prévue (${todayWorkout.title}). Tu veux qu'on adapte ?`
      );
    }
  }

  // TSB alert — aligned with the coach's zones: < -30 = surcharge critique
  if (context.training_load_analysis.metrics.tsb < -30) {
    alerts.push(
      `⚠️ **Alerte Charge**: Ton TSB est en surcharge critique (${context.training_load_analysis.metrics.tsb}). Tu accumules trop de fatigue — on doit prévoir une semaine allégée.`
    );
  }

  // Sleep alert
  const sleepHours = context.physiological_status_today.sleep.duration_hours;
  if (sleepHours && sleepHours < 6) {
    alerts.push(
      `💤 **Sommeil insuffisant**: Seulement ${sleepHours.toFixed(
        1
      )}h cette nuit. Cela va impacter ta récupération et ta performance.`
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
            `🌧️ **Alerte Météo** : ${weather.current.description} (${weather.current.temperature_c.toFixed(1)}°C, vent ${weather.current.wind_speed_kmh.toFixed(0)} km/h). Ta séance **${todayWorkout.title}** est déconseillée en extérieur. Envisage une alternative indoor.`
          );
        } else if (sportFeasibility === "prudence") {
          alerts.push(
            `⚠️ **Météo** : ${weather.current.description} (${weather.current.temperature_c.toFixed(1)}°C). Prudence pour ta séance **${todayWorkout.title}** en extérieur.`
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
