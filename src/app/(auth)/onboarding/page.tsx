"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Button,
  Input,
  Card,
  Progress,
  Select,
  Slider,
  Badge,
  Toggle,
  Modal,
} from "@/components/ui";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle,
  Activity,
  Heart,
  Target,
  Trophy,
  Plus,
  X,
  AlertTriangle,
  Info,
  Clock,
  Zap,
  ChevronRight,
} from "lucide-react";
import { getSportIconComponent } from "@/lib/sport-icons";
import type { Json } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

interface ProfileData {
  gender: "male" | "female" | "";
  birth_date: string;
  weight_kg: string;
  height_cm: string;
}

interface CardioData {
  hr_max: string;
  lthr: string;
}

interface ThresholdData {
  vma_kmh: string;
  threshold_pace_per_km: string;
  ftp_watts: string;
}

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

interface DaySlot {
  start: string;
  end: string;
}

interface DayAvailability {
  enabled: boolean;
  slots: DaySlot[];
}

interface AvailabilityData {
  target_hours: number;
  training_goal: "performance" | "health" | "leisure" | "";
  days: Record<DayKey, DayAvailability>;
}

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
  // adaptive fields
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

interface ObjectiveFieldSchema {
  event_name?: boolean;
  target_distance_km?: { required?: boolean };
  target_elevation_m?: boolean;
  target_time?: boolean;
  target_count?: { label: string; unit: string; placeholder: string; required?: boolean };
  target_weight_kg?: { required?: boolean; label?: string };
  target_pace?: boolean;
  target_power_watts?: boolean;
  target_duration_min?: { label: string; unit: string; placeholder: string };
  description_label?: string;
}

// ─── Sport categories ────────────────────────────────────────────────────────

const SPORT_CATEGORIES = [
  { id: "pedestrian", label: "Sports pédestres", keywords: ["run", "trail", "walk", "hike", "race", "stroller", "jog"] },
  { id: "cycling", label: "Sports cyclistes", keywords: ["cycl", "bike", "ride", "velo", "bmx", "mtb", "gravel", "spin"] },
  { id: "nautical", label: "Sports nautiques", keywords: ["swim", "paddle", "surf", "row", "canoe", "kayak", "sail", "div", "kite", "wake", "boat", "water", "windsurf"] },
  { id: "winter", label: "Sports d'hiver", keywords: ["ski", "snow", "ice", "patin", "biathlon", "sled"] },
  { id: "gym", label: "Salle & Fitness", keywords: ["gym", "yoga", "pilates", "fitness", "training", "strength", "lift", "hiit", "barre", "body", "crossfit", "weight", "solidcore", "reformer"] },
  { id: "ball", label: "Sports collectifs & raquette", keywords: ["ball", "tennis", "golf", "basket", "soccer", "football", "volley", "rugby", "hand", "hockey", "lacrosse", "badminton", "cricket", "baseball", "softball", "pickle", "padel", "squash", "racquet", "table", "futsal", "netball", "polo", "ultimate", "gaelic", "water polo"] },
  { id: "lifestyle", label: "Lifestyle & activités diverses", keywords: ["yard", "commut", "parent", "baby", "gardening", "operations", "coaching", "manual", "work", "gaming", "driving", "musical", "circus", "clean", "public", "watch", "bartend", "chess", "dedicated", "cadd", "drawing"] },
  { id: "other", label: "Autres sports", keywords: [] },
] as const;

type SportCategoryId = (typeof SPORT_CATEGORIES)[number]["id"];

interface SportSelection {
  id: string;
  name: string;
  name_fr: string;
  icon: string;
  selected: boolean;
  level: string;
  category: SportCategoryId;
  color?: string;
}


const DEFAULT_MVP_SPORTS: SportSelection[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "running", name_fr: "Course à pied", icon: "running", selected: false, level: "intermediate", category: "pedestrian" },
  { id: "00000000-0000-0000-0000-000000000002", name: "cycling", name_fr: "Vélo", icon: "bike", selected: false, level: "intermediate", category: "cycling" },
  { id: "00000000-0000-0000-0000-000000000011", name: "mountain-biking", name_fr: "VTT", icon: "mountain", selected: false, level: "intermediate", category: "cycling" },
  { id: "00000000-0000-0000-0000-000000000007", name: "walking", name_fr: "Marche", icon: "footprints", selected: false, level: "intermediate", category: "pedestrian" },
  { id: "00000000-0000-0000-0000-000000000008", name: "hiking", name_fr: "Randonnée", icon: "mountain", selected: false, level: "intermediate", category: "pedestrian" },
  { id: "00000000-0000-0000-0000-000000000009", name: "alpine-skiing", name_fr: "Ski alpin", icon: "mountain-snow", selected: false, level: "intermediate", category: "winter" },
  { id: "00000000-0000-0000-0000-000000000010", name: "cross-country-skiing", name_fr: "Ski de fond", icon: "wind", selected: false, level: "intermediate", category: "winter" },
  { id: "00000000-0000-0000-0000-000000000005", name: "strength", name_fr: "Musculation", icon: "dumbbell", selected: false, level: "intermediate", category: "gym" },
  { id: "00000000-0000-0000-0000-000000000006", name: "other", name_fr: "Autre", icon: "activity", selected: false, level: "intermediate", category: "other" },
];

const SPORT_LEVELS = [
  { value: "discovery", label: "Découverte" },
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
  { value: "elite", label: "Élite" },
];

// ─── Physio limits ───────────────────────────────────────────────────────────

const PHYSIO_LIMITS: Record<string, { min: number; max: number }> = {
  weight_kg: { min: 30, max: 150 },
  height_cm: { min: 140, max: 220 },
  hr_max: { min: 100, max: 220 },
  lthr: { min: 100, max: 200 },
  vma_kmh: { min: 8, max: 30 },
  ftp_watts: { min: 50, max: 500 },
};

// ─── Objectives data ─────────────────────────────────────────────────────────

const COMPETITION_OBJECTIVES: Record<string, string[]> = {
  running: ["5 km", "10 km", "Semi-marathon", "Marathon", "Ultra-trail / Trail"],
  cycling: ["Cyclosportive", "Gran Fondo", "Gravel event", "Course sur route"],
  "mountain-biking": ["Enduro", "XCO (cross-country olympique)", "Marathon VTT", "Descente VTT"],
  walking: ["Marche nordique compétition", "Marche athlétique", "Randonnée sportive chronométrée"],
  hiking: ["Raid", "Trek multi-jours", "Haute randonnée", "Skyrace / Ultra-trail rando"],
  "alpine-skiing": ["Descente chronométrée", "Compétition de ski alpin"],
  "cross-country-skiing": ["Skiathlon", "Marathon nordique (ex : Vasaloppet)", "Course de ski de fond"],
  strength: ["Compétition de powerlifting", "Haltérophilie", "Compétition de force athlétique"],
};

