import { useCallback, useEffect, useState } from "react";

/** Mova theme modes: light, dark, or follow the OS (system). */
export type Theme = "light" | "dark" | "system";

const THEME_KEY = "mova-theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** Resolve a stored preference to the effective color scheme. */
const resolve = (theme: Theme): "light" | "dark" => {
    if (theme === "system") {
        if (typeof window !== "undefined" && window.matchMedia(SYSTEM_DARK).matches) return "dark";
        return "light";
    }
    return theme;
};

/** Read the persisted preference (falls back to system). */
const readStored = (): Theme => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
};

/**
 * Mova theme hook — 3 modes (light / dark / system) persisted under
 * `mova-theme`. Applies BOTH the `data-theme` attribute (drives the mova.css
 * token sets) and the `dark` class (drives Tailwind's `dark:` variant) so the
 * design system and utilities always agree.
 */
export const useTheme = () => {
    const [theme, setThemeState] = useState<Theme>(readStored);

    // Apply the effective scheme to <html> whenever the preference changes.
    useEffect(() => {
        const apply = () => {
            const root = document.documentElement;
            const effective = resolve(theme);

            // mova.css: `data-theme` pins light/dark; removing it lets the
            // system media query take over (system mode).
            if (theme === "system") root.removeAttribute("data-theme");
            else root.setAttribute("data-theme", theme);

            // Tailwind `dark:` variant follows the effective scheme.
            root.classList.toggle("dark", effective === "dark");

            // Keep native form controls / scrollbars in sync too.
            root.style.colorScheme = effective;
        };

        apply();

        // In system mode, react to OS changes live.
        const mql = window.matchMedia(SYSTEM_DARK);
        const onChange = () => {
            if (readStored() === "system") apply();
        };
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [theme]);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        localStorage.setItem(THEME_KEY, next);
    }, []);

    /** Convenience: cycle light → dark → system → light. */
    const toggleTheme = useCallback(() => {
        setThemeState((prev) => {
            const next: Theme = prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
            localStorage.setItem(THEME_KEY, next);
            return next;
        });
    }, []);

    return {
        theme,
        setTheme,
        toggleTheme,
        /** The scheme currently in effect (useful for icon swaps). */
        resolved: resolve(theme),
    };
};
