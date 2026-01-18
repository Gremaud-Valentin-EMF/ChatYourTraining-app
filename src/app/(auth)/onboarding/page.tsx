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
} from "@/components/ui";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Activity,
  Heart,
  Target,
  Bike,
  Waves,
  Dumbbell,
  Trophy,
  Calendar,
} from "lucide-react";
import * as LucideIcons from "lucide-react";

type OnboardingStep = 1 | 2 | 3 | 4;

interface PhysioData {
  weight_kg: string;
  height_cm: string;
  birth_date: string;
  hr_max: string;
}

const SPORT_CATEGORIES = [
  {
    id: "pedestrian",
    label: "Sports pédestres",
    keywords: ["run", "trail", "walk", "hike", "race", "stroller", "jog"],
  },
  {
    id: "cycling",
    label: "Sports cyclistes",
    keywords: ["cycl", "bike", "ride", "velo", "bmx", "mtb", "gravel", "spin"],
  },
  {
    id: "nautical",
    label: "Sports nautiques",
    keywords: [
      "swim",
      "paddle",
      "surf",
      "row",
      "canoe",
      "kayak",
      "sail",
      "div",
      "kite",
      "wake",
      "boat",
      "water",
      "windsurf",
    ],
  },
  {
    id: "winter",
    label: "Sports d'hiver",
    keywords: ["ski", "snow", "ice", "patin", "biathlon", "sled"],
  },
  {
    id: "gym",
    label: "Salle & Fitness",
    keywords: [
      "gym",
      "yoga",
      "pilates",
      "fitness",
      "training",
      "strength",
      "lift",
      "hiit",
      "barre",
      "body",
      "crossfit",
      "weight",
      "solidcore",
      "reformer",
    ],
  },
  {
    id: "ball",
    label: "Sports collectifs & raquette",
    keywords: [
      "ball",
      "tennis",
      "golf",
      "basket",
      "soccer",
      "football",
      "volley",
      "rugby",
      "hand",
      "hockey",
      "lacrosse",
      "badminton",
      "cricket",
      "baseball",
      "softball",
      "pickle",
      "padel",
      "squash",
      "racquet",
      "table",
      "futsal",
      "netball",
      "polo",
      "ultimate",
      "gaelic",
      "water polo",
    ],
  },
  {
    id: "lifestyle",
    label: "Lifestyle & activités diverses",
    keywords: [
      "yard",
      "commut",
      "parent",
      "baby",
      "gardening",
      "operations",
      "coaching",
      "manual",
      "work",
      "gaming",
      "driving",
      "musical",
      "circus",
      "clean",
      "public",
      "watch",
      "bartend",
      "chess",
      "dedicated",
      "cadd",
      "drawing",
    ],
  },
  {
    id: "other",
    label: "Autres sports",
    keywords: [],
  },
] as const;

type SportCategoryId = (typeof SPORT_CATEGORIES)[number]["id"];