const PERFORMANCE_OBJECTIVES: Record<string, string[]> = {
  running: ["Courir X km sans m'arrêter", "Terminer mon premier 5 / 10 km", "Améliorer mon allure sur X km", "Courir régulièrement X fois/semaine"],
  cycling: ["Faire X km d'une traite", "Gravir un col / dénivelé cible", "Améliorer mon FTP", "Rouler en extérieur pour la 1ère fois"],
  "mountain-biking": ["Rouler ma première sortie technique", "Enchaîner X km de single track", "Descendre une piste noire / rouge", "Améliorer ma technique en descente"],
  walking: ["Marcher X km d'une traite", "Marcher X fois par semaine", "Améliorer mon endurance à la marche"],
  hiking: ["Réaliser une randonnée de X km / X m de D+", "Porter un sac autonome sur plusieurs jours", "Faire ma première haute randonnée"],
  "alpine-skiing": ["Passer sur des pistes noires", "Skier hors-piste pour la 1ère fois", "Améliorer ma technique de virage"],
  "cross-country-skiing": ["Faire une sortie de X km", "Maîtriser la technique skating", "Maîtriser la technique classique"],
  strength: ["Faire X pompes / tractions d'affilée", "Soulever X kg au développé couché / squat / soulevé de terre", "Tenir une planche X secondes"],
};

const WELLNESS_OBJECTIVES = [
  "Être plus actif au quotidien",
  "Améliorer mon endurance générale",
  "Réduire la sédentarité",
  "Prendre de la masse musculaire",
  "Améliorer mon ratio force/poids",
  "Améliorer ma souplesse et mobilité",
  "Prévenir les blessures par le renforcement",
  "Reprendre le sport après une longue pause",
];

const MEDICAL_KEYWORDS = [
  "poids", "mincir", "régime", "stress", "anxiété", "dépression",
  "sommeil", "insomnie", "blessure en cours", "rééducation",
  "grossesse", "diabète", "hypertension", "complément",
];

const isMedical = (text: string) =>
  MEDICAL_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));

// ─── Objective adaptive field schemas ────────────────────────────────────────

const D = { target_distance_km: {} } satisfies Partial<ObjectiveFieldSchema>;
const DE = { target_distance_km: {}, target_elevation_m: true } satisfies Partial<ObjectiveFieldSchema>;
const DET = { target_distance_km: {}, target_elevation_m: true, target_time: true } satisfies Partial<ObjectiveFieldSchema>;
const T = { target_time: true } satisfies Partial<ObjectiveFieldSchema>;

const OBJECTIVE_FIELD_MAP: Record<string, ObjectiveFieldSchema> = {
  // ── Competition ─────────────────────────────────────────────────────────────
  "5 km":                                      { event_name: true, ...T },
  "10 km":                                     { event_name: true, ...T },
  "Semi-marathon":                             { event_name: true, ...T },
  "Marathon":                                  { event_name: true, ...T },
  "Ultra-trail / Trail":                       { event_name: true, ...DET },
  "Cyclosportive":                             { event_name: true, ...DET },
  "Gran Fondo":                                { event_name: true, ...DET },
  "Gravel event":                              { event_name: true, ...DE },
  "Course sur route":                          { event_name: true, ...T, target_distance_km: {} },
  "Enduro":                                    { event_name: true },
  "XCO (cross-country olympique)":             { event_name: true, target_distance_km: {} },
  "Marathon VTT":                              { event_name: true, ...DE },
  "Descente VTT":                              { event_name: true },
  "Marche nordique compétition":               { event_name: true, ...DE },
  "Marche athlétique":                         { event_name: true, ...D },
  "Randonnée sportive chronométrée":           { event_name: true, ...DE },
  "Raid":                                      { event_name: true, ...DE, target_count: { label: "Durée", unit: "jours", placeholder: "3" } },
  "Trek multi-jours":                          { event_name: true, ...DE, target_count: { label: "Durée", unit: "jours", placeholder: "5" } },
  "Haute randonnée":                           { event_name: true, ...DE },
  "Skyrace / Ultra-trail rando":               { event_name: true, ...DE },
  "Descente chronométrée":                     { event_name: true },
  "Compétition de ski alpin":                  { event_name: true },
  "Skiathlon":                                 { event_name: true, ...DE },
  "Marathon nordique (ex : Vasaloppet)":       { event_name: true, ...DET },
  "Course de ski de fond":                     { event_name: true, ...DE },
  "Compétition de powerlifting":               { event_name: true, target_weight_kg: {} },
  "Haltérophilie":                             { event_name: true, target_weight_kg: {} },
  "Compétition de force athlétique":           { event_name: true, target_weight_kg: { label: "Catégorie de poids (kg)" } },
  // ── Performance ─────────────────────────────────────────────────────────────
  "Courir X km sans m'arrêter":               { target_distance_km: { required: true } },
  "Terminer mon premier 5 / 10 km":            { target_distance_km: {} },
  "Améliorer mon allure sur X km":             { target_distance_km: {}, target_pace: true },
  "Courir régulièrement X fois/semaine":       { target_count: { label: "Séances par semaine", unit: "/semaine", placeholder: "3", required: true }, target_duration_min: { label: "Durée min par séance", unit: "min", placeholder: "30" } },
  "Faire X km d'une traite":                   { target_distance_km: { required: true }, target_elevation_m: true },
  "Gravir un col / dénivelé cible":            { target_elevation_m: true, description_label: "Nom du col ou parcours (optionnel)" },
  "Améliorer mon FTP":                         { target_power_watts: true },
  "Rouler en extérieur pour la 1ère fois":     {},
  "Rouler ma première sortie technique":       {},
  "Enchaîner X km de single track":           { target_distance_km: { required: true }, target_elevation_m: true },
  "Descendre une piste noire / rouge":         {},
  "Améliorer ma technique en descente":        {},
  "Marcher X km d'une traite":                { target_distance_km: { required: true }, target_elevation_m: true },
  "Marcher X fois par semaine":               { target_count: { label: "Sorties par semaine", unit: "/semaine", placeholder: "3", required: true }, target_duration_min: { label: "Durée par sortie", unit: "min", placeholder: "45" } },
  "Améliorer mon endurance à la marche":      {},
  "Réaliser une randonnée de X km / X m de D+": { target_distance_km: {}, target_elevation_m: true },
  "Porter un sac autonome sur plusieurs jours": { target_count: { label: "Durée", unit: "jours", placeholder: "3", required: true }, target_weight_kg: { label: "Poids du sac (kg)" } },
  "Faire ma première haute randonnée":        {},
  "Passer sur des pistes noires":             {},
  "Skier hors-piste pour la 1ère fois":       {},
  "Améliorer ma technique de virage":         {},
  "Faire une sortie de X km":                 { target_distance_km: { required: true }, target_elevation_m: true },
  "Maîtriser la technique skating":           {},
  "Maîtriser la technique classique":         {},
  "Faire X pompes / tractions d'affilée":     { target_count: { label: "Nombre de répétitions", unit: "reps", placeholder: "20", required: true }, description_label: "Exercice ciblé (pompes, tractions...)" },
  "Soulever X kg au développé couché / squat / soulevé de terre": { target_weight_kg: { required: true }, description_label: "Exercice ciblé (ex : squat)" },
  "Tenir une planche X secondes":             { target_count: { label: "Durée", unit: "secondes", placeholder: "60", required: true } },
};

