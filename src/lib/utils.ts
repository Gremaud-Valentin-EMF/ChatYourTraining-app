import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}

export function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

export function getRecoveryColor(score: number): string {
  if (score >= 67) return "text-success";
  if (score >= 34) return "text-warning";
  return "text-error";
}

export function getRecoveryLabel(score: number): string {
  if (score >= 67) return "Optimal";
  if (score >= 34) return "Modéré";
  return "Faible";
}

export function getTSBLabel(tsb: number): string {
  if (tsb > 25) return "Très frais";
  if (tsb > 5) return "Frais";
  if (tsb > -10) return "Optimal";
  if (tsb > -30) return "Fatigué";
  return "Épuisé";
}

export function getTSBColor(tsb: number): string {
  if (tsb > 25) return "text-secondary";
  if (tsb > 5) return "text-success";
  if (tsb > -10) return "text-accent";
  if (tsb > -30) return "text-warning";
  return "text-error";
}

export function getSportIcon(sport: string): string {
  const icons: Record<string, string> = {
    running: "🏃",
    cycling: "🚴",
    swimming: "🏊",
    strength: "💪",
    triathlon: "🏊‍♂️🚴🏃",
    other: "⚡",
  };
  return icons[sport] || icons.other;
}

export function getSportColor(sport: string): string {
  const colors: Record<string, string> = {
    running: "#00d4aa",
    cycling: "#3b82f6",
    swimming: "#06b6d4",
    strength: "#f59e0b",
    triathlon: "#8b5cf6",
    other: "#6b7280",
  };
  return colors[sport] || colors.other;
}

export function daysUntil(dateString: string): number {
  const targetDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function formatDateFr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
