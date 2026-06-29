"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Button,
  Input,
  Select,
  Slider,
  Toggle,
  Avatar,
  Spinner,
  Toast,
  type ToastData,
} from "@/components/ui";
import {
  Settings,
  Edit2,
  Save,
  X,
  Dumbbell,
  Plus,
  Clock,
  Trash2,
} from "lucide-react";
import type { Json } from "@/types/database";

// ─── MVP sports, levels, limits (shared with onboarding) ─────────────────────

type MvpSport = { id: string; name: string; name_fr: string };

const DEFAULT_MVP_SPORTS: MvpSport[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "running", name_fr: "Course à pied" },
  { id: "00000000-0000-0000-0000-000000000002", name: "cycling", name_fr: "Vélo" },
  { id: "00000000-0000-0000-0000-000000000011", name: "mountain-biking", name_fr: "VTT" },
  { id: "00000000-0000-0000-0000-000000000007", name: "walking", name_fr: "Marche" },
  { id: "00000000-0000-0000-0000-000000000008", name: "hiking", name_fr: "Randonnée" },
  { id: "00000000-0000-0000-0000-000000000009", name: "alpine-skiing", name_fr: "Ski alpin" },
  { id: "00000000-0000-0000-0000-000000000010", name: "cross-country-skiing", name_fr: "Ski de fond" },
  { id: "00000000-0000-0000-0000-000000000005", name: "strength", name_fr: "Musculation" },
  { id: "00000000-0000-0000-0000-000000000006", name: "other", name_fr: "Autre" },
];

const SPORT_LEVELS = [
  { value: "discovery", label: "Découverte" },
  { value: "beginner", label: "Débutant" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
  { value: "elite", label: "Élite" },
];

const PHYSIO_LIMITS: Record<string, { min: number; max: number }> = {
  weight_kg: { min: 30, max: 150 },
  height_cm: { min: 140, max: 220 },
  hr_max: { min: 100, max: 220 },
  lthr: { min: 100, max: 200 },
  vma_kmh: { min: 8, max: 30 },
  ftp_watts: { min: 50, max: 500 },
};

const hasFtp = (slug: string) => slug === "cycling" || slug === "mountain-biking";
const hasVma = (slug: string) => slug === "running";

function isOutOfRange(field: string, value: number | null): boolean {
  const limits = PHYSIO_LIMITS[field];
  if (!limits || value == null || Number.isNaN(value)) return false;
  return value < limits.min || value > limits.max;
}

// ─── Identity & availability (shared with onboarding) ────────────────────────

type Gender = "male" | "female" | "";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Homme" },
  { value: "female", label: "Femme" },
  { value: "", label: "Non précisé" },
];

const TRAINING_GOAL_OPTIONS = [
  { value: "performance", label: "Performance — Progresser et compétiter" },
  { value: "health", label: "Santé & Loisir — Rester actif et en forme" },
  { value: "leisure", label: "Loisir — Pratiquer pour le plaisir" },
];

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

interface DaySlot {
  start: string;
  end: string;
}
interface DayAvailability {
  enabled: boolean;
  slots: DaySlot[];
}
type AvailabilityData = Record<DayKey, DayAvailability>;

function makeDefaultDays(): AvailabilityData {
  return Object.fromEntries(
    DAY_KEYS.map((d) => [d, { enabled: false, slots: [] as DaySlot[] }])
  ) as AvailabilityData;
}

/** "m:ss" → decimal minutes per km (e.g. "4:30" → 4.5). Mirrors onboarding. */
function parseThresholdPace(value: string): number | null {
  const parts = value.split(":");
  if (parts.length === 2) {
    const min = parseInt(parts[0]);
    const sec = parseInt(parts[1]);
    if (!isNaN(min) && !isNaN(sec)) return min + sec / 60;
  }
  return parseFloat(value) || null;
}

