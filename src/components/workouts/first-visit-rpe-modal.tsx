"use client";

import { useState } from "react";
import { Modal, Button, Slider } from "@/components/ui";
import { Activity } from "lucide-react";

interface FirstVisitRpeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { rpe: number; comment: string }) => Promise<void>;
  activityTitle: string;
  sportColor?: string;
}

export function FirstVisitRpeModal({
  isOpen,
  onClose,
  onSave,
  activityTitle,
  sportColor = "#3b82f6",
}: FirstVisitRpeModalProps) {
  const [rpe, setRpe] = useState(5);
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ rpe, comment });
      onClose();
    } catch (error) {
      console.error("Error saving RPE:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const rpeLabels: Record<number, string> = {
    1: "Très facile",
    2: "Facile",
    3: "Modéré",
    4: "Un peu difficile",
    5: "Difficile",
    6: "Difficile",
    7: "Très difficile",
    8: "Très difficile",
    9: "Extrêmement difficile",
    10: "Maximum",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkip}
      title="Comment s'est passé votre entraînement ?"
      size="lg"
    >
      <div className="space-y-6">
        {/* Activity Info */}
        <div className="flex items-center gap-3 p-4 bg-dark-100 rounded-xl border border-dark-200">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${sportColor}30` }}
          >
            <Activity className="h-6 w-6" style={{ color: sportColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{activityTitle}</p>
            <p className="text-xs text-muted">Séance terminée</p>
          </div>
        </div>

        {/* RPE Section */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">
              Ressenti de l&apos;effort (RPE)
            </label>
            <p className="text-xs text-muted mb-4">
              Sur une échelle de 1 à 10, comment avez-vous perçu l&apos;intensité de cette séance ?
            </p>
          </div>

          <div className="space-y-4">
            <Slider
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              min={1}
              max={10}
              step={1}
              showValue={true}
            />
            <div className="text-center">
              <span className="inline-block px-4 py-2 bg-accent/20 text-accent rounded-xl font-semibold">
                {rpe}/10 - {rpeLabels[rpe]}
              </span>
            </div>
          </div>
        </div>

        {/* Comment Section */}
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Commentaire (optionnel)
          </label>
          <textarea
            className="w-full px-3 py-2 bg-dark-100 border border-dark-200 rounded-xl text-sm resize-none focus:border-accent focus:outline-none min-h-[100px]"
            placeholder="Comment vous êtes-vous senti pendant la séance ? Des difficultés ? Des réussites ?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted">
            Ce commentaire sera ajouté à la description de votre séance et sera visible par l&apos;IA coach.
          </p>
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