const formatIconName = (icon?: string) => {
  if (!icon) return "";
  return icon
    .replace(/[_\s]+/g, "-")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

const getSportIconComponent = (icon?: string) => {
  const formatted = formatIconName(icon);
  if (!formatted) return Activity;
  const IconComponent =
    LucideIcons[formatted as keyof typeof LucideIcons];
  return IconComponent || Activity;
};

const getSportCategory = (sportName: string): SportCategoryId => {
  const normalized = sportName.toLowerCase();
  for (const category of SPORT_CATEGORIES) {
    if (
      category.keywords.length > 0 &&
      category.keywords.some((keyword) => normalized.includes(keyword))
    ) {
      return category.id;
    }
  }
  return "other";
};

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

interface SportMetrics {
  vma_kmh: string;
  ftp_watts: string;
  css_per_100m: string;
  target_hours: number;
}

interface ObjectiveData {
  name: string;
  event_date: string;
  event_type: string;
  target_time: string;
}

const sportIcons: Record<string, React.ReactNode> = {
  running: <Activity className="h-6 w-6" />,
  cycling: <Bike className="h-6 w-6" />,
  swimming: <Waves className="h-6 w-6" />,
  strength: <Dumbbell className="h-6 w-6" />,
  triathlon: <Trophy className="h-6 w-6" />,
};

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Physiological data
  const [physioData, setPhysioData] = useState<PhysioData>({
    weight_kg: "",
    height_cm: "",
    birth_date: "",
    hr_max: "",
  });

  // Step 2: Sports - Initialize with defaults matching database UUIDs
  const [sports, setSports] = useState<SportSelection[]>([
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "running",
      name_fr: "Course à pied",
      icon: "running",
      selected: false,
      level: "intermediate",
      category: "pedestrian",
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "cycling",
      name_fr: "Cyclisme",
      icon: "bike",
      selected: false,
      level: "intermediate",
      category: "cycling",
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "swimming",
      name_fr: "Natation",
      icon: "waves",
      selected: false,
      level: "intermediate",
      category: "nautical",
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      name: "triathlon",
      name_fr: "Triathlon",
      icon: "trophy",
      selected: false,
      level: "intermediate",
      category: "other",
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      name: "strength",
      name_fr: "Renforcement",
      icon: "dumbbell",
      selected: false,
      level: "intermediate",
      category: "gym",
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      name: "other",
      name_fr: "Autre",
      icon: "activity",
      selected: false,
      level: "intermediate",
      category: "other",
    },
  ]);
  const [selectedCategory, setSelectedCategory] =
    useState<SportCategoryId>("pedestrian");

  // Step 3: Sport-specific metrics
  const [sportMetrics, setSportMetrics] = useState<SportMetrics>({
    vma_kmh: "",
    ftp_watts: "",
    css_per_100m: "",
    target_hours: 8,
  });

  // Step 4: Objective
  const [objective, setObjective] = useState<ObjectiveData>({
    name: "",
    event_date: "",
    event_type: "marathon",
    target_time: "",
  });

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        console.log("No session found, redirecting to login...");
        router.push("/login?error=session_expired");
      } else {
        console.log("Session found for user:", session.user.email);
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load sports from database (optional - uses defaults from initial state if fails)
  useEffect(() => {
    const loadSports = async () => {
      try {
        const { data, error } = await supabase
          .from("sports")
          .select("*")
          .order("name");

        if (error) {
          console.warn(
            "Could not load sports from database, using defaults:",
            error.message
          );
          return; // Keep the default sports from initial state
        }

        if (data && data.length > 0) {
          setSports(
            data.map(
              (sport: {
                id: string;
                name: string;
                name_fr: string;
                icon: string;
                color: string;
              }) => ({
                id: sport.id,
                name: sport.name,
                name_fr: sport.name_fr,
                icon: sport.icon,
                selected: false,
                level: "intermediate",
                category: getSportCategory(sport.name),
                color: sport.color,
              })
            )
          );
        }
        // If data is empty, keep the default sports from initial state
      } catch (err) {
        console.warn(
          "Failed to load sports from database, using defaults:",
          err
        );
        // Keep the default sports from initial state
      }
    };
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSport = (sportId: string) => {
    setSports(
      sports.map((sport) =>
        sport.id === sportId ? { ...sport, selected: !sport.selected } : sport
      )
    );
  };

  const updateSportLevel = (sportId: string, level: string) => {
    setSports(
      sports.map((sport) =>
        sport.id === sportId ? { ...sport, level } : sport
      )
    );
  };

  const selectedSports = sports.filter((s) => s.selected);
  const categoriesWithSports = useMemo(() => {
    return SPORT_CATEGORIES.map((category) => ({
      ...category,
      count: sports.filter((sport) => sport.category === category.id).length,
    })).filter((category) => category.count > 0);
  }, [sports]);

  useEffect(() => {
    if (
      categoriesWithSports.length > 0 &&
      !categoriesWithSports.some((cat) => cat.id === selectedCategory)
    ) {
      setSelectedCategory(categoriesWithSports[0].id);
    }
  }, [categoriesWithSports, selectedCategory]);

  const filteredSports = useMemo(
    () =>
      sports.filter(
        (sport) => sport.category === selectedCategory
      ),
    [sports, selectedCategory]
  );
  const hasRunning = selectedSports.some((s) => s.name === "running");
  const hasCycling = selectedSports.some((s) => s.name === "cycling");
  const hasSwimming = selectedSports.some((s) => s.name === "swimming");

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as OnboardingStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as OnboardingStep);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error("Auth error:", authError);
        throw new Error(
          "Erreur d'authentification. Veuillez vous reconnecter."
        );
      }

      if (!user) {
        console.error("No user found in session");
        throw new Error("Non authentifié. Veuillez vous reconnecter.");
      }

      console.log("User ID:", user.id);
      console.log("User email:", user.email);
      console.log("Selected sports:", selectedSports);

      // First, ensure the user exists in public.users table
      console.log("Ensuring user profile exists...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: userError } = await (supabase as any).from("users").upsert(
        {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
        },
        { onConflict: "id" }
      );

      if (userError) {
        console.error("User profile error:", userError);
        // Continue anyway - the trigger might have created it
      } else {
        console.log("User profile ensured!");
      }

      // Save physiological data
      console.log("Saving physiological data...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: physioError } = await (supabase as any)
        .from("physiological_data")
        .upsert(
          {
            user_id: user.id,
            weight_kg: physioData.weight_kg
              ? parseFloat(physioData.weight_kg)
              : null,
            height_cm: physioData.height_cm
              ? parseInt(physioData.height_cm)
              : null,
            birth_date: physioData.birth_date || null,
            hr_max: physioData.hr_max ? parseInt(physioData.hr_max) : null,
          },
          { onConflict: "user_id" }
        );

      if (physioError) {
        console.error("Physio error:", physioError);
        throw new Error(`Erreur données physio: ${physioError.message}`);
      }
      console.log("Physiological data saved!");

      // Save user sports
      console.log("Saving user sports...");
      for (const sport of selectedSports) {
        console.log("Saving sport:", sport.id, sport.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: sportError } = await (supabase as any)
          .from("user_sports")
          .upsert(
            {
              user_id: user.id,
              sport_id: sport.id,
              level: sport.level,
              vma_kmh:
                sport.name === "running" && sportMetrics.vma_kmh
                  ? parseFloat(sportMetrics.vma_kmh)
                  : null,
              ftp_watts:
                sport.name === "cycling" && sportMetrics.ftp_watts
                  ? parseInt(sportMetrics.ftp_watts)
                  : null,
              css_per_100m:
                sport.name === "swimming" && sportMetrics.css_per_100m
                  ? parseInt(sportMetrics.css_per_100m)
                  : null,
              target_hours_per_week: sportMetrics.target_hours,
            },
            { onConflict: "user_id,sport_id" }
          );

        if (sportError) {
          console.error("Sport error:", sportError);
          throw new Error(`Erreur sport ${sport.name}: ${sportError.message}`);
        }
      }
      console.log("User sports saved!");

      // Save objective if provided
      if (objective.name && objective.event_date) {
        console.log("Saving objective...");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: objError } = await (supabase as any)
          .from("objectives")
          .insert({
            user_id: user.id,
            name: objective.name,
            event_date: objective.event_date,
            event_type: objective.event_type,
            target_time: objective.target_time || null,
          });

        if (objError) {
          console.error("Objective error:", objError);
          throw new Error(`Erreur objectif: ${objError.message}`);
        }
        console.log("Objective saved!");
      }

      // Mark onboarding as complete
      console.log("Marking onboarding complete...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("users")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      if (updateError) {
        console.error("Update user error:", updateError);
        throw new Error(
          `Erreur mise à jour utilisateur: ${updateError.message}`
        );
      }
      console.log("Onboarding complete!");

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      console.error("Complete error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Erreur inconnue";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true; // Physio data is optional
      case 2:
        return selectedSports.length > 0;
      case 3:
        return true; // Metrics are optional
      case 4:
        return true; // Objective is optional
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-dark py-8 px-4">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-8 w-8 text-accent" />
            <span className="text-xl font-bold">ChatYourTraining</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">
            Configuration de votre profil
          </h1>
          <p className="text-muted">Étape {currentStep} sur 4</p>
        </div>

        {/* Progress bar */}
        <Progress value={currentStep} max={4} className="mb-4" />

        {/* Step content */}
        <Card className="mb-4">
          {/* Step 1: Physiological Data */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Heart className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">
                    Données physiologiques
                  </h2>
                  <p className="text-sm text-muted">
                    Pour calibrer vos zones d&apos;entraînement
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Poids (kg)"
                  type="number"
                  placeholder="70"
                  value={physioData.weight_kg}
                  onChange={(e) =>
                    setPhysioData({ ...physioData, weight_kg: e.target.value })
                  }
                />
                <Input
                  label="Taille (cm)"
                  type="number"
                  placeholder="175"
                  value={physioData.height_cm}
                  onChange={(e) =>
                    setPhysioData({ ...physioData, height_cm: e.target.value })
                  }
                />
              </div>

              <Input
                label="Date de naissance"
                type="date"
                value={physioData.birth_date}
                onChange={(e) =>
                  setPhysioData({ ...physioData, birth_date: e.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="FC Max (bpm)"
                  type="number"
                  placeholder="185"
                  hint="Fréquence cardiaque maximale"
                  value={physioData.hr_max}
                  onChange={(e) =>
                    setPhysioData({ ...physioData, hr_max: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {/* Step 2: Sports */}
          {currentStep === 2 && (
            <div className="flex flex-col h-[calc(100vh-240px)] min-h-[400px]">
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Activity className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Sports pratiqués</h2>
                  <p className="text-sm text-muted">
                    Sélectionnez vos disciplines
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row flex-1 gap-4 overflow-hidden">
                {/* Categories Sidebar */}
                <div className="w-full md:w-48 shrink-0 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:pr-4 snap-x">
                  {SPORT_CATEGORIES.map((category) => {
                    const count = sports.filter(
                      (s) => s.category === category.id
                    ).length;
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
                        <span className="text-sm leading-tight block">
                          {category.label}
                        </span>
                        {isSelected && (
                          <div className="h-1.5 w-1.5 rounded-full bg-dark/30 hidden md:block shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Sports List (Single Column) */}
                <div className="flex-1 overflow-y-auto pb-2 min-h-0 pr-1">
                  <div className="grid grid-cols-1 gap-3">
                    {filteredSports.map((sport) => {
                      const IconComponent = getSportIconComponent(sport.icon);
                      return (
                        <div
                          key={sport.id}
                          onClick={() => toggleSport(sport.id)}
                          className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            sport.selected
                              ? "border-accent bg-accent/10"
                              : "border-dark-200 hover:border-dark-300 bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-2.5 rounded-lg shrink-0 ${
                                  sport.selected
                                    ? "" // Handled by inline style
                                    : "bg-dark-100 text-muted-foreground"
                                }`}
                                style={
                                  sport.selected && sport.color
                                    ? {
                                        backgroundColor: `${sport.color}20`,
                                        color: sport.color,
                                      }
                                    : sport.selected
                                    ? {
                                        backgroundColor: "rgba(34, 197, 94, 0.2)", // fallback accent color (green-500)
                                        color: "#22c55e",
                                      }
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
                                style={{
                                  backgroundColor: sport.color || "#22c55e",
                                }}
                              >
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>

                          {sport.selected && (
                            <div className="mt-3 pt-3 border-t border-dark-200/50 animate-in fade-in slide-in-from-top-2">
                              <label className="text-xs text-muted-foreground mb-1.5 block">
                                Niveau
                              </label>
                              <Select
                                options={[
                                  { value: "beginner", label: "Débutant" },
                                  {
                                    value: "intermediate",
                                    label: "Intermédiaire",
                                  },
                                  { value: "advanced", label: "Avancé" },
                                  { value: "elite", label: "Élite" },
                                ]}
                                value={sport.level}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateSportLevel(sport.id, e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
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

          {/* Step 3: Sport Metrics */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Target className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Métriques sportives</h2>
                  <p className="text-sm text-muted">Pour des zones précises</p>
                </div>
              </div>

              {hasRunning && (
                <Input
                  label="VMA (km/h)"
                  type="number"
                  step="0.1"
                  placeholder="16.5"
                  hint="Vitesse Maximale Aérobie - Test sur piste recommandé"
                  value={sportMetrics.vma_kmh}
                  onChange={(e) =>
                    setSportMetrics({
                      ...sportMetrics,
                      vma_kmh: e.target.value,
                    })
                  }
                />
              )}

              {hasCycling && (
                <Input
                  label="FTP (watts)"
                  type="number"
                  placeholder="250"
                  hint="Functional Threshold Power - Test 20min recommandé"
                  value={sportMetrics.ftp_watts}
                  onChange={(e) =>
                    setSportMetrics({
                      ...sportMetrics,
                      ftp_watts: e.target.value,
                    })
                  }
                />
              )}

              {hasSwimming && (
                <Input
                  label="CSS (sec/100m)"
                  type="number"
                  placeholder="95"
                  hint="Critical Swim Speed - Test 400m + 200m recommandé"
                  value={sportMetrics.css_per_100m}
                  onChange={(e) =>
                    setSportMetrics({
                      ...sportMetrics,
                      css_per_100m: e.target.value,
                    })
                  }
                />
              )}

              <Slider
                label="Volume cible par semaine"
                min={1}
                max={20}
                value={sportMetrics.target_hours}
                onChange={(e) =>
                  setSportMetrics({
                    ...sportMetrics,
                    target_hours: parseInt(e.target.value),
                  })
                }
                valueFormatter={(v) => `${v}h`}
              />

              <div className="flex gap-2 flex-wrap">
                {[4, 6, 8, 10, 12, 15].map((hours) => (
                  <Badge
                    key={hours}
                    variant={
                      sportMetrics.target_hours === hours
                        ? "success"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() =>
                      setSportMetrics({ ...sportMetrics, target_hours: hours })
                    }
                  >
                    {hours}h/sem
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Objective */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-accent/20 rounded-xl">
                  <Calendar className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Objectif principal</h2>
                  <p className="text-sm text-muted">
                    Votre prochaine compétition majeure
                  </p>
                </div>
              </div>

              <Input
                label="Nom de l'événement"
                placeholder="Marathon de Paris 2024"
                value={objective.name}
                onChange={(e) =>
                  setObjective({ ...objective, name: e.target.value })
                }
              />

              <Input
                label="Date de l'événement"
                type="date"
                value={objective.event_date}
                onChange={(e) =>
                  setObjective({ ...objective, event_date: e.target.value })
                }
              />

              <Select
                label="Type d'épreuve"
                options={[
                  { value: "5k", label: "5 km" },
                  { value: "10k", label: "10 km" },
                  { value: "semi", label: "Semi-marathon" },
                  { value: "marathon", label: "Marathon" },
                  { value: "ultra", label: "Ultra-trail" },
                  { value: "sprint", label: "Triathlon Sprint" },
                  { value: "olympic", label: "Triathlon Olympique" },
                  { value: "half-ironman", label: "Half Ironman 70.3" },
                  { value: "ironman", label: "Ironman" },
                  { value: "cycling", label: "Cyclosportive" },
                  { value: "other", label: "Autre" },
                ]}
                value={objective.event_type}
                onChange={(e) =>
                  setObjective({ ...objective, event_type: e.target.value })
                }
              />

              <Input
                label="Temps objectif (optionnel)"
                placeholder="3h30"
                hint="Format: HhMM (ex: 3h30, 1h45)"
                value={objective.target_time}
                onChange={(e) =>
                  setObjective({ ...objective, target_time: e.target.value })
                }
              />
            </div>
          )}
        </Card>

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Retour
          </Button>

          {currentStep < 4 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continuer
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              isLoading={isLoading}
              rightIcon={<Check className="h-4 w-4" />}
            >
              Terminer
            </Button>
          )}
        </div>

        {/* Skip option */}
        <div className="mt-6 text-center">
          <button
            onClick={handleComplete}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Passer et configurer plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