/** decimal minutes per km → "m:ss". */
function formatPaceMinPerKm(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "";
  const min = Math.floor(value);
  const sec = Math.round((value - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

interface PhysioData {
  weight_kg: number | null;
  height_cm: number | null;
  hr_max: number | null;
  hr_rest: number | null;
  lthr: number | null;
  birth_date: string | null;
}

interface UserSport {
  id: string | null; // null = newly added, not yet persisted
  sport_id: string;
  sport_slug: string;
  sport_name: string;
  level: string;
  vma_kmh: number | null;
  ftp_watts: number | null;
  threshold_pace_per_km: number | null;
  threshold_pace_str: string; // editable "m:ss" mirror of threshold_pace_per_km
  target_hours_per_week: number | null;
}

type SportRow = {
  id: string;
  sport_id: string;
  level: string;
  vma_kmh: number | null;
  ftp_watts: number | null;
  threshold_pace_per_km: number | null;
  target_hours_per_week: number | null;
  sports?: { name: string; name_fr: string } | null;
};

// ─── Change-detection snapshot ───────────────────────────────────────────────

function makeSnapshot(args: {
  profile: Pick<UserProfile, "full_name" | "avatar_url"> | null;
  gender: Gender;
  trainingGoal: string;
  availability: AvailabilityData;
  physio: PhysioData;
  sports: UserSport[];
  targetHours: number;
}): string {
  const { profile, gender, trainingGoal, availability, physio, sports, targetHours } =
    args;
  return JSON.stringify({
    full_name: profile?.full_name ?? "",
    avatar_url: profile?.avatar_url ?? null,
    gender,
    trainingGoal,
    availability,
    physio,
    targetHours,
    sports: sports.map((s) => ({
      sport_id: s.sport_id,
      level: s.level,
      vma_kmh: s.vma_kmh,
      ftp_watts: s.ftp_watts,
      threshold_pace_per_km: s.threshold_pace_per_km,
    })),
  });
}

export default function ProfilePage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [physio, setPhysio] = useState<PhysioData>({
    weight_kg: null,
    height_cm: null,
    hr_max: null,
    hr_rest: null,
    lthr: null,
    birth_date: null,
  });
  const [sports, setSports] = useState<UserSport[]>([]);
  // Ids of existing sports removed in the current edit session (deleted on save).
  const [removedSportIds, setRemovedSportIds] = useState<string[]>([]);
  const [targetHours, setTargetHours] = useState(12);
  const [gender, setGender] = useState<Gender>("");
  const [trainingGoal, setTrainingGoal] = useState<string>("");
  const [availability, setAvailability] = useState<AvailabilityData>(
    makeDefaultDays()
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Serialized snapshot of the values as last loaded — used to detect "no change".
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [profileRes, physioRes, sportsRes]: any[] = await Promise.all([
        supabase.from("users").select("*").eq("id", user.id).single(),
        supabase
          .from("physiological_data")
          .select("*")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("user_sports")
          .select("*, sports(name, name_fr)")
          .eq("user_id", user.id),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const loadedProfile: UserProfile | null = profileRes.data
        ? {
            id: profileRes.data.id,
            full_name: profileRes.data.full_name || "",
            email: profileRes.data.email,
            avatar_url: profileRes.data.avatar_url,
          }
        : null;

      const loadedGender: Gender = (profileRes.data?.gender as Gender) || "";
      const loadedTrainingGoal: string = profileRes.data?.training_goal || "";
      const loadedAvailability: AvailabilityData = {
        ...makeDefaultDays(),
        ...((profileRes.data?.training_availability as AvailabilityData) ?? {}),
      };

      const loadedPhysio: PhysioData = physioRes.data
        ? {
            weight_kg: physioRes.data.weight_kg,
            height_cm: physioRes.data.height_cm,
            hr_max: physioRes.data.hr_max,
            hr_rest: physioRes.data.hr_rest,
            lthr: physioRes.data.lthr ?? null,
            birth_date: physioRes.data.birth_date,
          }
        : physio;

      const loadedSports: UserSport[] = ((sportsRes.data as SportRow[]) ?? []).map(
        (s) => ({
          id: s.id,
          sport_id: s.sport_id,
          sport_slug: s.sports?.name || "other",
          sport_name: s.sports?.name_fr || "Sport",
          level: s.level,
          vma_kmh: s.vma_kmh,
          ftp_watts: s.ftp_watts,
          threshold_pace_per_km: s.threshold_pace_per_km,
          threshold_pace_str: formatPaceMinPerKm(s.threshold_pace_per_km),
          target_hours_per_week: s.target_hours_per_week,
        })
      );

      const loadedTargetHours =
        loadedSports[0]?.target_hours_per_week ?? targetHours;

      setProfile(loadedProfile);
      setAvatarPreview(loadedProfile?.avatar_url || null);
      setPhysio(loadedPhysio);
      setSports(loadedSports);
      setRemovedSportIds([]);
      setTargetHours(loadedTargetHours);
      setGender(loadedGender);
      setTrainingGoal(loadedTrainingGoal);
      setAvailability(loadedAvailability);
      setInitialSnapshot(
        makeSnapshot({
          profile: loadedProfile,
          gender: loadedGender,
          trainingGoal: loadedTrainingGoal,
          availability: loadedAvailability,
          physio: loadedPhysio,
          sports: loadedSports,
          targetHours: loadedTargetHours,
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateSport = (index: number, patch: Partial<UserSport>) => {
    setSports((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const addSport = (sportId: string) => {
    const mvp = DEFAULT_MVP_SPORTS.find((s) => s.id === sportId);
    if (!mvp) return;
    setSports((prev) => [
      ...prev,
      {
        id: null,
        sport_id: mvp.id,
        sport_slug: mvp.name,
        sport_name: mvp.name_fr,
        level: "intermediate",
        vma_kmh: null,
        ftp_watts: null,
        threshold_pace_per_km: null,
        threshold_pace_str: "",
        target_hours_per_week: targetHours,
      },
    ]);
  };

  // ─── Availability helpers (mirror onboarding) ──────────────────────────────

  const toggleDay = (day: DayKey) => {
    setAvailability((prev) => {
      const d = prev[day];
      const enabled = !d.enabled;
      return {
        ...prev,
        [day]: {
          enabled,
          // Enabling an empty day seeds a default slot, like onboarding.
          slots: enabled && d.slots.length === 0
            ? [{ start: "07:00", end: "08:00" }]
            : d.slots,
        },
      };
    });
  };

  const addSlot = (day: DayKey) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { start: "07:00", end: "08:00" }],
      },
    }));
  };

  const updateSlot = (
    day: DayKey,
    idx: number,
    field: "start" | "end",
    value: string
  ) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map((s, i) =>
          i === idx ? { ...s, [field]: value } : s
        ),
      },
    }));
  };

  const removeSlot = (day: DayKey, idx: number) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.filter((_, i) => i !== idx),
      },
    }));
  };

  const removeSport = (index: number) => {
    setSports((prev) => {
      const sport = prev[index];
      if (sport?.id) {
        setRemovedSportIds((ids) => [...ids, sport.id as string]);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const availableSports = DEFAULT_MVP_SPORTS.filter(
    (d) => !sports.some((s) => s.sport_id === d.id)
  );

  const handleSave = async () => {
    // AC3 — no write when nothing changed.
    const current = makeSnapshot({
      profile,
      gender,
      trainingGoal,
      availability,
      physio,
      sports,
      targetHours,
    });
    if (current === initialSnapshot) {
      setToast({ type: "info", message: "Aucune modification détectée" });
      return;
    }

    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("users")
        .update({
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
          gender: gender || null,
          training_goal: trainingGoal || null,
          training_availability: availability as unknown as Json,
        })
        .eq("id", user.id);

      await supabase.from("physiological_data").upsert(
        {
          user_id: user.id,
          weight_kg: physio.weight_kg,
          height_cm: physio.height_cm,
          birth_date: physio.birth_date,
          hr_max: physio.hr_max,
          hr_rest: physio.hr_rest,
          lthr: physio.lthr,
        },
        { onConflict: "user_id" }
      );

      for (const sport of sports) {
        const payload = {
          level: sport.level,
          vma_kmh: sport.vma_kmh,
          ftp_watts: sport.ftp_watts,
          threshold_pace_per_km: sport.threshold_pace_per_km,
          target_hours_per_week: targetHours,
        };
        if (sport.id) {
          await supabase.from("user_sports").update(payload).eq("id", sport.id);
        } else {
          await supabase.from("user_sports").insert({
            user_id: user.id,
            sport_id: sport.sport_id,
            ...payload,
          });
        }
      }

      // Delete sports removed during this edit session.
      if (removedSportIds.length > 0) {
        await supabase.from("user_sports").delete().in("id", removedSportIds);
      }

      setToast({ type: "success", message: "Profil sauvegardé" });
      setIsEditing(false);
      await loadProfile();
    } catch (error) {
      console.error("Error saving profile:", error);
      setToast({
        type: "error",
        message: "Une erreur est survenue lors de la sauvegarde.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    loadProfile();
  };

  const handleDeleteProfile = () => {
    alert(
      "La suppression du profil doit être confirmée avec l'équipe support."
    );
  };

  const openAvatarDialog = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setProfile((p) => (p ? { ...p, avatar_url: result } : p));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const age =
    physio.birth_date && !Number.isNaN(Date.parse(physio.birth_date))
      ? Math.floor(
          (Date.now() - new Date(physio.birth_date).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="text-muted">
          Gérez votre identité et vos préférences d&apos;entraînement.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card className="text-center">
            <div className="relative inline-block mb-4">
              <Avatar
                src={avatarPreview ?? profile?.avatar_url ?? undefined}
                fallback={profile?.full_name || "U"}
                size="xl"
                className="h-24 w-24"
              />
            </div>

            {isEditing && (
              <div className="flex flex-col items-center gap-2 mb-4">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarInputChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openAvatarDialog}
                  type="button"
                >
                  Changer la photo
                </Button>
                <p className="text-xs text-muted">
                  Formats JPG/PNG, max 5 Mo.
                </p>
              </div>
            )}

            {isEditing ? (
              <Input
                value={profile?.full_name || ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, full_name: e.target.value } : null
                  )
                }
                className="text-center mb-2"
              />
            ) : (
              <h2 className="text-xl font-bold mb-1">{profile?.full_name}</h2>
            )}

            <p className="text-sm text-muted mb-4">
              Discipline principale: {sports[0]?.sport_name || "Athlète"}
            </p>

            {isEditing && (
              <div className="space-y-4 mb-6 text-left">
                <div>
                  <label className="block text-sm font-medium mb-2">Genre</label>
                  <div className="grid grid-cols-3 gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <button
                        key={g.value || "unset"}
                        type="button"
                        onClick={() => setGender(g.value)}
                        className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          gender === g.value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-dark-200 bg-dark-100 text-muted hover:border-dark-300"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  label="Date de naissance"
                  type="date"
                  value={physio.birth_date ?? ""}
                  onChange={(e) =>
                    setPhysio((p) => ({
                      ...p,
                      birth_date: e.target.value || null,
                    }))
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-dark-100 rounded-xl">
                <p className="text-xs text-muted uppercase">Âge</p>
                <p className="text-xl font-bold">
                  {age ?? "--"}{" "}
                  <span className="text-sm text-muted">ans</span>
                </p>
              </div>
              <div className="p-3 bg-dark-100 rounded-xl">
                <p className="text-xs text-muted uppercase">Poids</p>
                {isEditing ? (
                  <Input
                    type="number"
                    value={physio.weight_kg || ""}
                    onChange={(e) =>
                      setPhysio((p) => ({
                        ...p,
                        weight_kg: parseFloat(e.target.value) || null,
                      }))
                    }
                    className="text-center text-xl font-bold h-8 p-1"
                  />
                ) : (
                  <p className="text-xl font-bold">
                    {physio.weight_kg || "--"}{" "}
                    <span className="text-sm text-muted">kg</span>
                  </p>
                )}
              </div>
              <div className="p-3 bg-dark-100 rounded-xl">
                <p className="text-xs text-muted uppercase">Taille</p>
                {isEditing ? (
                  <Input
                    type="number"
                    value={physio.height_cm || ""}
                    onChange={(e) =>
                      setPhysio((p) => ({
                        ...p,
                        height_cm: parseInt(e.target.value) || null,
                      }))
                    }
                    className="text-center text-xl font-bold h-8 p-1"
                  />
                ) : (
                  <p className="text-xl font-bold">
                    {physio.height_cm || "--"}{" "}
                    <span className="text-sm text-muted">cm</span>
                  </p>
                )}
              </div>
              <div className="p-3 bg-dark-100 rounded-xl">
                <p className="text-xs text-muted uppercase">FC max</p>
                {isEditing ? (
                  <Input
                    type="number"
                    value={physio.hr_max ?? ""}
                    onChange={(e) =>
                      setPhysio((p) => ({
                        ...p,
                        hr_max: parseInt(e.target.value) || null,
                      }))
                    }
                    className="text-center text-xl font-bold h-8 p-1"
                  />
                ) : (
                  <p className="text-xl font-bold">
                    {physio.hr_max ?? "--"}{" "}
                    <span className="text-sm text-muted">bpm</span>
                  </p>
                )}
              </div>
              <div className="p-3 bg-dark-100 rounded-xl">
                <p className="text-xs text-muted uppercase">LTHR</p>
                {isEditing ? (
                  <Input
                    type="number"
                    value={physio.lthr ?? ""}
                    onChange={(e) =>
                      setPhysio((p) => ({
                        ...p,
                        lthr: parseInt(e.target.value) || null,
                      }))
                    }
                    className="text-center text-xl font-bold h-8 p-1"
                  />
                ) : (
                  <p className="text-xl font-bold">
                    {physio.lthr ?? "--"}{" "}
                    <span className="text-sm text-muted">bpm</span>
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Dumbbell className="h-5 w-5 text-accent" />
              <h3 className="font-semibold">Sports &amp; seuils</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Vos disciplines et leurs valeurs seuils (FTP, VMA). Ces valeurs
              alimentent le calcul de charge (TSS) et le Coach IA.
            </p>

            <div className="space-y-4">
              {sports.map((sport, index) => (
                <div
                  key={sport.id ?? `new-${sport.sport_id}`}
                  className="p-4 bg-dark-100 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{sport.sport_name}</span>
                    <div className="flex items-center gap-2">
                      {sport.id === null && (
                        <span className="text-xs text-accent">Nouveau</span>
                      )}
                      {isEditing && sports.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSport(index)}
                          aria-label={`Retirer ${sport.sport_name}`}
                          className="p-1.5 text-muted hover:text-error transition-colors rounded-lg hover:bg-error/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label="Niveau"
                        options={SPORT_LEVELS}
                        value={sport.level}
                        onChange={(value) =>
                          updateSport(index, { level: value })
                        }
                      />
                      {hasFtp(sport.sport_slug) && (
                        <Input
                          label="FTP (watts)"
                          type="number"
                          value={sport.ftp_watts ?? ""}
                          onChange={(e) =>
                            updateSport(index, {
                              ftp_watts: parseInt(e.target.value) || null,
                            })
                          }
                          error={
                            isOutOfRange("ftp_watts", sport.ftp_watts)
                              ? "Valeur inhabituelle — êtes-vous sûr ?"
                              : undefined
                          }
                        />
                      )}
                      {hasVma(sport.sport_slug) && (
                        <Input
                          label="VMA (km/h)"
                          type="number"
                          step="0.1"
                          value={sport.vma_kmh ?? ""}
                          onChange={(e) =>
                            updateSport(index, {
                              vma_kmh: parseFloat(e.target.value) || null,
                            })
                          }
                          error={
                            isOutOfRange("vma_kmh", sport.vma_kmh)
                              ? "Valeur inhabituelle — êtes-vous sûr ?"
                              : undefined
                          }
                        />
                      )}
                      {hasVma(sport.sport_slug) && (
                        <Input
                          label="Allure seuil (min/km)"
                          type="text"
                          placeholder="4:30"
                          value={sport.threshold_pace_str}
                          onChange={(e) =>
                            updateSport(index, {
                              threshold_pace_str: e.target.value,
                              threshold_pace_per_km: parseThresholdPace(
                                e.target.value
                              ),
                            })
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                      <span>
                        Niveau :{" "}
                        {SPORT_LEVELS.find((l) => l.value === sport.level)
                          ?.label ?? sport.level}
                      </span>
                      {hasFtp(sport.sport_slug) && (
                        <span>FTP : {sport.ftp_watts ?? "--"} W</span>
                      )}
                      {hasVma(sport.sport_slug) && (
                        <span>VMA : {sport.vma_kmh ?? "--"} km/h</span>
                      )}
                      {hasVma(sport.sport_slug) && (
                        <span>
                          Allure seuil :{" "}
                          {sport.threshold_pace_str || "--"} /km
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isEditing && availableSports.length > 0 && (
                <div className="pt-2 border-t border-dark-200">
                  <div className="flex items-center gap-2 mb-2 text-sm text-muted">
                    <Plus className="h-4 w-4" />
                    Ajouter un sport
                  </div>
                  <Select
                    placeholder="Ajouter un sport"
                    value=""
                    options={availableSports.map((s) => ({
                      value: s.id,
                      label: s.name_fr,
                    }))}
                    onChange={(value) => addSport(value)}
                  />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-accent" />
              <h3 className="font-semibold">Paramètres d&apos;Entraînement</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Ajustez votre volume hebdomadaire de référence
            </p>
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs text-muted uppercase">
                  Volume hebdomadaire cible
                </label>
                <span className="text-accent font-bold">
                  {targetHours}h / semaine
                </span>
              </div>
              <Slider
                min={1}
                max={20}
                value={targetHours}
                onChange={(e) => setTargetHours(parseInt(e.target.value))}
                showValue={false}
                disabled={!isEditing}
              />
              <div className="flex justify-between text-xs text-muted mt-2">
                <span>0h</span>
                <span>5h</span>
                <span>10h</span>
                <span>15h</span>
                <span>20h+</span>
              </div>
              <p className="text-xs text-accent mt-3">
                Utilisé par l&apos;IA pour calibrer les charges
              </p>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-accent" />
              <h3 className="font-semibold">Disponibilités &amp; objectif</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Votre objectif global et vos créneaux d&apos;entraînement habituels
              (utilisés par le Coach pour planifier vos séances).
            </p>

            <div className="space-y-5">
              {isEditing ? (
                <Select
                  label="Objectif global"
                  placeholder="Choisissez votre objectif..."
                  options={TRAINING_GOAL_OPTIONS}
                  value={trainingGoal}
                  onChange={(value) => setTrainingGoal(value)}
                />
              ) : (
                <div>
                  <p className="text-xs text-muted uppercase mb-1">
                    Objectif global
                  </p>
                  <p className="text-sm">
                    {TRAINING_GOAL_OPTIONS.find((o) => o.value === trainingGoal)
                      ?.label ?? "Non défini"}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-3">
                  Jours &amp; créneaux disponibles{" "}
                  <span className="text-muted font-normal">(optionnel)</span>
                </p>

                {isEditing ? (
                  <div className="space-y-3">
                    {DAY_KEYS.map((day) => {
                      const dayData = availability[day];
                      return (
                        <div
                          key={day}
                          className="rounded-xl border border-dark-200 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {DAY_LABELS[day]}
                            </span>
                            <Toggle
                              checked={dayData.enabled}
                              onChange={() => toggleDay(day)}
                            />
                          </div>

                          {dayData.enabled && (
                            <div className="mt-3 space-y-2">
                              {dayData.slots.map((slot, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-xs text-muted w-6 shrink-0">
                                    De
                                  </span>
                                  <input
                                    type="time"
                                    value={slot.start}
                                    onChange={(e) =>
                                      updateSlot(day, idx, "start", e.target.value)
                                    }
                                    className="bg-dark-100 border border-dark-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                                  />
                                  <span className="text-xs text-muted">à</span>
                                  <input
                                    type="time"
                                    value={slot.end}
                                    onChange={(e) =>
                                      updateSlot(day, idx, "end", e.target.value)
                                    }
                                    className="bg-dark-100 border border-dark-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeSlot(day, idx)}
                                    aria-label="Supprimer le créneau"
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
                ) : (
                  <div className="space-y-1 text-sm text-muted">
                    {DAY_KEYS.filter((d) => availability[d].enabled).length ===
                    0 ? (
                      <p>Aucun créneau renseigné.</p>
                    ) : (
                      DAY_KEYS.filter((d) => availability[d].enabled).map(
                        (day) => (
                          <p key={day}>
                            <span className="text-foreground">
                              {DAY_LABELS[day]}
                            </span>{" "}
                            :{" "}
                            {availability[day].slots.length > 0
                              ? availability[day].slots
                                  .map((s) => `${s.start}–${s.end}`)
                                  .join(", ")
                              : "—"}
                          </p>
                        )
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                onClick={handleCancel}
                leftIcon={<X className="h-4 w-4" />}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                isLoading={isSaving}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Sauvegarder
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              leftIcon={<Edit2 className="h-4 w-4" />}
            >
              Modifier
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          className="text-error"
          onClick={handleDeleteProfile}
        >
          Supprimer le profil
        </Button>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
