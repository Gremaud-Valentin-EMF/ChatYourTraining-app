import { NextResponse } from "next/server";
import OpenAI from "openai";

type ObjectiveFamily = "competition" | "performance" | "wellness";
type ObjectivePriority = "A" | "B" | "C";

interface ObjectiveItem {
  tempId: string;
  family: ObjectiveFamily;
  name: string;
  description: string;
  priority: ObjectivePriority;
  event_date?: string;
  target_date?: string;
  target_time?: string;
  event_name?: string;
  target_distance_km?: string;
  target_elevation_m?: string;
  target_count?: string;
  target_count_unit?: string;
  target_weight_kg?: string;
  target_pace?: string;
  target_power_watts?: string;
  target_duration_min?: string;
}

interface AnalyzeRequest {
  objectives: ObjectiveItem[];
  target_hours: number;
  sports: string[];
}

interface Alert {
  rule?: string;
  level: "critical" | "warning" | "info";
  events?: string[];
  message: string;
}

// ─── Deterministic date helpers ───────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  // Parse YYYY-MM-DD components directly into UTC to avoid any timezone shift
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.abs(Math.round((db - da) / 86_400_000));
}

type SportCategory = "running" | "cycling" | "mtb" | "walking" | "hiking" | "alpine-skiing" | "xc-skiing" | "strength" | "other";

function getSportCategory(name: string): SportCategory {
  switch (name) {
    case "5 km":
    case "10 km":
    case "Semi-marathon":
    case "Marathon":
    case "Ultra-trail / Trail":             return "running";
    case "Cyclosportive":
    case "Gran Fondo":
    case "Gravel event":
    case "Course sur route":                return "cycling";
    case "Enduro":
    case "XCO (cross-country olympique)":
    case "Marathon VTT":
    case "Descente VTT":                    return "mtb";
    case "Marche nordique compétition":
    case "Marche athlétique":
    case "Randonnée sportive chronométrée": return "walking";
    case "Raid":
    case "Trek multi-jours":
    case "Haute randonnée":
    case "Skyrace / Ultra-trail rando":     return "hiking";
    case "Descente chronométrée":
    case "Compétition de ski alpin":        return "alpine-skiing";
    case "Skiathlon":
    case "Marathon nordique (ex : Vasaloppet)":
    case "Course de ski de fond":           return "xc-skiing";
    case "Compétition de powerlifting":
    case "Haltérophilie":
    case "Compétition de force athlétique": return "strength";
    default:                                return "other";
  }
}

function classifyRecovery(o: ObjectiveItem): { minDays: number; label: string; sport: SportCategory } {
  const label = o.event_name || o.name;
  const distKm = o.target_distance_km ? parseFloat(o.target_distance_km) : null;

  const sport = getSportCategory(o.name);
  switch (o.name) {
    // ── Running ──────────────────────────────────────────────────────────────
    case "Marathon":                      return { minDays: 28, label, sport };
    case "Ultra-trail / Trail":           return { minDays: 42, label, sport };
    case "Semi-marathon":                 return { minDays: 14, label, sport };
    case "10 km":                         return { minDays: 7,  label, sport };
    case "5 km":                          return { minDays: 7,  label, sport };
    // ── Cycling ──────────────────────────────────────────────────────────────
    case "Cyclosportive":
    case "Gran Fondo":
      // conservative if no distance provided
      return { minDays: distKm !== null && distKm < 150 ? 10 : 14, label, sport };
    case "Gravel event":                  return { minDays: 10, label, sport };
    case "Course sur route":              return { minDays: 7,  label, sport };
    // ── MTB ──────────────────────────────────────────────────────────────────
    case "Enduro":
    case "Marathon VTT":                  return { minDays: 10, label, sport };
    case "XCO (cross-country olympique)": return { minDays: 7,  label, sport };
    case "Descente VTT":                  return { minDays: 5,  label, sport };
    // ── Walking / Hiking ─────────────────────────────────────────────────────
    case "Marche nordique compétition":
    case "Marche athlétique":             return { minDays: 7,  label, sport };
    case "Randonnée sportive chronométrée":
    case "Raid":
    case "Trek multi-jours":
    case "Haute randonnée":               return { minDays: 14, label, sport };
    case "Skyrace / Ultra-trail rando":   return { minDays: 21, label, sport };
    // ── Ski alpin ────────────────────────────────────────────────────────────
    case "Descente chronométrée":
    case "Compétition de ski alpin":      return { minDays: 5,  label, sport };
    // ── Ski de fond ──────────────────────────────────────────────────────────
    case "Skiathlon":
    case "Marathon nordique (ex : Vasaloppet)":
    case "Course de ski de fond":         return { minDays: 10, label, sport };
    // ── Musculation ──────────────────────────────────────────────────────────
    case "Compétition de powerlifting":
    case "Haltérophilie":
    case "Compétition de force athlétique": return { minDays: 14, label, sport };
    // ── Default (conservative) ───────────────────────────────────────────────
    default:                              return { minDays: 14, label, sport };
  }
}

