"use client"

import { TrendingUp, Battery, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"

interface RecoveryGaugeProps {
  score: number | null;
  average?: number | null;
  deltaPercent?: number | null;
  label?: string;
}

const getReadinessStatus = (
  deltaPercent: number | null
): {
  label: string;
  description: string;
  color: string;
  Icon: LucideIcon;
} => {
  if (deltaPercent === null) {
    return {
      label: "Pas assez de données",
      description: "Connectez une source pour suivre la tendance.",
      color: "text-muted",
      Icon: Info,
    };
  }
  if (deltaPercent <= -12) {
    return {
      label: "Alerte",
      description: "Sous la moyenne, privilégie la récup.",
      color: "text-error",
      Icon: AlertTriangle,
    };
  }
  if (deltaPercent <= -5) {
    return {
      label: "Surveiller",
      description: "Légèrement en dessous, allège la séance.",
      color: "text-warning",
      Icon: AlertTriangle,
    };
  }
  if (deltaPercent < 4) {
    return {
      label: "Bon jour",
      description: "Dans la moyenne, charge nominale.",
      color: "text-success",
      Icon: TrendingUp,
    };
  }
  return {
    label: "Boost",
    description: "Au-dessus de la moyenne, séance qualitative OK.",
    color: "text-success",
    Icon: CheckCircle2,
  };
};

export function RecoveryGauge({
  score,
  average,
  deltaPercent,
  label = "PRÊT",
}: RecoveryGaugeProps) {
  // Handle no data case
  if (score === null) {
    return (
      <Card className="flex flex-col items-center justify-center min-h-[350px]">
        <div className="flex items-center gap-2 mb-4 self-start p-6">
          <Battery className="h-4 w-4 text-muted" />
          <span className="text-sm text-muted uppercase tracking-wide">
            Récupération
          </span>
        </div>
        <div className="text-center py-8">
          <p className="text-muted text-sm">Aucune donnée de récupération</p>
          <p className="text-muted text-xs mt-1">
            Connectez WHOOP pour voir vos données
          </p>
        </div>
      </Card>
    );
  }

  // Determine color based on score
  const getColor = (score: number) => {
    if (score >= 67) return "var(--success)";
    if (score >= 34) return "var(--warning)";
    return "var(--error)";
  };
  
  const color = getColor(score);

  const chartData = [
    { name: "recovery", score: score, fill: "var(--color-recovery)" },
  ]

  const chartConfig = {
    score: {
      label: "Score",
    },
    recovery: {
      label: "Récupération",
      color: color,
    },
  } satisfies ChartConfig

  const status = getReadinessStatus(
    typeof deltaPercent === "number"
      ? Number(deltaPercent.toFixed(1))
      : null
  );

  const averageDisplay =
    average !== null && average !== undefined ? Math.round(average) : null;
  const deltaText =
    deltaPercent !== null && deltaPercent !== undefined
      ? `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`
      : null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Récupération</CardTitle>
        <CardDescription>Score du jour</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={270}
            endAngle={-90}
            innerRadius={80}
            outerRadius={110}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted/10 last:fill-transparent"
              polarRadius={[86, 74]}
            />
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="score" background cornerRadius={10} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-4xl font-bold"
                        >
                          {score.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className={`text-xs font-medium ${
                            score >= 67
                              ? "fill-green-400"
                              : score >= 34
                              ? "fill-yellow-400"
                              : "fill-red-400"
                          }`}
                        >
                          {label}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className={`flex items-center gap-2 leading-none font-medium ${status.color}`}>
          {status.label} <status.Icon className="h-4 w-4" />
        </div>
        <div className="text-muted leading-none text-center text-xs">
          {averageDisplay !== null && deltaText
          ? `${deltaText} vs moyenne (${averageDisplay}%)`
          : "Historique insuffisant"}
        </div>
        <div
          className={`leading-none text-center text-xs mt-1 ${
            score >= 67
              ? "text-green-400"
              : score >= 34
              ? "text-yellow-400"
              : "text-red-400"
          }`}
        >
            {status.description}
        </div>
      </CardFooter>
    </Card>
  )
}
