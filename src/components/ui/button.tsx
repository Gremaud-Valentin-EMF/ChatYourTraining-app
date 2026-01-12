"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary:
        "bg-accent text-dark hover:bg-accent-600 focus:ring-accent shadow-glow hover:shadow-glow-lg",
      secondary:
        "bg-dark-100 text-foreground border border-dark-200 hover:bg-dark-200 hover:border-dark-300 focus:ring-dark-300",
      ghost:
        "bg-transparent text-foreground hover:bg-dark-100 focus:ring-dark-200",
      danger: "bg-error text-white hover:bg-error-600 focus:ring-error",
      outline:
        "bg-transparent text-accent border border-accent hover:bg-accent/10 focus:ring-accent",
    };

    const sizes = {
      sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
      md: "h-10 px-4 text-sm gap-2 rounded-xl",
      lg: "h-12 px-6 text-base gap-2 rounded-xl",
      icon: "h-10 w-10 rounded-xl",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
        {size !== "icon" && children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