function getFieldSchema(family: ObjectiveFamily, name: string): ObjectiveFieldSchema {
  if (family === "wellness") return {};
  if (name === "other") {
    return family === "competition"
      ? { event_name: true, target_distance_km: {}, target_elevation_m: true, target_time: true }
      : {};
  }
  return OBJECTIVE_FIELD_MAP[name] ?? {};
}

// ─── Availability defaults ────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<DayKey, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
  thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
};

const defaultDays = Object.fromEntries(
  DAY_KEYS.map((d) => [d, { enabled: false, slots: [] as DaySlot[] }])
) as unknown as Record<DayKey, DayAvailability>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseThresholdPace(value: string): number | null {
  const parts = value.split(":");
  if (parts.length === 2) {
    const min = parseInt(parts[0]);
    const sec = parseInt(parts[1]);
    if (!isNaN(min) && !isNaN(sec)) return min + sec / 60;
  }
  return parseFloat(value) || null;
}

const priorityBadgeVariant = { A: "error", B: "warning", C: "default" } as const;
const priorityLabel: Record<ObjectivePriority, string> = { A: "Haute", B: "Moyenne", C: "Basse" };
const familyLabel: Record<ObjectiveFamily, string> = {
  competition: "Compétition",
  performance: "Performance",
  wellness: "Forme & Bien-être",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});

  // Step 1
  const [profile, setProfile] = useState<ProfileData>({ gender: "", birth_date: "", weight_kg: "", height_cm: "" });

  // Step 2
  const [cardio, setCardio] = useState<CardioData>({ hr_max: "", lthr: "" });

  // Step 3
  const [sports, setSports] = useState<SportSelection[]>(DEFAULT_MVP_SPORTS);
  const [selectedCategory, setSelectedCategory] = useState<SportCategoryId>("pedestrian");

  // Step 4
  const [thresholds, setThresholds] = useState<ThresholdData>({ vma_kmh: "", threshold_pace_per_km: "", ftp_watts: "" });

  // Step 5
  const [availability, setAvailability] = useState<AvailabilityData>({
    target_hours: 8,
    training_goal: "",
    days: defaultDays,
  });

  // Step 6
  const [objectives, setObjectives] = useState<ObjectiveItem[]>([]);
  const [showObjectiveModal, setShowObjectiveModal] = useState(false);
  const [modalStep, setModalStep] = useState<"family" | "details">("family");
  const [currentObjective, setCurrentObjective] = useState<Partial<ObjectiveItem>>({});
  const [otherObjectiveName, setOtherObjectiveName] = useState("");
  const [analysisAlerts, setAnalysisAlerts] = useState<{ level: string; message: string }[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ─── Auth check ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push("/login?error=session_expired");
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load sports ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSports = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: dbError } = await (supabase as any).from("sports").select("*").order("name");
        if (dbError || !data) return;

        // Merge DB data into DEFAULT_MVP_SPORTS — all 8 MVP sports always shown,
        // but DB UUIDs replace placeholder IDs when the sport exists in DB
        const merged = DEFAULT_MVP_SPORTS.map((defaultSport) => {
          const dbSport = data.find(
            (s: { name: string }) => s.name === defaultSport.name
          );
          if (dbSport) {
            return {
              ...defaultSport,
              id: dbSport.id,
              name_fr: dbSport.name_fr || defaultSport.name_fr,
              icon: dbSport.icon || defaultSport.icon,
              color: dbSport.color ?? defaultSport.color,
            };
          }
          return defaultSport;
        });
        setSports(merged);
      } catch {
        // Keep defaults
      }
    };
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const selectedSports = sports.filter((s) => s.selected);
  const hasRunning = selectedSports.some((s) => s.name === "running");
  const hasCycling = selectedSports.some((s) => s.name === "cycling");
  const hasMTB = selectedSports.some((s) => s.name === "mountain-biking");
  const totalSteps = hasRunning || hasCycling || hasMTB ? 6 : 5;

  const categoriesWithSports = useMemo(() => {
    return SPORT_CATEGORIES.map((category) => ({
      ...category,
      count: sports.filter((sport) => sport.category === category.id).length,
    })).filter((category) => category.count > 0);
  }, [sports]);

  useEffect(() => {
    if (categoriesWithSports.length > 0 && !categoriesWithSports.some((cat) => cat.id === selectedCategory)) {
      setSelectedCategory(categoriesWithSports[0].id);
    }
  }, [categoriesWithSports, selectedCategory]);

  const filteredSports = useMemo(
    () => sports.filter((sport) => sport.category === selectedCategory),
    [sports, selectedCategory]
  );

  // ─── Objective lists ─────────────────────────────────────────────────────────

  const getObjectiveList = (family: ObjectiveFamily): string[] => {
    if (family === "wellness") return WELLNESS_OBJECTIVES;
    const map = family === "competition" ? COMPETITION_OBJECTIVES : PERFORMANCE_OBJECTIVES;
    const result: string[] = [];
    for (const sport of selectedSports) {
      if (map[sport.name]) result.push(...map[sport.name]);
    }
    return Array.from(new Set(result));
  };

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const getVisualStep = () => {
    if (!hasRunning && !hasCycling && !hasMTB && currentStep >= 5) return currentStep - 1;
    return currentStep;
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 3 && !hasRunning && !hasCycling && !hasMTB) {
      setCurrentStep(5);
    } else if (currentStep < 6) {
      setCurrentStep((currentStep + 1) as OnboardingStep);
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep === 5 && !hasRunning && !hasCycling && !hasMTB) {
      setCurrentStep(3);
    } else if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as OnboardingStep);
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: return true;
      case 2: return true;
      case 3: return selectedSports.length > 0;
      case 4: return true;
      case 5: return availability.target_hours > 0 && availability.training_goal !== "";
      case 6: return objectives.length > 0;
      default: return false;
    }
  };

  // ─── Warning validation ──────────────────────────────────────────────────────

  const checkWarning = (field: string, value: string) => {
    const limits = PHYSIO_LIMITS[field];
    if (!limits || !value) {
      setWarnings((w) => ({ ...w, [field]: false }));
      return;
    }
    const num = parseFloat(value);
    setWarnings((w) => ({ ...w, [field]: !isNaN(num) && (num < limits.min || num > limits.max) }));
  };

  // ─── Sports handlers ─────────────────────────────────────────────────────────

  const toggleSport = (sportId: string) => {
    setSports(sports.map((s) => (s.id === sportId ? { ...s, selected: !s.selected } : s)));
  };

  const updateSportLevel = (sportId: string, level: string) => {
    setSports(sports.map((s) => (s.id === sportId ? { ...s, level } : s)));
  };

  // ─── Availability handlers ────────────────────────────────────────────────────

  const toggleDay = (day: DayKey) => {
    setAvailability((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: { ...prev.days[day], enabled: !prev.days[day].enabled } },
    }));
  };

  const addSlot = (day: DayKey) => {
    setAvailability((prev) => ({
      ...prev,
      days: {
        ...prev.days,
        [day]: { ...prev.days[day], slots: [...prev.days[day].slots, { start: "07:00", end: "08:00" }] },
      },
    }));
  };

  const updateSlot = (day: DayKey, index: number, field: "start" | "end", value: string) => {
    setAvailability((prev) => {
      const slots = [...prev.days[day].slots];
      slots[index] = { ...slots[index], [field]: value };
      return { ...prev, days: { ...prev.days, [day]: { ...prev.days[day], slots } } };
    });
  };

  const removeSlot = (day: DayKey, index: number) => {
    setAvailability((prev) => {
      const slots = prev.days[day].slots.filter((_, i) => i !== index);
      return { ...prev, days: { ...prev.days, [day]: { ...prev.days[day], slots } } };
    });
  };

  // ─── Objective handlers ──────────────────────────────────────────────────────

  const openObjectiveModal = () => {
    setCurrentObjective({ priority: "B" });
    setOtherObjectiveName("");
    setModalStep("family");
    setShowObjectiveModal(true);
  };

  const closeObjectiveModal = () => {
    setShowObjectiveModal(false);
    setCurrentObjective({});
    setOtherObjectiveName("");
  };

  const addObjective = () => {
    const name = currentObjective.name === "other" ? otherObjectiveName : currentObjective.name;
    if (!name || !currentObjective.family || !currentObjective.priority) return;
    if (currentObjective.family === "competition" && !currentObjective.event_date) return;

    const newObj: ObjectiveItem = {
      tempId: crypto.randomUUID(),
      family: currentObjective.family,
      name,
      description: currentObjective.description || "",
      priority: currentObjective.priority,
      event_date: currentObjective.event_date,
      target_date: currentObjective.target_date,
      target_time: currentObjective.target_time,
      event_name: currentObjective.event_name,
      target_distance_km: currentObjective.target_distance_km,
      target_elevation_m: currentObjective.target_elevation_m,
      target_count: currentObjective.target_count,
      target_count_unit: currentObjective.target_count_unit,
      target_weight_kg: currentObjective.target_weight_kg,
      target_pace: currentObjective.target_pace,
      target_power_watts: currentObjective.target_power_watts,
      target_duration_min: currentObjective.target_duration_min,
    };
    setObjectives((prev) => [...prev, newObj]);
    closeObjectiveModal();
  };

  const removeObjective = (tempId: string) => {
    setObjectives((prev) => prev.filter((o) => o.tempId !== tempId));
  };

  // ─── Terminate & analysis ─────────────────────────────────────────────────────

  const handleTerminate = async () => {
    if (objectives.length === 0) {
      setError("Ajoutez au moins un objectif pour continuer.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/objectives/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectives,
          target_hours: availability.target_hours,
          sports: selectedSports.map((s) => s.name),
        }),
      });
      if (!res.ok) throw new Error(`analyze ${res.status}`);
      const data = await res.json();
      if (data.alerts?.length > 0) {
        setAnalysisAlerts(data.alerts);
        setShowAlerts(true);
      } else {
        setShowSuccess(true);
      }
    } catch (err) {
      console.error("Objectives analysis error:", err);
      setError("L'analyse de vos objectifs a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── Save & complete ─────────────────────────────────────────────────────────

  const handleComplete = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié. Veuillez vous reconnecter.");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // 1. Upsert users (gender)
      await db.from("users").upsert(
        { id: user.id, email: user.email, gender: profile.gender || null },
        { onConflict: "id" }
      );

      // 2. Upsert physiological_data
      await db.from("physiological_data").upsert(
        {
          user_id: user.id,
          weight_kg: profile.weight_kg ? parseFloat(profile.weight_kg) : null,
          height_cm: profile.height_cm ? parseInt(profile.height_cm) : null,
          birth_date: profile.birth_date || null,
          hr_max: cardio.hr_max ? parseInt(cardio.hr_max) : null,
          lthr: cardio.lthr ? parseInt(cardio.lthr) : null,
        },
        { onConflict: "user_id" }
      );

      // 3. Update users: training_availability + training_goal
      await db.from("users").update({
        training_availability: availability.days as unknown as Json,
        training_goal: availability.training_goal || null,
      }).eq("id", user.id);

      // 4. Upsert user_sports
      for (const sport of selectedSports) {
        await db.from("user_sports").upsert(
          {
            user_id: user.id,
            sport_id: sport.id,
            level: sport.level,
            vma_kmh: sport.name === "running" && thresholds.vma_kmh ? parseFloat(thresholds.vma_kmh) : null,
            threshold_pace_per_km: sport.name === "running" && thresholds.threshold_pace_per_km
              ? parseThresholdPace(thresholds.threshold_pace_per_km)
              : null,
            ftp_watts: (sport.name === "cycling" || sport.name === "mountain-biking") && thresholds.ftp_watts ? parseInt(thresholds.ftp_watts) : null,
            target_hours_per_week: availability.target_hours,
          },
          { onConflict: "user_id,sport_id" }
        );
      }

      // 5. Insert objectives
      for (const obj of objectives) {
        const meta: Record<string, string | number> = {};
        if (obj.event_name)         meta.event_name = obj.event_name;
        if (obj.target_distance_km) meta.target_distance_km = parseFloat(obj.target_distance_km);
        if (obj.target_elevation_m) meta.target_elevation_m = parseInt(obj.target_elevation_m);
        if (obj.target_count)       meta.target_count = parseInt(obj.target_count);
        if (obj.target_count_unit)  meta.target_count_unit = obj.target_count_unit;
        if (obj.target_weight_kg)   meta.target_weight_kg = parseFloat(obj.target_weight_kg);
        if (obj.target_pace)        meta.target_pace = obj.target_pace;
        if (obj.target_power_watts) meta.target_power_watts = parseInt(obj.target_power_watts);
        if (obj.target_duration_min) meta.target_duration_min = parseInt(obj.target_duration_min);

        await db.from("objectives").insert({
          user_id: user.id,
          name: obj.name,
          family: obj.family,
          status: "active",
          priority: obj.priority,
          event_date: obj.event_date || null,
          target_date: obj.target_date || null,
          event_type: obj.family === "competition" ? obj.name : null,
          target_time: obj.target_time || null,
          notes: obj.description || null,
          metadata: Object.keys(meta).length > 0 ? meta : null,
        });
      }

      // 6. Mark onboarding complete
      await db.from("users").update({ onboarding_completed: true }).eq("id", user.id);

      router.push("/dashboard?welcome=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark py-8 px-4">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-8 w-8 text-accent" />
            <span className="text-xl font-bold">ChatYourTraining</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Configuration de votre profil</h1>
          <p className="text-muted">Étape {getVisualStep()} sur {totalSteps}</p>
        </div>

        {/* Progress */}
        <Progress value={getVisualStep()} max={totalSteps} className="mb-4" />

        {/* Step content */}
        <Card className="mb-4">

          {/* ── Step 1: Profil de base ─────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Activity className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Profil de base</h2>
                  <p className="text-sm text-muted">Quelques données pour personnaliser votre expérience</p>
                </div>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium mb-2">Genre</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["male", "female", ""] as const).map((g) => {
                    const labels = { male: "Homme", female: "Femme", "": "Non précisé" };
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setProfile({ ...profile, gender: g })}
                        className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          profile.gender === g
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-dark-200 bg-dark-100 text-muted hover:border-dark-300"
                        }`}
                      >
                        {labels[g]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Birth date */}
              <Input
                label="Date de naissance"
                type="date"
                value={profile.birth_date}
                onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })}
              />

              {/* Weight + Height */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Poids (kg)"
                    type="number"
                    placeholder="70"
                    value={profile.weight_kg}
                    onChange={(e) => setProfile({ ...profile, weight_kg: e.target.value })}
                    onBlur={() => checkWarning("weight_kg", profile.weight_kg)}
                  />
                  {warnings.weight_kg && (
                    <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                  )}
                </div>
                <div>
                  <Input
                    label="Taille (cm)"
                    type="number"
                    placeholder="175"
                    value={profile.height_cm}
                    onChange={(e) => setProfile({ ...profile, height_cm: e.target.value })}
                    onBlur={() => checkWarning("height_cm", profile.height_cm)}
                  />
                  {warnings.height_cm && (
                    <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Données cardiaques ─────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Heart className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Données cardiaques</h2>
                  <p className="text-sm text-muted">Pour calibrer vos zones d&apos;entraînement</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label="FC max (bpm)"
                    type="number"
                    placeholder="185"
                    hint="Fréquence cardiaque maximale"
                    value={cardio.hr_max}
                    onChange={(e) => setCardio({ ...cardio, hr_max: e.target.value })}
                    onBlur={() => checkWarning("hr_max", cardio.hr_max)}
                  />
                  {warnings.hr_max && (
                    <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                  )}
                </div>
                <div>
                  <Input
                    label="LTHR (bpm)"
                    type="number"
                    placeholder="162"
                    hint="Fréquence au seuil lactique"
                    value={cardio.lthr}
                    onChange={(e) => setCardio({ ...cardio, lthr: e.target.value })}
                    onBlur={() => checkWarning("lthr", cardio.lthr)}
                  />
                  {warnings.lthr && (
                    <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-accent/10 rounded-xl text-sm text-muted">
                Vous ne connaissez pas ces valeurs ? Pas de problème — votre coach IA pourra vous proposer un test adapté pour les déterminer.
              </div>
            </div>
          )}

          {/* ── Step 3: Sports pratiqués ───────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="flex flex-col h-[calc(100vh-240px)] min-h-[400px]">
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Activity className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Sports pratiqués</h2>
                  <p className="text-sm text-muted">Sélectionnez vos disciplines</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row flex-1 gap-4 overflow-hidden">
                {/* Categories sidebar */}
                <div className="w-full md:w-48 shrink-0 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:pr-4 snap-x">
                  {SPORT_CATEGORIES.map((category) => {
                    const count = sports.filter((s) => s.category === category.id).length;
                    if (count === 0 && category.id !== "other") return null;
                    const isSelected = selectedCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`shrink-0 w-auto md:w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between group snap-start whitespace-nowrap md:whitespace-normal ${
                          isSelected
                            ? "bg-accent text-dark font-medium shadow-lg shadow-accent/20"
                            : "bg-white/5 md:bg-transparent hover:bg-white/10 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-sm leading-tight block">{category.label}</span>
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-dark/30 hidden md:block shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Sports list */}
                <div className="flex-1 overflow-y-auto pb-2 min-h-0 pr-1">
                  <div className="grid grid-cols-1 gap-3">
                    {filteredSports.map((sport) => {
                      const IconComponent = getSportIconComponent(sport.icon);
                      return (
                        <div
                          key={sport.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleSport(sport.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSport(sport.id);
                            }
                          }}
                          className={`w-full p-4 rounded-xl border-2 cursor-pointer transition-all text-left ${
                            sport.selected ? "border-accent bg-accent/10" : "border-dark-200 hover:border-dark-300 bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-2.5 rounded-lg shrink-0 ${sport.selected ? "" : "bg-dark-100 text-muted-foreground"}`}
                                style={
                                  sport.selected
                                    ? sport.color
                                      ? { backgroundColor: `${sport.color}20`, color: sport.color }
                                      : { backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e" }
                                    : {}
                                }
                              >
                                <IconComponent className="h-5 w-5" />
                              </div>
                              <span className="font-medium">{sport.name_fr}</span>
                            </div>
                            {sport.selected && (
                              <div
                                className="h-5 w-5 rounded-full flex items-center justify-center shadow-sm shrink-0"
                                style={{ backgroundColor: sport.color || "#22c55e" }}
                              >
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>

                          {sport.selected && sport.name !== "other" && (
                            <div
                              className="mt-3 pt-3 border-t border-dark-200/50 animate-in fade-in slide-in-from-top-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="text-xs text-muted-foreground mb-1.5 block">Niveau</label>
                              <Select
                                options={SPORT_LEVELS}
                                value={sport.level}
                                onChange={(value) => updateSportLevel(sport.id, value)}
                                className="h-11 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {filteredSports.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center opacity-60">
                      <Trophy className="h-12 w-12 mb-3 stroke-1" />
                      <p>Aucun sport trouvé dans cette catégorie</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedSports.length === 0 && (
                <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center justify-center gap-2 text-yellow-500 text-sm animate-pulse shrink-0">
                  <Activity className="h-4 w-4" />
                  <span>Sélectionnez au moins un sport</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Seuils de performance ─────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Target className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Seuils de performance</h2>
                  <p className="text-sm text-muted">Pour des calculs de charge précis</p>
                </div>
              </div>

              {hasRunning && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted uppercase tracking-wide">Course à pied</p>
                  <div>
                    <Input
                      label="VMA (km/h)"
                      type="number"
                      step={0.1}
                      placeholder="16.5"
                      hint="Vitesse Maximale Aérobie — test sur piste recommandé"
                      value={thresholds.vma_kmh}
                      onChange={(e) => setThresholds({ ...thresholds, vma_kmh: e.target.value })}
                      onBlur={() => checkWarning("vma_kmh", thresholds.vma_kmh)}
                    />
                    {warnings.vma_kmh && (
                      <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                    )}
                  </div>
                  <Input
                    label="Allure seuil (min/km)"
                    type="text"
                    placeholder="5:00"
                    hint="Ex : 5:00 pour 5 minutes par km"
                    value={thresholds.threshold_pace_per_km}
                    onChange={(e) => setThresholds({ ...thresholds, threshold_pace_per_km: e.target.value })}
                  />
                </div>
              )}

              {(hasCycling || hasMTB) && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted uppercase tracking-wide">
                    {hasCycling && hasMTB ? "Vélo & VTT" : hasCycling ? "Vélo" : "VTT"}
                  </p>
                  <div>
                    <Input
                      label="FTP (watts)"
                      type="number"
                      placeholder="250"
                      hint={hasMTB && !hasCycling ? "Utile uniquement si vous avez un capteur de puissance" : "Functional Threshold Power — test 20 min recommandé"}
                      value={thresholds.ftp_watts}
                      onChange={(e) => setThresholds({ ...thresholds, ftp_watts: e.target.value })}
                      onBlur={() => checkWarning("ftp_watts", thresholds.ftp_watts)}
                    />
                    {warnings.ftp_watts && (
                      <p className="text-warning text-xs mt-1">Valeur inhabituelle — êtes-vous sûr ?</p>
                    )}
                  </div>
                </div>
              )}

              <div className="p-3 bg-accent/10 rounded-xl text-sm text-muted">
                Vous ne connaissez pas ces valeurs ? Pas de problème — vous pourrez les renseigner plus tard ou demander à votre coach IA de vous proposer un test adapté.
              </div>
            </div>
          )}

          {/* ── Step 5: Disponibilité & volume ───────────────────────────────── */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Clock className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Disponibilité & volume</h2>
                  <p className="text-sm text-muted">Pour planifier vos entraînements</p>
                </div>
              </div>

              {/* Volume slider */}
              <Slider
                label="Volume cible par semaine"
                min={1}
                max={25}
                value={availability.target_hours}
                onChange={(e) => setAvailability({ ...availability, target_hours: parseInt(e.target.value) })}
                valueFormatter={(v) => `${v}h`}
              />
              <div className="flex gap-2 flex-wrap">
                {[4, 6, 8, 10, 12, 15].map((h) => (
                  <Badge
                    key={h}
                    variant={availability.target_hours === h ? "success" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setAvailability({ ...availability, target_hours: h })}
                  >
                    {h}h/sem
                  </Badge>
                ))}
              </div>

              {/* Training goal */}
              <Select
                label="Objectif global"
                placeholder="Choisissez votre objectif..."
                options={[
                  { value: "performance", label: "Performance — Progresser et compétiter" },
                  { value: "health", label: "Santé & Loisir — Rester actif et en forme" },
                  { value: "leisure", label: "Loisir — Pratiquer pour le plaisir" },
                ]}
                value={availability.training_goal}
                onChange={(v) => setAvailability({ ...availability, training_goal: v as AvailabilityData["training_goal"] })}
              />

              {/* Days availability */}
              <div>
                <p className="text-sm font-medium mb-3">Jours & créneaux disponibles <span className="text-muted font-normal">(optionnel)</span></p>
                <div className="space-y-3">
                  {DAY_KEYS.map((day) => {
                    const dayData = availability.days[day];
                    return (
                      <div key={day} className="rounded-xl border border-dark-200 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                          <Toggle
                            checked={dayData.enabled}
                            onChange={() => toggleDay(day)}
                          />
                        </div>

                        {dayData.enabled && (
                          <div className="mt-3 space-y-2">
                            {dayData.slots.map((slot, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs text-muted w-6 shrink-0">De</span>
                                <input
                                  type="time"
                                  value={slot.start}
                                  onChange={(e) => updateSlot(day, idx, "start", e.target.value)}
                                  className="bg-dark-100 border border-dark-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                                />
                                <span className="text-xs text-muted">à</span>
                                <input
                                  type="time"
                                  value={slot.end}
                                  onChange={(e) => updateSlot(day, idx, "end", e.target.value)}
                                  className="bg-dark-100 border border-dark-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeSlot(day, idx)}
                                  className="p-1.5 text-muted hover:text-error transition-colors rounded-lg hover:bg-error/10"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addSlot(day)}
                              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors mt-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Ajouter un créneau
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted mt-2">
                  Indiquez vos créneaux habituels — votre coach s&apos;en servira pour planifier vos séances.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 6: Objectifs ─────────────────────────────────────────────── */}
          {currentStep === 6 && !showAlerts && !showSuccess && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Zap className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Vos objectifs</h2>
                  <p className="text-sm text-muted">Au moins un objectif pour guider votre coach</p>
                </div>
              </div>

              {/* Objectives list */}
              {objectives.length > 0 && (
                <div className="space-y-2">
                  {objectives.map((obj) => (
                    <div key={obj.tempId} className="flex items-start gap-3 p-3 rounded-xl border border-dark-200 bg-dark-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{obj.name}</span>
                          <Badge variant={priorityBadgeVariant[obj.priority]} size="sm">
                            {priorityLabel[obj.priority]}
                          </Badge>
                          <Badge variant="outline" size="sm">{familyLabel[obj.family]}</Badge>
                        </div>
                        {obj.description && <p className="text-xs text-muted mt-0.5 truncate">{obj.description}</p>}
                        {(obj.event_date || obj.target_date) && (
                          <p className="text-xs text-muted mt-0.5">
                            {obj.event_date ? `Événement : ${obj.event_date}` : `Avant le : ${obj.target_date}`}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeObjective(obj.tempId)}
                        className="p-1.5 text-muted hover:text-error transition-colors rounded-lg hover:bg-error/10 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button variant="outline" onClick={openObjectiveModal} leftIcon={<Plus className="h-4 w-4" />} className="w-full">
                Ajouter un objectif
              </Button>

              {objectives.length === 0 && (
                <p className="text-xs text-muted text-center">
                  Définissez au moins un objectif pour que votre coach puisse personnaliser votre entraînement.
                </p>
              )}
            </div>
          )}

          {/* ── Alerts screen ─────────────────────────────────────────────────── */}
          {currentStep === 6 && showSuccess && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-success/20 rounded-xl">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Objectifs validés</h2>
                  <p className="text-sm text-muted">Votre coach n&apos;a détecté aucun conflit dans votre planification</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-success/10 border-success/30 flex gap-3">
                <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <p className="text-sm">
                  Vos objectifs sont cohérents entre eux et compatibles avec votre volume d&apos;entraînement cible. Votre coach IA est prêt à construire votre programme.
                </p>
              </div>

              <Button onClick={handleComplete} isLoading={isLoading} rightIcon={<ArrowRight className="h-4 w-4" />} className="w-full mt-4">
                Lancer mon coaching
              </Button>
            </div>
          )}

          {currentStep === 6 && showAlerts && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-warning/20 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Analyse de vos objectifs</h2>
                  <p className="text-sm text-muted">Votre coach a détecté des points d&apos;attention</p>
                </div>
              </div>

              <div className="space-y-3">
                {analysisAlerts.map((alert, i) => {
                  const isError = alert.level === "critical";
                  const isWarning = alert.level === "warning";
                  return (
                    <div
                      key={i}
                      className={`flex gap-3 p-4 rounded-xl border ${
                        isError
                          ? "bg-error/10 border-error/30"
                          : isWarning
                          ? "bg-warning/10 border-warning/30"
                          : "bg-accent/10 border-accent/30"
                      }`}
                    >
                      {isError ? (
                        <AlertTriangle className="h-5 w-5 text-error shrink-0 mt-0.5" />
                      ) : isWarning ? (
                        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm">{alert.message}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => setShowAlerts(false)} leftIcon={<ArrowLeft className="h-4 w-4" />} className="flex-1">
                  Modifier mes objectifs
                </Button>
                <Button onClick={handleComplete} isLoading={isLoading} rightIcon={<Check className="h-4 w-4" />} className="flex-1">
                  Continuer quand même
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        {/* Navigation */}
        {!(currentStep === 6 && (showAlerts || showSuccess)) && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStep === 1}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Retour
            </Button>

            {currentStep < 6 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continuer
              </Button>
            ) : (
              <Button
                onClick={handleTerminate}
                isLoading={isAnalyzing || isLoading}
                disabled={objectives.length === 0}
                rightIcon={<Check className="h-4 w-4" />}
              >
                Terminer
              </Button>
            )}
          </div>
        )}

        {/* Skip — only show on steps 1-5 */}
        {currentStep < 6 && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleComplete}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Passer et configurer plus tard
            </button>
          </div>
        )}
      </div>

      {/* ── Objective Modal ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={showObjectiveModal}
        onClose={closeObjectiveModal}
        title={modalStep === "family" ? "Type d'objectif" : "Détails de l'objectif"}
        size="lg"
      >
        {modalStep === "family" && (
          <div className="space-y-3">
            <button
              onClick={() => { setCurrentObjective({ priority: "B", family: "competition" }); setModalStep("details"); }}
              className="w-full p-4 rounded-xl border-2 border-dark-200 hover:border-accent bg-dark-50 text-left transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/20 rounded-lg"><Trophy className="h-5 w-5 text-accent" /></div>
                <div>
                  <p className="font-medium">Compétition / Événement</p>
                  <p className="text-xs text-muted">Une épreuve datée avec un objectif de résultat</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted ml-auto" />
              </div>
            </button>

            <button
              onClick={() => { setCurrentObjective({ priority: "B", family: "performance" }); setModalStep("details"); }}
              className="w-full p-4 rounded-xl border-2 border-dark-200 hover:border-accent bg-dark-50 text-left transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/20 rounded-lg"><Target className="h-5 w-5 text-accent" /></div>
                <div>
                  <p className="font-medium">Performance personnelle</p>
                  <p className="text-xs text-muted">Un cap mesurable à franchir, sans compétition</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted ml-auto" />
              </div>
            </button>

            <button
              onClick={() => { setCurrentObjective({ priority: "B", family: "wellness" }); setModalStep("details"); }}
              className="w-full p-4 rounded-xl border-2 border-dark-200 hover:border-accent bg-dark-50 text-left transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/20 rounded-lg"><Heart className="h-5 w-5 text-accent" /></div>
                <div>
                  <p className="font-medium">Forme & Bien-être sportif</p>
                  <p className="text-xs text-muted">Améliorer sa condition physique ou son mode de vie</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted ml-auto" />
              </div>
            </button>
          </div>
        )}

        {modalStep === "details" && currentObjective.family && (
          <div className="space-y-5">
            {/* Back to family */}
            <button
              type="button"
              onClick={() => setModalStep("family")}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Changer de type
            </button>

            {/* Objective list */}
            <div>
              <label className="block text-sm font-medium mb-2">Objectif</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {getObjectiveList(currentObjective.family).map((obj) => (
                  <button
                    key={obj}
                    type="button"
                    onClick={() => setCurrentObjective((prev) => ({ ...prev, name: obj }))}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                      currentObjective.name === obj
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-dark-200 bg-dark-100 hover:border-dark-300"
                    }`}
                  >
                    {obj}
                  </button>
                ))}
                {/* Autre */}
                <button
                  type="button"
                  onClick={() => setCurrentObjective((prev) => ({ ...prev, name: "other" }))}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                    currentObjective.name === "other"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-dark-200 bg-dark-100 hover:border-dark-300"
                  }`}
                >
                  Autre (champ libre)
                </button>
              </div>
            </div>

            {/* Free text for "Autre" */}
            {currentObjective.name === "other" && (
              <div>
                <Input
                  label="Décrivez votre objectif"
                  placeholder="Description de votre objectif"
                  value={otherObjectiveName}
                  onChange={(e) => setOtherObjectiveName(e.target.value)}
                />
                {isMedical(otherObjectiveName) && (
                  <div className="mt-2 p-2.5 bg-warning/10 border border-warning/30 rounded-lg flex gap-2 items-start">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning">
                      Cet objectif semble relever du domaine médical ou nutritionnel — votre coach sportif ne pourra pas l&apos;accompagner sur ce sujet. Il pourra en revanche adapter votre entraînement à votre condition physique globale.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Precision — label adapts to objective */}
            {(() => {
              const schema = currentObjective.family && currentObjective.name
                ? getFieldSchema(currentObjective.family, currentObjective.name)
                : {};
              return (
                <Input
                  label={schema.description_label || "Précision (optionnel)"}
                  placeholder="Donner au coach tous les détails qui décrivent l'objectif"
                  value={currentObjective.description || ""}
                  onChange={(e) => setCurrentObjective((prev) => ({ ...prev, description: e.target.value }))}
                />
              );
            })()}

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-2">Priorité</label>
              <div className="grid grid-cols-3 gap-2">
                {(["A", "B", "C"] as ObjectivePriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentObjective((prev) => ({ ...prev, priority: p }))}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      currentObjective.priority === p
                        ? p === "A"
                          ? "border-error bg-error/10 text-error"
                          : p === "B"
                          ? "border-warning bg-warning/10 text-warning"
                          : "border-dark-300 bg-dark-200 text-foreground"
                        : "border-dark-200 bg-dark-100 text-muted hover:border-dark-300"
                    }`}
                  >
                    {priorityLabel[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Adaptive fields based on objective type */}
            {currentObjective.family && currentObjective.name && (() => {
              const schema = getFieldSchema(currentObjective.family, currentObjective.name);
              return (
                <div className="space-y-3">
                  {/* Event name */}
                  {schema.event_name && (
                    <Input
                      label="Nom de l'événement (optionnel)"
                      placeholder="Ex : Marathon de Paris"
                      value={currentObjective.event_name || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, event_name: e.target.value }))}
                    />
                  )}

                  {/* Event date (competition) */}
                  {currentObjective.family === "competition" && (
                    <Input
                      label="Date de l'événement *"
                      type="date"
                      value={currentObjective.event_date || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, event_date: e.target.value }))}
                    />
                  )}

                  {/* Distance + elevation on same row when both present */}
                  {(schema.target_distance_km || schema.target_elevation_m) && (
                    <div className={schema.target_distance_km && schema.target_elevation_m ? "grid grid-cols-2 gap-3" : ""}>
                      {schema.target_distance_km && (
                        <Input
                          label={`Distance (km)${schema.target_distance_km.required ? " *" : " (optionnel)"}`}
                          type="number"
                          placeholder="Ex : 42"
                          value={currentObjective.target_distance_km || ""}
                          onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_distance_km: e.target.value }))}
                        />
                      )}
                      {schema.target_elevation_m && (
                        <Input
                          label="Dénivelé D+ (m) (optionnel)"
                          type="number"
                          placeholder="Ex : 2500"
                          value={currentObjective.target_elevation_m || ""}
                          onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_elevation_m: e.target.value }))}
                        />
                      )}
                    </div>
                  )}

                  {/* Target time */}
                  {schema.target_time && (
                    <Input
                      label="Temps cible (optionnel)"
                      placeholder="Ex : 3h30"
                      value={currentObjective.target_time || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_time: e.target.value }))}
                    />
                  )}

                  {/* Count (reps, sessions/week, seconds, days) */}
                  {schema.target_count && (
                    <div>
                      <Input
                        label={`${schema.target_count.label}${schema.target_count.required ? " *" : " (optionnel)"}`}
                        type="number"
                        placeholder={schema.target_count.placeholder}
                        value={currentObjective.target_count || ""}
                        onChange={(e) => setCurrentObjective((prev) => ({
                          ...prev,
                          target_count: e.target.value,
                          target_count_unit: schema.target_count?.unit,
                        }))}
                      />
                      {schema.target_count.unit && (
                        <p className="text-xs text-muted mt-1">Unité : {schema.target_count.unit}</p>
                      )}
                    </div>
                  )}

                  {/* Duration per session */}
                  {schema.target_duration_min && (
                    <div>
                      <Input
                        label={`${schema.target_duration_min.label} (optionnel)`}
                        type="number"
                        placeholder={schema.target_duration_min.placeholder}
                        value={currentObjective.target_duration_min || ""}
                        onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_duration_min: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-1">Unité : {schema.target_duration_min.unit}</p>
                    </div>
                  )}

                  {/* Weight */}
                  {schema.target_weight_kg && (
                    <Input
                      label={`${schema.target_weight_kg.label ?? "Charge cible (kg)"}${schema.target_weight_kg.required ? " *" : " (optionnel)"}`}
                      type="number"
                      placeholder="Ex : 20"
                      value={currentObjective.target_weight_kg || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_weight_kg: e.target.value }))}
                    />
                  )}

                  {/* Pace */}
                  {schema.target_pace && (
                    <Input
                      label="Allure cible (optionnel)"
                      placeholder="Ex : 5:30"
                      hint="Format : min:sec par km"
                      value={currentObjective.target_pace || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_pace: e.target.value }))}
                    />
                  )}

                  {/* FTP / power */}
                  {schema.target_power_watts && (
                    <Input
                      label="FTP cible (watts) (optionnel)"
                      type="number"
                      placeholder="Ex : 280"
                      value={currentObjective.target_power_watts || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_power_watts: e.target.value }))}
                    />
                  )}

                  {/* Target date (performance / wellness) */}
                  {currentObjective.family !== "competition" && (
                    <Input
                      label="Date cible — avant le... (optionnel)"
                      type="date"
                      value={currentObjective.target_date || ""}
                      onChange={(e) => setCurrentObjective((prev) => ({ ...prev, target_date: e.target.value }))}
                    />
                  )}
                </div>
              );
            })()}

            {/* Add button */}
            <Button
              onClick={addObjective}
              disabled={(() => {
                if (!currentObjective.name) return true;
                if (currentObjective.name === "other" && !otherObjectiveName.trim()) return true;
                if (currentObjective.family === "competition" && !currentObjective.event_date) return true;
                const schema = currentObjective.family && currentObjective.name
                  ? getFieldSchema(currentObjective.family, currentObjective.name)
                  : {};
                if (schema.target_distance_km?.required && !currentObjective.target_distance_km) return true;
                if (schema.target_count?.required && !currentObjective.target_count) return true;
                if (schema.target_weight_kg?.required && !currentObjective.target_weight_kg) return true;
                return false;
              })()}
              className="w-full"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Ajouter cet objectif
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