function detectRecoveryConflicts(objectives: ObjectiveItem[]): Alert[] {
  const competitions = objectives.filter(
    (o) => o.family === "competition" && o.event_date
  );

  const alerts: Alert[] = [];

  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      const a = competitions[i];
      const b = competitions[j];
      const gap = daysBetween(a.event_date!, b.event_date!);
      const ra = classifyRecovery(a);
      const rb = classifyRecovery(b);
      const crossSport = ra.sport !== rb.sport;
      // Multisport rule: max of the two minimums, reduced by 25% if different sports
      const rawRequired = Math.max(ra.minDays, rb.minDays);
      const required = crossSport ? Math.ceil(rawRequired * 0.75) : rawRequired;
      // Sort chronologically for the message
      const first  = a.event_date! <= b.event_date! ? ra.label : rb.label;
      const second = a.event_date! <= b.event_date! ? rb.label : ra.label;

      if (gap < 7) {
        const missingAbsolute = 7 - gap;
        alerts.push({
          rule: "RÈGLE_0",
          level: "critical",
          events: [ra.label, rb.label],
          message: `Délai critique : "${first}" et "${second}" sont séparés de seulement ${gap} jour${gap > 1 ? "s" : ""}. La règle absolue est de minimum 7 jours entre deux épreuves — il manque encore ${missingAbsolute} jour${missingAbsolute > 1 ? "s" : ""} pour atteindre ce seuil minimal. De plus, pour ces épreuves spécifiques, le délai recommandé est de ${required} jours. La récupération musculaire et systémique est impossible en si peu de temps.`,
        });
      } else if (gap < required) {
        const missing = required - gap;
        const crossNote = crossSport ? ` (sports différents — délai réduit à 75% du minimum du sport le plus exigeant : ${rawRequired} × 0,75 = ${required} jours)` : "";
        alerts.push({
          rule: "RÈGLE_1",
          level: "critical",
          events: [ra.label, rb.label],
          message: `Récupération insuffisante : "${first}" et "${second}" sont séparés de ${gap} jours, mais le délai minimum est de ${required} jours${crossNote}. Il manque ${missing} jour${missing > 1 ? "s" : ""}. Risque élevé de sous-performance et de blessure sur la seconde épreuve.`,
        });
      } else if (gap < required * 1.5) {
        const missing = required - gap;
        const crossNote = crossSport ? ` (délai réduit à 75% car sports différents)` : "";
        alerts.push({
          rule: "RÈGLE_1",
          level: "warning",
          events: [ra.label, rb.label],
          message: `Délai serré : "${first}" et "${second}" sont séparés de ${gap} jours (minimum recommandé : ${required} jours${crossNote}, soit ${missing} jour${missing > 1 ? "s" : ""} manquants). La récupération sera possible mais la préparation de la seconde épreuve sera contrainte.`,
        });
      }
    }
  }

  return alerts;
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function getProvider(): "openai" | "gemini" {
  const env = process.env.AI_PROVIDER?.toLowerCase();
  if (env === "gemini" || env === "openai") return env;
  return process.env.GOOGLE_GEMINI_API_KEY ? "gemini" : "openai";
}

const PRIORITY_LABELS: Record<ObjectivePriority, string> = {
  A: "Haute", B: "Moyenne", C: "Basse",
};

const FAMILY_LABELS: Record<ObjectiveFamily, string> = {
  competition: "Compétition / Événement",
  performance: "Performance personnelle",
  wellness: "Forme & Bien-être sportif",
};

