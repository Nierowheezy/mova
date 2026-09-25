// src/components/ui/Spinner.tsx
// Shared theme-aware spinner (matches the app's existing border spinner).

import React from "react";

export interface SpinnerProps {
    /** Diameter in pixels. */
    size?: number;
    className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 20, className = "" }) => (
    <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-white/20 dark:border-t-white ${className}`}
        style={{ width: size, height: size }}
    />
);