import { WeatherIcon } from "./weather-icon";

interface WeatherDayBadgeProps {
  iconCode: string;
  tempMax: number;
  tempMin?: number;
  precipMm?: number;
  compact?: boolean;
}

export function WeatherDayBadge({
  iconCode,
  tempMax,
  tempMin,
  precipMm,
  compact = false,
}: WeatherDayBadgeProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted">
        <WeatherIcon code={iconCode} className="h-3.5 w-3.5" />
        <span>{Math.round(tempMax)}°</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <WeatherIcon code={iconCode} className="h-4 w-4" />
      <span>
        {Math.round(tempMax)}°
        {tempMin !== undefined && ` / ${Math.round(tempMin)}°`}
      </span>
      {precipMm && precipMm > 0 && (
        <span className="text-blue-400">{precipMm.toFixed(1)}mm</span>
      )}
    </div>
  );
}
