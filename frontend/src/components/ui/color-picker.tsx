"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function isValidHex(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

function normalizeHex(value: string): string {
  const stripped = value.startsWith("#") ? value : `#${value}`;
  return stripped.toUpperCase();
}

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export function ColorPicker({ value, onChange, label, className }: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const nativeRef = React.useRef<HTMLInputElement>(null);

  // Keep input in sync when value prop changes externally
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    setInputValue(hex);
    onChange(hex);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    const withHash = raw.startsWith("#") ? raw : `#${raw}`;
    if (isValidHex(withHash)) {
      onChange(normalizeHex(withHash));
    }
  };

  const handleTextBlur = () => {
    const withHash = inputValue.startsWith("#") ? inputValue : `#${inputValue}`;
    if (isValidHex(withHash)) {
      setInputValue(normalizeHex(withHash));
    } else {
      // Revert to last valid value
      setInputValue(value);
    }
  };

  const swatchColor = isValidHex(inputValue.startsWith("#") ? inputValue : `#${inputValue}`)
    ? (inputValue.startsWith("#") ? inputValue : `#${inputValue}`)
    : value;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      )}
      <div className="flex items-center gap-2">
        {/* Colour swatch — clicking opens native picker */}
        <button
          type="button"
          className="relative h-9 w-9 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0 overflow-hidden focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
          onClick={() => nativeRef.current?.click()}
          style={{ backgroundColor: swatchColor }}
          aria-label="Pick colour"
        >
          {/* Invisible native input layered over swatch */}
          <input
            ref={nativeRef}
            type="color"
            value={isValidHex(value) ? value : "#7C3AED"}
            onChange={handleNativeChange}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            tabIndex={-1}
          />
        </button>

        {/* Hex text input */}
        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 px-2.5 h-9 gap-1 flex-1">
          <span className="text-gray-400 dark:text-gray-500 text-sm select-none">#</span>
          <input
            type="text"
            value={inputValue.startsWith("#") ? inputValue.slice(1) : inputValue}
            onChange={(e) => handleTextChange({ ...e, target: { ...e.target, value: `#${e.target.value}` } })}
            onBlur={handleTextBlur}
            maxLength={6}
            placeholder="7C3AED"
            className="flex-1 bg-transparent text-sm font-mono text-gray-900 dark:text-white focus:outline-none uppercase placeholder:text-gray-300 dark:placeholder:text-gray-600 min-w-0"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
