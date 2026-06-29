"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastData {
  message: string;
  type?: ToastType;
}

export interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
  /** Auto-dismiss delay in ms. Set to 0 to disable. */
  duration?: number;
}

const STYLES: Record<ToastType, { box: string; icon: typeof CheckCircle2 }> = {
  success: {
    box: "bg-success/10 border-success/20 text-success",
    icon: CheckCircle2,
  },
  error: {
    box: "bg-error/10 border-error/20 text-error",
    icon: AlertTriangle,
  },
  info: {
    box: "bg-dark-100 border-dark-200 text-foreground",
    icon: Info,
  },
};

function Toast({ toast, onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    if (!toast || duration === 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, duration, onClose]);

  if (!toast) return null;

  const { box, icon: Icon } = STYLES[toast.type ?? "success"];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[100]"
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm max-w-sm",
          box
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { Toast };
