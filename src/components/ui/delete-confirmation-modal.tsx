"use client";

import { Button } from "./button";
import { Modal } from "./modal";
import { Trash } from "lucide-react";

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export const DeleteConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = "Confirmer la suppression",
  description = "Cette action est irréversible. La séance et ses données seront supprimées.",
  confirmLabel = "Supprimer",
}: DeleteConfirmationModalProps) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
    <p className="text-sm text-muted mb-4">{description}</p>
    <div className="flex justify-end gap-3">
      <Button variant="ghost" size="sm" onClick={onClose}>
        Annuler
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={onConfirm}
        isLoading={isLoading}
        leftIcon={<Trash className="h-4 w-4" />}
      >
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);
