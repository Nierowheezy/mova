import { useEffect, useRef, useState } from "react";
import { Sun } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/useTheme";

const OPTIONS: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

/**
 * Mova theme switcher — Vercel-style: a single icon button that opens a
 * small popover with Light / Dark / System. Markup follows the prototype's
 * `.ts-wrap` / `.ts-btn` / `.ts-popover` / `.ts-option` classes.
 */
export default function ThemeToggleButton() {
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div className="ts-wrap" ref={ref}>
            <button
                type="button"
                className="ts-btn"
                aria-label="Theme"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <Sun aria-hidden="true" />
            </button>
            <div className={`ts-popover ${open ? "open" : ""}`} role="menu">
                <div className="ts-label">Appearance</div>
                {OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={`ts-option ${theme === opt.value ? "active" : ""}`}
                        data-theme-choice={opt.value}
                        role="menuitem"
                        aria-selected={theme === opt.value}
                        onClick={() => {
                            setTheme(opt.value);
                            setOpen(false);
                        }}
                    >
                        <svg className="ts-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                        {opt.label}
                    </button>
                ))}
                <div className="ts-divider" />
                <button
                    type="button"
                    className={`ts-option ${theme === "system" ? "active" : ""}`}
                    data-theme-choice="system"
                    role="menuitem"
                    aria-selected={theme === "system"}
                    onClick={() => {
                        setTheme("system");
                        setOpen(false);
                    }}
                >
                    <svg className="ts-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    System
                </button>
            </div>
        </div>
    );
}