function buildAnalysisPrompt(
  objectives: ObjectiveItem[],
  target_hours: number,
  sports: string[]
): string {
  const objectivesText = objectives
    .map((o) => {
      const date = o.event_date || o.target_date;
      const parts: string[] = [];
      if (o.event_name)          parts.push(`événement: "${o.event_name}"`);
      if (o.target_distance_km)  parts.push(`distance: ${o.target_distance_km} km`);
      if (o.target_elevation_m)  parts.push(`dénivelé: ${o.target_elevation_m} m D+`);
      if (o.target_time)         parts.push(`temps cible: ${o.target_time}`);
      if (o.target_count && o.target_count_unit) parts.push(`objectif: ${o.target_count} ${o.target_count_unit}`);
      if (o.target_weight_kg)    parts.push(`charge: ${o.target_weight_kg} kg`);
      if (o.target_pace)         parts.push(`allure cible: ${o.target_pace}/km`);
      if (o.target_power_watts)  parts.push(`FTP cible: ${o.target_power_watts} W`);
      if (o.target_duration_min) parts.push(`durée cible/séance: ${o.target_duration_min} min`);
      if (o.description)         parts.push(`précision: "${o.description}"`);
      const meta = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
      return `- [${FAMILY_LABELS[o.family]}] "${o.name}" — priorité ${PRIORITY_LABELS[o.priority]}${date ? ` — date: ${date}` : ""}${meta}`;
    })
    .join("\n");

  return `Tu es un coach sportif d'endurance expert et prudent. Tu analyses les objectifs
d'un athlète pour détecter des risques de planification.

IMPORTANT : La vérification des délais de récupération entre épreuves datées est
déjà effectuée par un système séparé — NE l'analyse PAS. Concentre-toi uniquement
sur les règles 2 à 6 ci-dessous.

**Profil athlète :**
- Sports pratiqués : ${sports.join(", ")}
- Volume d'entraînement actuel déclaré : ${target_hours}h/semaine

**Objectifs :**
${objectivesText}

---

### RÈGLE 2 — Surcharge d'objectifs haute priorité

Si l'athlète a plus de 2 objectifs de priorité Haute sur une période de 8 semaines → "warning".
Si l'athlète a plus de 3 objectifs de priorité Haute sur une période de 12 semaines → "warning".

Volume estimé nécessaire vs volume déclaré :
- Dépassement >30% → "warning" · Dépassement >60% → "critical"

---

### RÈGLE 3 — Incompatibilité physiologique entre sports

Combinaisons à risque → "warning" :
- Endurance longue (marathon, ultra) + musculation membres inférieurs intensive sur la même période
- Course haute fréquence (>5 séances/sem) + powerlifting ou haltérophilie
- Deux sports à fort impact (course + ski de fond) en volume maximal simultané

Combinaisons incompatibles → "critical" :
- Powerlifting/haltérophilie compétition + marathon/ultra dans les 6 semaines

---

### RÈGLE 4 — Objectif haute priorité non daté en période chargée

Si une compétition datée est dans moins de 8 semaines ET qu'un objectif haute
priorité sans date d'un sport différent coexiste → "info".
Message : inviter l'athlète à dater ou déprioriser l'objectif sans date.

---

### RÈGLE 5 — Volume cible insuffisant pour l'objectif

Volumes hebdomadaires minimaux indicatifs :
- 10km : 3h/sem · Semi : 4h/sem · Marathon : 6h/sem · Ultra : 10h/sem
- Cyclosportive <150km : 5h/sem · Cyclosportive >150km : 7h/sem

Si le volume déclaré est inférieur au minimum de l'objectif le plus exigeant :
→ "warning" si écart < 2h/sem · "critical" si écart > 2h/sem

---

### RÈGLE 6 — Contenu hors périmètre

Si les descriptions libres contiennent du contenu médical, psychologique ou
nutritionnel précis → "warning".

---

**FORMAT DE RÉPONSE OBLIGATOIRE — JSON strict, aucun texte avant ou après :**

{
  "alerts": [
    {
      "rule": "RÈGLE_2" | "RÈGLE_3" | "RÈGLE_4" | "RÈGLE_5" | "RÈGLE_6",
      "level": "critical" | "warning" | "info",
      "events": ["Nom objectif 1", "Nom objectif 2"],
      "message": "Message en français, vouvoyant l'utilisateur, expliquant le problème et son impact concret."
    }
  ]
}

Si aucun problème détecté : {"alerts": []}`;
}

async function analyzeWithOpenAI(
  objectives: ObjectiveItem[],
  target_hours: number,
  sports: string[]
): Promise<Alert[]> {
  const response = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || "gpt-4o",
    messages: [{ role: "user", content: buildAnalysisPrompt(objectives, target_hours, sports) }],
    temperature: 0.1,
    stream: false,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.alerts) ? parsed.alerts : [];
}

async function analyzeWithGemini(
  objectives: ObjectiveItem[],
  target_hours: number,
  sports: string[]
): Promise<Alert[]> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY not configured");

  const model = process.env.GOOGLE_GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildAnalysisPrompt(objectives, target_hours, sports) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini error ${response.status}`);

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text || "").join("") : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.alerts) ? parsed.alerts : [];
}

// ─── Route handler ────────────────────────────────────────────────────────────

const ALERT_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export async function POST(request: Request) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { objectives, target_hours, sports } = body;

    if (!objectives || objectives.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    // Deterministic check — never fails, never depends on AI
    const deterministic = detectRecoveryConflicts(objectives);

    // Qualitative LLM check — failure is non-fatal
    let llmAlerts: Alert[] = [];
    try {
      const provider = getProvider();
      llmAlerts = provider === "gemini"
        ? await analyzeWithGemini(objectives, target_hours, sports)
        : await analyzeWithOpenAI(objectives, target_hours, sports);
    } catch (aiError) {
      console.error("Objectives AI analysis failed:", aiError);
    }

    const alerts = [...deterministic, ...llmAlerts].sort(
      (x, y) => (ALERT_ORDER[x.level] ?? 9) - (ALERT_ORDER[y.level] ?? 9)
    );

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Objectives analyze route error:", error);
    return NextResponse.json({ alerts: [] });
  }
}
