"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "error";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value,
      max = 100,
      variant = "default",
      size = "md",
      showLabel = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const variants = {
      default: "bg-accent",
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-error",
    };

    const sizes = {
      sm: "h-1",
      md: "h-2",
      lg: "h-3",
    };

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {showLabel && (
          <div className="flex justify-between text-sm text-muted mb-1">
            <span>{value}</span>
            <span>{max}</span>
          </div>
        )}
        <div
          className={cn(
            "w-full bg-dark-200 rounded-full overflow-hidden",
            sizes[size]
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              variants[variant]
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = "Progress";

export { Progress };
