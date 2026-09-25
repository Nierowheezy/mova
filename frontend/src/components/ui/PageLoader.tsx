// src/components/ui/PageLoader.tsx
// Full-area / inline loading placeholder used as the route-level Suspense
// fallback and for page-level data loading.

import React from "react";
import { Spinner } from "./Spinner";

export interface PageLoaderProps {
    label?: string;
    /** `true` reserves dashboard-style vertical space; `false` is compact. */
    full?: boolean;
}

export const PageLoader: React.FC<PageLoaderProps> = ({ label = "Loading…", full = true }) => (
    <div
        className={`flex flex-col items-center justify-center gap-3 text-sm text-gray-500 dark:text-white/50 ${full ? "min-h-[55vh]" : "py-12"}`}
        role="status"
        aria-live="polite"
    >
        <Spinner size={28} />
        <span>{label}</span>
    </div>
);