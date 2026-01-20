import * as LucideIcons from "lucide-react";
import { Activity } from "lucide-react";
import type { ElementType } from "react";

const formatIconName = (icon?: string) => {
  if (!icon) return "";
  return icon
    .replace(/[_\s]+/g, "-")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

export function getSportIconComponent(icon?: string): ElementType {
  const formatted = formatIconName(icon);
  if (!formatted) return Activity;
  // cast to unknown first to avoid incompatible exported members like createLucideIcon
  const IconComponent = (LucideIcons as unknown as Record<string, ElementType>)[formatted];
  return IconComponent || Activity;
}
