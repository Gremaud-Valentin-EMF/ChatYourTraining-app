"use client";

import { Card, Badge } from "@/components/ui";
import { Flag, Calendar } from "lucide-react";
import { daysUntil } from "@/lib/utils";

interface NextObjectiveProps {
  name: string;
  date: string;
  priority: "A" | "B" | "C";
}

export function NextObjective({ name, date, priority }: NextObjectiveProps) {
  const days = daysUntil(date);
  const formattedDate = new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const priorityColors = {
    A: "bg-accent",
    B: "bg-secondary",
    C: "bg-muted",
  };

  return (
    <Card className="bg-gradient-to-br from-secondary/20 to-accent/10 border-secondary/30">
      <div className="flex items-center gap-2 mb-3">
        <Flag className="h-4 w-4 text-muted" />
        <span className="text-xs text-muted uppercase tracking-wide">
          Prochain Objectif
        </span>
      </div>

      <h3 className="text-lg font-bold mb-1">{name}</h3>

      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <Calendar className="h-4 w-4" />
        <span>{formattedDate}</span>
        <Badge variant="default" size="sm" className={priorityColors[priority]}>
          Course {priority}
        </Badge>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-accent">{days}</span>
        <span className="text-muted">Jours restants</span>
      </div>
    </Card>
  );
}
