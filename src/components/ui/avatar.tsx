"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, src, alt = "Avatar", fallback, size = "md", ...props },
    ref
  ) => {
    const sizes = {
      sm: "h-8 w-8 text-xs",
      md: "h-10 w-10 text-sm",
      lg: "h-12 w-12 text-base",
      xl: "h-16 w-16 text-lg",
    };

    const getInitials = (name: string) => {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-full overflow-hidden bg-dark-200 flex items-center justify-center",
          sizes[size],
          className
        )}
        {...props}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : fallback ? (
          <span className="font-medium text-accent">
            {getInitials(fallback)}
          </span>
        ) : (
          <User className="h-1/2 w-1/2 text-muted" />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export { Avatar };
