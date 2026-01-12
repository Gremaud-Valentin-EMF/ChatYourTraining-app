"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, label, id, ...props }, ref) => {
    const toggleId = id || label?.toLowerCase().replace(/\s/g, "-");

    return (
      <label
        htmlFor={toggleId}
        className={cn(
          "inline-flex items-center gap-3 cursor-pointer",
          className
        )}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={toggleId}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              "w-11 h-6 bg-dark-200 rounded-full",
              "peer-checked:bg-accent",
              "peer-focus:ring-2 peer-focus:ring-accent/50",
              "transition-colors duration-200"
            )}
          />
          <div
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md",
              "peer-checked:translate-x-5",
              "transition-transform duration-200"
            )}
          />
        </div>
        {label && <span className="text-sm text-foreground">{label}</span>}
      </label>
    );
  }
);

Toggle.displayName = "Toggle";

export { Toggle };
