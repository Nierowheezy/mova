// src/components/ui/Skeleton.tsx
// Reusable skeleton loaders for data pages. Compose the primitives to shape
// page-specific placeholders (text, cards, lists/tables).

import React from "react";

export interface SkeletonProps {
    className?: string;
    style?: React.CSSProperties;
}

/** Base pulsing placeholder block. Set width/height via className or style. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = "", style }) => (
    <div
        aria-hidden="true"
        className={`animate-pulse rounded-lg bg-gray-200/80 dark:bg-white/10 ${className}`}
        style={style}
    />
);

export interface SkeletonTextProps {
    /** Number of placeholder lines. */
    lines?: number;
    /** Width of the last (shorter) line, e.g. "60%". */
    lastWidth?: string;
    className?: string;
}

/** Multi-line text skeleton (e.g. for a stacked title + subtitle). */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
    lines = 2,
    lastWidth = "60%",
    className = "",
}) => (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
                key={i}
                className="h-3"
                {...(i === lines - 1 ? { style: { width: lastWidth } } : {})}
            />
        ))}
    </div>
);

export interface SkeletonCardProps {
    className?: string;
}

/** Card-shaped placeholder used while card content loads. */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = "" }) => (
    <div className={`card card-pad ${className}`} aria-hidden="true">
        <Skeleton className="mb-4 h-4 w-1/3" />
        <SkeletonText lines={3} lastWidth="40%" />
    </div>
);

export interface SkeletonListProps {
    /** Number of rows to render. */
    count?: number;
    className?: string;
}

/** Row-based placeholder for lists and tables (avatar + two text lines). */
export const SkeletonList: React.FC<SkeletonListProps> = ({ count = 4, className = "" }) => (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-gray-100 p-4 dark:border-white/10"
            >
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
            </div>
        ))}
    </div>
);