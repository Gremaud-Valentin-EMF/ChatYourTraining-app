"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      label,
      showValue = true,
      valueFormatter = (v) => String(v),
      id,
      value,
      min = 0,
      max = 100,
      ...props
    },
    ref
  ) => {
    const sliderId = id || label?.toLowerCase().replace(/\s/g, "-");
    const percentage =
      ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;

    return (
      <div className="w-full">
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-2">
            {label && (
              <label
                htmlFor={sliderId}
                className="text-sm font-medium text-muted"
              >
                {label}
              </label>
            )}
            {showValue && (
              <span className="text-sm font-medium text-accent">
                {valueFormatter(Number(value))}
              </span>
            )}
          </div>
        )}
        <div className="relative">
          <input
            ref={ref}
            type="range"
            id={sliderId}
            value={value}
            min={min}
            max={max}
            className={cn(
              "w-full h-2 rounded-full appearance-none cursor-pointer",
              "bg-dark-200",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-4",
              "[&::-webkit-slider-thumb]:h-4",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-accent",
              "[&::-webkit-slider-thumb]:shadow-glow",
              "[&::-webkit-slider-thumb]:cursor-pointer",
              "[&::-webkit-slider-thumb]:transition-transform",
              "[&::-webkit-slider-thumb]:hover:scale-110",
              "[&::-moz-range-thumb]:w-4",
              "[&::-moz-range-thumb]:h-4",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-accent",
              "[&::-moz-range-thumb]:border-0",
              "[&::-moz-range-thumb]:cursor-pointer",
              className
            )}
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percentage}%, var(--dark-200) ${percentage}%, var(--dark-200) 100%)`,
            }}
            {...props}
          />
        </div>
      </div>
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
