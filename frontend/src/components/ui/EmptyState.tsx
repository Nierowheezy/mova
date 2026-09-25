// src/components/ui/EmptyState.tsx
// Shared empty state (no data / no results) using the Mova `.empty-state`
// tokens so it matches inline empty states already used across pages.

import React, { type ReactNode } from "react";

export interface EmptyStateProps {
    icon?: ReactNode;
    title?: string;
    message?: string;
    action?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon = "◌",
    title = "Nothing here yet",
    message,
    action,
}) => (
    <div className="empty-state">
        <span className="empty-icon">{icon}</span>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{title}</div>
        {message && <div className="small subdued">{message}</div>}
        {action && <div style={{ marginTop: "var(--sp-2)" }}>{action}</div>}
    </div>
);