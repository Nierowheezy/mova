// src/components/ui/ErrorState.tsx
// Shared error state with an optional retry action. Used on data pages when
// the API call fails, so the user can recover instead of hitting a dead end.

import React from "react";
import { AlertTriangle } from "lucide-react";

export interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
    title = "Something went wrong",
    message,
    onRetry,
}) => (
    <div
        role="alert"
        className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center dark:border-rose-500/30 dark:bg-rose-500/10"
    >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle size={20} />
        </span>
        <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            {message && <div className="mt-1 text-sm text-gray-500 dark:text-white/50">{message}</div>}
        </div>
        {onRetry && (
            <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
                Try again
            </button>
        )}
    </div>
);