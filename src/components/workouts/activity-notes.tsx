"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Save } from "lucide-react";

/**
 * Self-contained notes editor for an activity. Keeps the textarea value in local
 * state so typing only re-renders this small component, not the (heavy) workout
 * detail page — keeping writing smooth. Persistence is delegated to `onSave`.
 */
export function ActivityNotes({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed when the saved value changes externally (e.g. RPE comment appended).
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(value);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-2xl border border-dark-200 bg-dark-100/50 px-4 py-3 text-sm text-foreground resize-y min-h-[88px] focus:outline-none focus:ring-2 focus:ring-accent"
        rows={3}
        placeholder="Notes/commentaires sur cette séance (exercices, sensations, contexte…)"
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={isSaving || value === initialValue}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Enregistrer
        </Button>
      </div>
    </>
  );
}
