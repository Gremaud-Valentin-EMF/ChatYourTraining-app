"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  hideChevron?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
}

function Select({
  className,
  label,
  error,
  hint,
  options,
  placeholder,
  id,
  name,
  hideChevron,
  value = "",
  onChange,
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectId = id || label?.toLowerCase().replace(/\s/g, "-");
  const selectName = name || selectId;

  const selectedOption = options.find((o) => o.value === value);
  const displayValue = selectedOption?.label || "";

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [closeDropdown]);

  useEffect(() => {
    if (isOpen && listRef.current && focusedIndex >= 0) {
      const item = listRef.current.children[focusedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, focusedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
        const currentIdx = options.findIndex((o) => o.value === value);
        setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange?.(options[focusedIndex].value);
          closeDropdown();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  };

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-muted mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {/* Hidden input for form submission */}
        <input type="hidden" name={selectName} value={value} />
        <button
          type="button"
          id={selectId}
          onClick={() => {
            if (disabled) return;
            setIsOpen((prev) => !prev);
            if (!isOpen) {
              const currentIdx = options.findIndex((o) => o.value === value);
              setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
            }
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full px-4 py-3 bg-dark-100 border border-dark-200 rounded-xl",
            "text-foreground cursor-pointer text-left",
            "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-error focus:border-error focus:ring-error",
            className
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={disabled}
        >
          <span className={cn(!displayValue && placeholder && "text-muted")}>
            {displayValue || placeholder || "Sélectionner..."}
          </span>
          {!hideChevron && (
            <ChevronDown
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          )}
        </button>

        {isOpen && (
          <ul
            ref={listRef}
            role="listbox"
            className="absolute z-50 mt-1 w-full bg-dark-50 border border-dark-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isFocused = index === focusedIndex;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange?.(option.value);
                    closeDropdown();
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={cn(
                    "px-4 py-2 text-sm cursor-pointer transition-colors",
                    isSelected
                      ? "bg-accent/20 text-accent"
                      : isFocused
                      ? "bg-dark-100"
                      : "hover:bg-dark-100"
                  )}
                >
                  {option.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export { Select };
