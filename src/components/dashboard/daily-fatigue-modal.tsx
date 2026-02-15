"use client";

import { useState } from "react";
import { Modal, Button, Slider } from "@/components/ui";
import { Activity, Heart } from "lucide-react";

interface DailyFatigueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fatigue: number) => Promise<void>;
}

export function DailyFatigueModal({
  isOpen,
  onClose,
  onSave,
}: DailyFatigueModalProps) {
  const [fatigue, setFatigue] = useState(5);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(fatigue);
      onClose();
    } catch (error) {
      console.error("Error saving fatigue:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const fatigueLabels: Record<number, { label: string; color: string }> = {
    1: { label: "Très reposé", color: "text-green-500" },
    2: { label: "Bien reposé", color: "text-green-400" },
    3: { label: "Reposé", color: "text-blue-400" },
    4: { label: "Normal", color: "text-blue-300" },
    5: { label: "Légèrement fatigué", color: "text-yellow-400" },
    6: { label: "Fatigué", color: "text-yellow-500" },
    7: { label: "Assez fatigué", color: "text-orange-400" },
    8: { label: "Très fatigué", color: "text-orange-500" },
    9: { label: "Épuisé", color: "text-red-400" },
    10: { label: "Extrêmement épuisé", color: "text-red-500" },
  };

  const currentLabel = fatigueLabels[fatigue];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkip}
      title="Bonjour ! Comment vous sentez-vous aujourd'hui ?"
      size="lg"
    >
      <div className="space-y-6">
        {/* Icon Header */}
        <div className="flex items-center justify-center gap-3 p-4 bg-gradient-to-br from-accent/20 to-accent/5 rounded-xl border border-accent/30">
          <div className="h-14 w-14 rounded-full bg-accent/20 flex items-center justify-center">
            <Heart className="h-7 w-7 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-lg">Niveau de fatigue</p>
            <p className="text-xs text-muted">Première visite de la journée</p>
          </div>
        </div>

        {/* Fatigue Section */}
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted mb-4">
              Indiquez votre niveau de fatigue actuel pour que le coach puisse adapter ses conseils.
            </p>
          </div>

          <div className="space-y-4">
            <Slider
              value={fatigue}
              onChange={(e) => setFatigue(Number(e.target.value))}
              min={1}
              max={10}
              step={1}
              showValue={false}
            />
            <div className="text-center">
              <span
                className={`inline-block px-4 py-2 bg-dark-100 rounded-xl font-semibold text-lg ${currentLabel.color}`}
              >
                {fatigue}/10 - {currentLabel.label}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-3 bg-dark-100 rounded-xl border border-dark-200">
            <div className="flex items-start gap-2">
              <Activity className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted">
                Cette information sera utilisée par l&apos;IA coach pour personnaliser ses recommandations d&apos;entraînement.
                Vous pourrez modifier cette valeur plus tard dans votre profil santé.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-dark-200">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="flex-1"
            disabled={isSaving}
          >
            Plus tard
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            className="flex-1"
            isLoading={isSaving}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
