"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Button,
  Input,
  Slider,
  Toggle,
  Avatar,
  Spinner,
} from "@/components/ui";
import { Settings, Bell, Edit2, Save, X } from "lucide-react";

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
  id: string;
  sport_id: string;
  sport_name: string;
  level: string;
  vma_kmh: number | null;
  ftp_watts: number | null;
  target_hours_per_week: number | null;
}

type SportRow = {
  id: string;
  sport_id: string;
  level: string;
  vma_kmh: number | null;
  ftp_watts: number | null;
  target_hours_per_week: number | null;
  sports?: { name: string; name_fr: string } | null;
};

export default function ProfilePage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
  const [targetHours, setTargetHours] = useState(12);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Notifications settings
  const [notifications, setNotifications] = useState({
    trainingReminders: true,
    coachFeedback: true,
    weeklyDigest: false,
  });

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
      // Load all profile data
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

      if (profileRes.data) {
        setProfile({
          id: profileRes.data.id,
          full_name: profileRes.data.full_name || "",
          email: profileRes.data.email,
          avatar_url: profileRes.data.avatar_url,
        });
        setAvatarPreview(profileRes.data.avatar_url || null);
      }

      if (physioRes.data) {
        setPhysio({
          weight_kg: physioRes.data.weight_kg,
          height_cm: physioRes.data.height_cm,
          hr_max: physioRes.data.hr_max,
          hr_rest: physioRes.data.hr_rest,
          lthr: physioRes.data.lthr ?? null,
          birth_date: physioRes.data.birth_date,
        });
      }

      if (sportsRes.data) {
        const typedSports = sportsRes.data as SportRow[];
        setSports(
          typedSports.map((s) => ({
            id: s.id,
            sport_id: s.sport_id,
            sport_name: s.sports?.name_fr || "Sport",
            level: s.level,
            vma_kmh: s.vma_kmh,
            ftp_watts: s.ftp_watts,
            target_hours_per_week: s.target_hours_per_week,
          }))
        );

        if (typedSports[0]?.target_hours_per_week) {
          setTargetHours(typedSports[0].target_hours_per_week);
        }
      }

    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Update profile
      await supabase
        .from("users")
        .update({
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
        })
        .eq("id", user.id);

      // Update physio data
      await supabase.from("physiological_data").upsert(
        {
         user_id: user.id,
         weight_kg: physio.weight_kg,
         height_cm: physio.height_cm,
         hr_max: physio.hr_max,
         hr_rest: physio.hr_rest,
         lthr: physio.lthr,
        },
        { onConflict: "user_id" }
      );

      // Update target hours for sports
      for (const sport of sports) {
        await supabase
          .from("user_sports")
          .update({ target_hours_per_week: targetHours })
          .eq("id", sport.id);
      }

      setIsEditing(false);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
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
              <Bell className="h-5 w-5 text-accent" />
              <h3 className="font-semibold">Notifications</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Restez informé de votre progression
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-100 rounded-xl">
                <div>
                  <p className="font-medium">Rappels d&apos;entraînement</p>
                  <p className="text-sm text-muted">
                    Recevoir une notification 1h avant la séance
                  </p>
                </div>
                <Toggle
                  checked={notifications.trainingReminders}
                  onChange={(e) =>
                    setNotifications((n) => ({
                      ...n,
                      trainingReminders: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-dark-100 rounded-xl">
                <div>
                  <p className="font-medium">Feedback du Coach</p>
                  <p className="text-sm text-muted">
                    Notification immédiate lors d&apos;un commentaire
                  </p>
                </div>
                <Toggle
                  checked={notifications.coachFeedback}
                  onChange={(e) =>
                    setNotifications((n) => ({
                      ...n,
                      coachFeedback: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-dark-100 rounded-xl">
                <div>
                  <p className="font-medium">Résumé Hebdomadaire</p>
                  <p className="text-sm text-muted">
                    Bilan par email chaque lundi matin
                  </p>
                </div>
                <Toggle
                  checked={notifications.weeklyDigest}
                  onChange={(e) =>
                    setNotifications((n) => ({
                      ...n,
                      weeklyDigest: e.target.checked,
                    }))
                  }
                />
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
                onClick={() => setIsEditing(false)}
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
    </div>
  );
}
